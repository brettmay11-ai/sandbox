const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Add PostgreSQL to the Railway project.');

const pool = new Pool({
  connectionString: databaseUrl,
  ...(process.env.PGSSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map(value => value.trim().split('=').map(decodeURIComponent))
      .filter(parts => parts.length === 2)
  );
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function getSessionUser(request) {
  const token = parseCookies(request).nfl_session;
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id,u.username,u.display_name,u.role,u.class_id
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,
    [tokenHash(token)]
  );
  return result.rows[0] || null;
}

function redirect(response, location) {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  response.end();
}

function headerDashboardButton() {
  return '<a href="/teacher?page=dashboard" class="px-3 py-2 text-xs bg-blue-500/15 text-blue-200 border border-blue-400/20 rounded-lg">Class Dashboard <span id="teacher-dashboard-class-name" class="text-blue-100/70">—</span></a>';
}

function teacherDashboardScript() {
  return `<script>
async function loadTeacherDashboardClassName(){
  const label=document.getElementById('teacher-dashboard-class-name');
  const title=document.getElementById('teacher-dashboard-panel-class-name');
  try{
    const response=await fetch('/api/me',{headers:{'Content-Type':'application/json'}});
    const data=await response.json();
    const className=data && data.user && data.user.className ? data.user.className : 'Class';
    if(label) label.textContent='• '+className;
    if(title) title.textContent=className;
  }catch(error){
    if(label) label.textContent='• Class';
    if(title) title.textContent='Class';
  }
}
window.addEventListener('DOMContentLoaded',loadTeacherDashboardClassName);
</script>`;
}

function transformTeacherHtml(html) {
  let output = html;
  output = output.replace('id="teacher-command-center" data-teacher-page="students"', 'id="teacher-command-center" data-teacher-page="dashboard"');
  output = output.replace('<details class="teacher-secondary-panel" data-teacher-page="students">', '<details id="student-management" open class="teacher-secondary-panel" data-teacher-page="students">');
  output = output.replace('Manage students</span><small>Create accounts, assign teams, and update access</small>', 'Students <span id="teacher-dashboard-panel-class-name" class="text-blue-300 text-sm ml-2">Class</span></span><small>Create accounts, assign teams, and update access</small>');
  output = output.replace('<a href="/" class="px-3 py-2 text-xs bg-white/5 rounded-lg">Open Student Site</a>', `${headerDashboardButton()}<a href="/" class="px-3 py-2 text-xs bg-white/5 rounded-lg">Open Student Site</a>`);
  output = output.replace('</body></html>', `${teacherDashboardScript()}</body></html>`);
  return output;
}

function transformStudentHtml(html) {
  let output = html;
  output = output.replace("'cities', 'tcu'", "'cities'");
  output = output.replace(/,\s*'tcu'/g, '');
  output = output.replace(/html\[data-portal-page="tcu"\]\s+body>#TCU\{display:block\}\n?/g, '');
  output = output.replace(/<script[^>]+src=["']tcu-live\.js["'][^>]*><\/script>\s*/g, '');
  output = output.replace(/<script[^>]+src=["']tcu-travel\.js["'][^>]*><\/script>\s*/g, '');
  output = output.replace(/<script[^>]+src=["']tcu-travel-fixes\.js["'][^>]*><\/script>\s*/g, '');
  output = output.replace(/<a\b[^>]*(?:href=["'][^"']*page=tcu[^"']*["']|data-page=["']tcu["'])[^>]*>[\s\S]*?<\/a>/gi, '');
  output = output.replace(/<button\b[^>]*(?:data-page=["']tcu["']|data-nav=["']tcu["'])[^>]*>[\s\S]*?<\/button>/gi, '');
  output = output.replace(/<section\b[^>]*id=["']TCU["'][\s\S]*?<\/section>/i, '');
  output = output.replace('</body></html>', `<script>if(new URLSearchParams(location.search).get('page')==='tcu') location.replace('/');</script></body></html>`);
  return output;
}

function serveTeacherPortal(response) {
  const file = path.join(__dirname, 'teacher.html');
  const html = transformTeacherHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

function serveStudentPortal(response) {
  const file = path.join(__dirname, 'index.html');
  const html = transformStudentHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function createServerWithTeacherDashboard(listener) {
  return originalCreateServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(url.pathname);
      if ((pathname === '/teacher' || pathname === '/teacher.html') && request.method === 'GET') {
        const user = await getSessionUser(request);
        if (!user) return redirect(response, '/login');
        if (user.role !== 'teacher' && user.role !== 'super_admin') return redirect(response, '/');
        return serveTeacherPortal(response);
      }
      if ((pathname === '/' || pathname === '/index.html' || /^\/class\/\d+\/dashboard$/.test(pathname)) && request.method === 'GET') {
        const user = await getSessionUser(request);
        if (!user) return redirect(response, '/login');
        return serveStudentPortal(response);
      }
      return listener(request, response);
    } catch (error) {
      console.error('Teacher dashboard wrapper failed.', error);
      return listener(request, response);
    }
  });
};

require('./start');
