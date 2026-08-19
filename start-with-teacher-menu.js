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

function headerStudentManagementButton() {
  return '<button type="button" onclick="return openTeacherStudentManagement(event)" class="px-3 py-2 text-xs bg-blue-500/15 text-blue-200 border border-blue-400/20 rounded-lg">Manage Students</button>';
}

function studentManagementScript() {
  return `<script>
function openTeacherStudentManagement(event){
  if(event) event.preventDefault();
  const panel=document.getElementById('student-management')||document.querySelector('.teacher-secondary-panel');
  if(panel){
    panel.open=true;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  return false;
}
window.addEventListener('DOMContentLoaded',()=>{
  const params=new URLSearchParams(location.search);
  if(params.get('page')==='students') openTeacherStudentManagement();
});
</script>`;
}

function transformTeacherHtml(html) {
  let output = html;
  output = output.replace('<details class="teacher-secondary-panel" data-teacher-page="students">', '<details id="student-management" class="teacher-secondary-panel" data-teacher-page="students">');
  output = output.replace('<a href="/" class="px-3 py-2 text-xs bg-white/5 rounded-lg">Open Student Site</a>', `${headerStudentManagementButton()}<a href="/" class="px-3 py-2 text-xs bg-white/5 rounded-lg">Open Student Site</a>`);
  output = output.replace('</body></html>', `${studentManagementScript()}</body></html>`);
  return output;
}

function serveTeacherPortal(response) {
  const file = path.join(__dirname, 'teacher.html');
  const html = transformTeacherHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function createServerWithTeacherHeaderLink(listener) {
  return originalCreateServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
      if ((pathname === '/teacher' || pathname === '/teacher.html') && request.method === 'GET') {
        const user = await getSessionUser(request);
        if (!user) return redirect(response, '/login');
        if (user.role !== 'teacher' && user.role !== 'super_admin') return redirect(response, '/');
        return serveTeacherPortal(response);
      }
      return listener(request, response);
    } catch (error) {
      console.error('Teacher header link wrapper failed.', error);
      return listener(request, response);
    }
  });
};

require('./start');
