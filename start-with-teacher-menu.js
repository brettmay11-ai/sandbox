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

function teacherMenuMarkup() {
  return `
<nav class="teacher-top-menu" aria-label="Teacher tools">
  <a href="/teacher" class="teacher-top-menu-link">Dashboard</a>
  <a href="#student-management" class="teacher-top-menu-link teacher-top-menu-primary" onclick="return openTeacherStudentManagement(event)">Student Management</a>
  <a href="/teacher?page=writing" class="teacher-top-menu-link">Writing Review</a>
  <a href="/teacher?page=coach" class="teacher-top-menu-link">Coach Flags</a>
  <a href="/teacher?page=cleats" class="teacher-top-menu-link">Cleats</a>
</nav>
<script>
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

function teacherMenuStyles() {
  return `<style>
.teacher-top-menu{position:sticky;top:4rem;z-index:9;display:flex;gap:.5rem;align-items:center;overflow-x:auto;padding:.75rem 1.25rem;background:rgba(10,10,10,.92);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.1)}
.teacher-top-menu-link{white-space:nowrap;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);border-radius:999px;padding:.6rem .9rem;font-size:.75rem;font-weight:800;color:rgba(255,255,255,.82);text-decoration:none;transition:.18s ease}
.teacher-top-menu-link:hover{background:rgba(255,255,255,.1);color:#fff}
.teacher-top-menu-primary{background:rgba(37,99,235,.26);border-color:rgba(96,165,250,.52);color:#bfdbfe}
#student-management{scroll-margin-top:8.5rem}
@media(max-width:720px){.teacher-top-menu{top:4rem;padding:.65rem .8rem}.teacher-top-menu-link{font-size:.68rem;padding:.55rem .75rem}}
</style>`;
}

function transformTeacherHtml(html) {
  let output = html;
  output = output.replace('</style><link rel="stylesheet" href="visual-system.css">', `${teacherMenuStyles()}</style><link rel="stylesheet" href="visual-system.css">`);
  output = output.replace('<details class="teacher-secondary-panel" data-teacher-page="students">', '<details id="student-management" class="teacher-secondary-panel" data-teacher-page="students">');
  output = output.replace('</header>\n<main', `</header>${teacherMenuMarkup()}\n<main`);
  return output;
}

function serveTeacherPortal(response) {
  const file = path.join(__dirname, 'teacher.html');
  const html = transformTeacherHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function createServerWithTeacherTopMenu(listener) {
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
      console.error('Teacher menu wrapper failed.', error);
      return listener(request, response);
    }
  });
};

require('./start');
