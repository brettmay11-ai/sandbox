/* Signed-in student experience and lightweight engagement tracking. */
let portalUser = null;
let portalProgress = [];
const portalStartedAt = Date.now();

async function portalApi(url, options = {}) {
  const response = await fetch(url, { ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });
  if (response.status === 401) { window.location.href = '/login'; throw new Error('Please sign in.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function sendEngagement(event, durationSeconds = 0) {
  const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const body = JSON.stringify({ page, event, durationSeconds });
  if (navigator.sendBeacon && event === 'time_spent') navigator.sendBeacon('/api/engagement', new Blob([body], { type:'application/json' }));
  else fetch('/api/engagement', { method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true }).catch(() => {});
}

function applyAssignedTeamBranding() {
  if (portalUser.role !== 'student') return;
  const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(portalUser.selectedTeam) : null;
  const primary=team?.primary||'#013369',secondary=team?.secondary||'#D50A0A';
  const style=document.createElement('style');
  style.textContent=`:root{--student-team-primary:${primary};--student-team-secondary:${secondary}}body:before{content:'';position:fixed;z-index:60;top:0;left:0;right:0;height:3px;background:var(--student-team-secondary)}nav{border-bottom-color:${primary}!important}nav [aria-current="page"]{background:${primary}33!important;border-color:${secondary}88!important;color:#fff!important}.student-team-mark{background:${primary};border:1px solid ${secondary};color:#fff}.student-team-accent{border-color:${secondary}!important}`;
  document.head.appendChild(style);
  const brand=document.querySelector('nav > div:first-child');
  if(brand&&team){const label=document.createElement('span');label.className='hidden md:inline text-[10px] font-bold px-2 py-1 student-team-mark';label.textContent=team.abbr;label.title=team.name;brand.appendChild(label)}
}

function addAccountControls() {
  const nav = document.querySelector('nav');
  const right = nav?.lastElementChild;
  if (!right || document.getElementById('account-controls')) return;
  const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(portalUser.selectedTeam) : null;
  const teamBadge=portalUser.role==='student'?`<span title="${team?.name||'Your teacher will assign your team'}" class="student-team-mark px-2.5 h-8 flex items-center text-[10px] font-black">${team?.abbr||'TEAM PENDING'}</span>`:'';
  const controls = document.createElement('div');
  controls.id = 'account-controls';
  controls.className = 'shrink-0 flex items-center gap-2';
  controls.innerHTML = `${teamBadge}${portalUser.role === 'teacher' ? '<a href="/teacher" title="Teacher dashboard" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><iconify-icon icon="lucide:layout-dashboard"></iconify-icon></a>' : ''}<span class="hidden xl:inline text-[10px] text-white/45 max-w-[90px] truncate">${portalUser.displayName}</span><button id="portal-logout" title="Sign out" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/15 hover:text-red-300"><iconify-icon icon="lucide:log-out"></iconify-icon></button>`;
  right.appendChild(controls);
  controls.querySelector('#portal-logout').addEventListener('click', async () => { await portalApi('/api/logout', { method:'POST' }); window.location.href='/login'; });
}

function addProgressPanel() {
  if (portalUser.role !== 'student' || document.getElementById('student-progress-panel')) return;
  const currentPage = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const complete = portalProgress.some(item => item.page === currentPage && item.completed);
  const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(portalUser.selectedTeam) : null;
  const panel = document.createElement('div');
  panel.id = 'student-progress-panel';
  panel.className = 'fixed bottom-5 left-5 z-40 glass-panel rounded-xl p-3 flex items-center gap-3 shadow-xl student-team-accent';
  panel.innerHTML = `<div class="student-team-mark w-9 h-9 grid place-items-center text-[10px] font-black">${team?.abbr||'NFL'}</div><div><div class="text-[9px] text-white/35 uppercase tracking-wider">${team?.name||'Team assignment pending'}</div><div class="text-[11px] font-semibold">${complete ? 'Page completed' : 'Working on this page'}</div></div><button id="complete-page" class="w-9 h-9 rounded-lg flex items-center justify-center ${complete ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/60 hover:bg-green-500/20 hover:text-green-300'}" title="${complete ? 'Mark incomplete' : 'Mark complete'}"><iconify-icon icon="lucide:${complete ? 'check-circle-2' : 'circle'}"></iconify-icon></button>`;
  document.body.appendChild(panel);
  panel.querySelector('#complete-page').addEventListener('click', async () => { await portalApi('/api/progress', { method:'POST', body:JSON.stringify({ page:currentPage, completed:!complete }) }); sendEngagement(complete ? 'page_uncompleted' : 'page_completed'); window.location.reload(); });
}

async function initializeAccountExperience() {
  try {
    const [{ user }, progressData] = await Promise.all([portalApi('/api/me'), portalApi('/api/progress')]);
    portalUser = user; portalProgress = progressData.progress || [];
    applyAssignedTeamBranding(); addAccountControls(); addProgressPanel(); sendEngagement('page_view');
  } catch (error) { console.warn('Account experience could not initialize.', error); }
}

window.addEventListener('pagehide', () => sendEngagement('time_spent', Math.round((Date.now() - portalStartedAt) / 1000)));
initializeAccountExperience();
