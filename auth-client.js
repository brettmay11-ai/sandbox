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

function addAccountControls() {
  const nav = document.querySelector('nav');
  const right = nav?.lastElementChild;
  if (!right || document.getElementById('account-controls')) return;
  const controls = document.createElement('div');
  controls.id = 'account-controls';
  controls.className = 'shrink-0 flex items-center gap-2';
  controls.innerHTML = `${portalUser.role === 'teacher' ? '<a href="/teacher" title="Teacher dashboard" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><iconify-icon icon="lucide:layout-dashboard"></iconify-icon></a>' : ''}<span class="hidden xl:inline text-[10px] text-white/45 max-w-[90px] truncate">${portalUser.displayName}</span><button id="portal-logout" title="Sign out" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/15 hover:text-red-300"><iconify-icon icon="lucide:log-out"></iconify-icon></button>`;
  right.appendChild(controls);
  controls.querySelector('#portal-logout').addEventListener('click', async () => { await portalApi('/api/logout', { method:'POST' }); window.location.href='/login'; });
}

function addProgressPanel() {
  if (portalUser.role !== 'student' || document.getElementById('student-progress-panel')) return;
  const currentPage = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const complete = portalProgress.some(item => item.page === currentPage && item.completed);
  const panel = document.createElement('div');
  panel.id = 'student-progress-panel';
  panel.className = 'fixed bottom-5 left-5 z-40 glass-panel rounded-xl p-3 flex items-center gap-3 shadow-xl';
  panel.innerHTML = `<div><div class="text-[9px] text-white/35 uppercase tracking-wider">My Progress</div><div class="text-[11px] font-semibold">${complete ? 'Page completed' : 'Working on this page'}</div></div><button id="complete-page" class="w-9 h-9 rounded-lg flex items-center justify-center ${complete ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/60 hover:bg-green-500/20 hover:text-green-300'}" title="${complete ? 'Mark incomplete' : 'Mark complete'}"><iconify-icon icon="lucide:${complete ? 'check-circle-2' : 'circle'}"></iconify-icon></button>`;
  document.body.appendChild(panel);
  panel.querySelector('#complete-page').addEventListener('click', async () => { await portalApi('/api/progress', { method:'POST', body:JSON.stringify({ page:currentPage, completed:!complete }) }); sendEngagement(complete ? 'page_uncompleted' : 'page_completed'); window.location.reload(); });
}

function connectSelectedTeamTracking() {
  if (portalUser.role !== 'student') return;
  document.addEventListener('click', event => {
    const card = event.target.closest('.team-card');
    if (!card) return;
    const text = card.textContent;
    const team = typeof NFL_TEAMS !== 'undefined' ? NFL_TEAMS.find(item => text.includes(item.name) && text.includes(item.location)) : null;
    if (team) portalApi('/api/progress', { method:'POST', body:JSON.stringify({ selectedTeam:team.abbr }) }).then(() => sendEngagement('team_selected')).catch(() => {});
  });
}

async function initializeAccountExperience() {
  try {
    const [{ user }, progressData] = await Promise.all([portalApi('/api/me'), portalApi('/api/progress')]);
    portalUser = user; portalProgress = progressData.progress || [];
    addAccountControls(); addProgressPanel(); connectSelectedTeamTracking(); sendEngagement('page_view');
  } catch (error) { console.warn('Account experience could not initialize.', error); }
}

window.addEventListener('pagehide', () => sendEngagement('time_spent', Math.round((Date.now() - portalStartedAt) / 1000)));
initializeAccountExperience();
