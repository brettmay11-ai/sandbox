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

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
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
function installCleatProductionNotice(){
  const page=document.querySelector('[data-teacher-page="cleats"]');
  if(!page||document.getElementById('cleat-production-notice'))return;
  const notice=document.createElement('div');
  notice.id='cleat-production-notice';
  notice.className='mb-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-amber-100 shadow-lg';
  notice.innerHTML='<div class="flex items-start gap-3"><iconify-icon icon="lucide:construction" class="text-2xl text-amber-300"></iconify-icon><div><strong class="block text-sm uppercase tracking-[.18em] text-amber-200">Still in production</strong><p class="mt-1 text-sm text-amber-100/85">Cleat Studio is not live yet. This page is for internal previewing and testing only.</p></div></div>';
  page.prepend(notice);
}
window.addEventListener('DOMContentLoaded',()=>{
  loadTeacherDashboardClassName();
  installCleatProductionNotice();
});
</script>`;
}

function adminRefreshScript() {
  return `<script>
(function(){
  function showAdminRefreshMessage(message,isError){
    const toast=document.getElementById('toast');
    if(toast){
      toast.textContent=message;
      toast.className='fixed bottom-5 left-1/2 -translate-x-1/2 rounded-2xl border px-4 py-3 shadow-2xl text-sm '+(isError?'border-red-500/30 bg-red-950 text-red-100':'border-white/15 bg-slate-950 text-white');
      setTimeout(()=>toast.classList.add('panel-hidden'),3600);
      return;
    }
    alert(message);
  }
  async function refreshSiteData(){
    const button=document.getElementById('refresh');
    const original=button?button.innerHTML:'';
    if(button){button.disabled=true;button.innerHTML='<iconify-icon icon="lucide:loader-2"></iconify-icon>Refreshing Site Data...';}
    try{
      const response=await fetch('/api/admin/refresh-data',{method:'POST',headers:{'Content-Type':'application/json'}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Refresh failed.');
      showAdminRefreshMessage(data.message||'Site data refresh started. Fresh data will load on the next page views.');
      if(typeof loadAll==='function') await loadAll();
    }catch(error){
      showAdminRefreshMessage(error.message||'Could not refresh site data.',true);
    }finally{
      if(button){button.disabled=false;button.innerHTML=original||'<iconify-icon icon="lucide:refresh-cw"></iconify-icon>Refresh Data';}
    }
  }
  window.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('refresh');
    if(!button||button.dataset.siteRefreshInstalled)return;
    button.dataset.siteRefreshInstalled='true';
    button.title='Clear cached sports data so stats, schedules, news, standings, and featured-game data reload fresh.';
    button.addEventListener('click',event=>{event.preventDefault();refreshSiteData();},{capture:true});
  });
})();
</script>`;
}

function featuredGameSizingPatch() {
  return `<style id="featured-game-sizing-patch">
#featured .featured-content{overflow:visible!important}
#featured .featured-content *{min-width:0}
#featured [id^="featured-"]{max-width:100%;overflow-wrap:anywhere;word-break:normal;text-overflow:clip;white-space:normal}
#featured-away-name,#featured-home-name{font-size:clamp(2.5rem,7vw,6.75rem)!important;line-height:.92!important;overflow-wrap:normal;word-break:keep-all}
#featured-away-city,#featured-home-city,#featured-away-record,#featured-home-record{font-size:clamp(.75rem,1.45vw,1rem)!important;line-height:1.25!important;white-space:normal!important}
#featured-venue,#featured-location{display:block;max-width:100%;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important;overflow-wrap:anywhere}
#featured .glass-panel,#featured .fun-fact-card,#featured [class*="glass"],#featured [class*="rounded"]{min-width:0;overflow:visible}
#featured .grid,#featured [class*="grid"]{align-items:stretch}
@media(max-width:900px){
  #featured-away-name,#featured-home-name{font-size:clamp(2rem,13vw,4.25rem)!important;line-height:.96!important}
  #featured .featured-content{padding-left:1rem!important;padding-right:1rem!important}
}
@media(max-width:560px){
  #featured [class*="grid-cols"],#featured .grid{grid-template-columns:1fr!important}
  #featured-away-city,#featured-home-city,#featured-away-record,#featured-home-record,#featured-venue,#featured-location{font-size:.78rem!important}
}
</style>`;
}

function standingsAssets() {
  return '<link rel="stylesheet" href="standings-integration.css?v=1"><script defer src="standings-integration.js?v=1"></script>';
}

function studentTcuCleanupAssets() {
  return `<style id="remove-tcu-menu-patch">
a[href*="page=tcu"],button[data-page="tcu"],button[data-nav="tcu"],[data-page="tcu"],[data-nav="tcu"]{display:none!important}
</style><script id="remove-tcu-menu-script">
(function(){
  function removeTcuMenuItems(){
    document.querySelectorAll('a[href*="page=tcu"],button[data-page="tcu"],button[data-nav="tcu"],[data-page="tcu"],[data-nav="tcu"]').forEach(el=>el.remove());
    document.querySelectorAll('nav a,nav button,header a,header button,[role="navigation"] a,[role="navigation"] button').forEach(el=>{
      if((el.textContent||'').trim().toUpperCase()==='TCU')el.remove();
    });
  }
  window.addEventListener('DOMContentLoaded',removeTcuMenuItems);
  window.addEventListener('load',removeTcuMenuItems);
  new MutationObserver(removeTcuMenuItems).observe(document.documentElement,{childList:true,subtree:true});
})();
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

function transformAdminHtml(html) {
  let output = html;
  output = output.replace('</body></html>', `${adminRefreshScript()}</body></html>`);
  output = output.replace('</body>\n</html>', `${adminRefreshScript()}</body>\n</html>`);
  return output;
}

function transformStudentHtml(html) {
  let output = html;
  output = output.replace("'cities', 'tcu'", "'cities'");
  output = output.replace(/,\s*'tcu'/g, '');
  output = output.replace(/html\[data-portal-page="tcu"\]\s+body>#TCU\{display:block\}\n?/g, '');
  output = output.replace(/<a\b[^>]*(?:href=["'][^"']*page=tcu[^"']*["']|data-page=["']tcu["']|data-nav=["']tcu["'])[^>]*>[\s\S]*?<\/a>/gi, '');
  output = output.replace(/<button\b[^>]*(?:data-page=["']tcu["']|data-nav=["']tcu["'])[^>]*>[\s\S]*?<\/button>/gi, '');
  if (!output.includes('id="featured-game-sizing-patch"')) output = output.replace('</head>', `${featuredGameSizingPatch()}</head>`);
  if (!output.includes('standings-integration.js')) output = output.replace('</head>', `${standingsAssets()}</head>`);
  if (!output.includes('id="remove-tcu-menu-script"')) output = output.replace('</body></html>', `${studentTcuCleanupAssets()}</body></html>`).replace('</body>\n</html>', `${studentTcuCleanupAssets()}</body>\n</html>`);
  return output;
}

function serveTeacherPortal(response) {
  const file = path.join(__dirname, 'teacher.html');
  const html = transformTeacherHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

function serveAdminPortal(response) {
  const file = path.join(__dirname, 'admin.html');
  const html = transformAdminHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

function serveStudentPortal(response) {
  const file = path.join(__dirname, 'index.html');
  const html = transformStudentHtml(fs.readFileSync(file, 'utf8'));
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(html);
}

async function handleAdminRefreshData(request, response, pathname) {
  if (pathname !== '/api/admin/refresh-data') return false;
  const user = await getSessionUser(request);
  if (!user) { sendJson(response, 401, { error: 'Please sign in.' }); return true; }
  if (user.role !== 'super_admin') { sendJson(response, 403, { error: 'Super admin access required.' }); return true; }
  if (request.method !== 'POST') { sendJson(response, 405, { error: 'Method not allowed.' }); return true; }

  await pool.query(`CREATE TABLE IF NOT EXISTS sportsdata_cache(
    cache_key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  const deleted = await pool.query('DELETE FROM sportsdata_cache');
  sendJson(response, 200, {
    ok: true,
    refreshedAt: new Date().toISOString(),
    cacheEntriesCleared: deleted.rowCount || 0,
    message: 'Sports data cache cleared. Fresh stats, standings, schedules, news, and featured-game details will reload on the next site requests.'
  });
  return true;
}

const originalCreateServer = http.createServer.bind(http);
http.createServer = function createServerWithTeacherDashboard(listener) {
  return originalCreateServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(url.pathname);
      if (await handleAdminRefreshData(request, response, pathname)) return;
      if ((pathname === '/teacher' || pathname === '/teacher.html') && request.method === 'GET') {
        const user = await getSessionUser(request);
        if (!user) return redirect(response, '/login');
        if (user.role !== 'teacher' && user.role !== 'super_admin') return redirect(response, '/');
        return serveTeacherPortal(response);
      }
      if ((pathname === '/admin' || pathname === '/admin.html') && request.method === 'GET') {
        const user = await getSessionUser(request);
        if (!user) return redirect(response, '/login');
        if (user.role !== 'super_admin') return redirect(response, '/');
        return serveAdminPortal(response);
      }
      if (url.searchParams.get('page') === 'tcu' && request.method === 'GET') {
        return redirect(response, '/');
      }
      if ((pathname === '/' || pathname === '/index.html' || /^\/class\/\d+\/dashboard$/.test(pathname)) && request.method === 'GET') {
        const user = await getSessionUser(request);
        if (!user) return redirect(response, '/login');
        return serveStudentPortal(response);
      }
      return listener(request, response);
    } catch (error) {
      console.error('Teacher/admin wrapper failed.', error);
      if (!response.headersSent && request.url && request.url.startsWith('/api/admin/refresh-data')) {
        return sendJson(response, 500, { error: 'Could not refresh site data.' });
      }
      return listener(request, response);
    }
  });
};

require('./start');
