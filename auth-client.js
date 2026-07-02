/* Signed-in student experience and lightweight engagement tracking. */
let portalUser = null;
const portalStartedAt = Date.now();
async function portalApi(url, options = {}) {const response = await fetch(url, { ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });if (response.status === 401) { window.location.href = '/login'; throw new Error('Please sign in.'); }const data = await response.json();if (!response.ok) throw new Error(data.error || 'Request failed.');return data;}
function sendEngagement(event, durationSeconds = 0) {const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';const body = JSON.stringify({ page, event, durationSeconds });if (navigator.sendBeacon && event === 'time_spent') navigator.sendBeacon('/api/engagement', new Blob([body], { type:'application/json' }));else fetch('/api/engagement', { method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true }).catch(() => {});}
function applyAssignedTeamBranding() {if (portalUser.role !== 'student') return;const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(portalUser.selectedTeam) : null;const primary=team?.primary||'#013369',secondary=team?.secondary||'#D50A0A';const style=document.createElement('style');style.textContent=`:root{--student-team-primary:${primary};--student-team-secondary:${secondary}}body:before{content:'';position:fixed;z-index:60;top:0;left:0;right:0;height:3px;background:var(--student-team-secondary)}nav{border-bottom-color:${primary}!important}nav [aria-current="page"]{background:${primary}33!important;border-color:${secondary}88!important;color:#fff!important}.student-team-mark{background:${primary};border:1px solid ${secondary};color:#fff}.student-team-accent{border-color:${secondary}!important}`;document.head.appendChild(style);const brand=document.querySelector('nav > div:first-child');if(brand&&team){const originalLogo=brand.querySelector('img');if(originalLogo){originalLogo.src=team.logo;originalLogo.alt=`${team.name} logo`;originalLogo.title=team.name;originalLogo.className='h-9 w-9 object-contain shrink-0';originalLogo.onerror=()=>{originalLogo.style.display='none'}}}}
function escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function initialsFor(name){const parts=String(name||'Student').trim().split(/\s+/).filter(Boolean);return (parts.length>1?`${parts[0][0]}${parts[parts.length-1][0]}`:parts[0]?.slice(0,2)||'ST').toUpperCase()}
function showTeamTunnelEntrance(){
  if(portalUser.role!=='student')return;
  const key=`team-tunnel:${portalUser.username}`;
  try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'shown')}catch(error){}
  const team=typeof getNFLTeamBrand==='function'?getNFLTeamBrand(portalUser.selectedTeam):null;
  const primary=team?.primary||'#013369',secondary=team?.secondary||'#D50A0A';
  const safeName=escapeHtml(portalUser.displayName||'Student'),safeTeam=escapeHtml(team?.name||'Your Team');
  const logoMarkup=team?.logo?`<img src="${escapeHtml(team.logo)}" alt="${safeTeam} logo">`:`<strong>${escapeHtml(team?.abbr||'NFL')}</strong>`;
  const style=document.createElement('style');
  style.textContent=`
    .team-tunnel{position:fixed;inset:0;z-index:120;overflow:hidden;color:#fff;background:#020306;animation:tunnel-fade 2.9s ease forwards}
    .team-tunnel *{box-sizing:border-box}
    .team-tunnel-stage{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(circle at 50% 22%,rgba(255,255,255,.12),transparent 20%),linear-gradient(180deg,#05070b 0%,#030406 58%,#07130b 100%);perspective:900px}
    .team-tunnel-stage:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.92),transparent 26%,transparent 74%,rgba(0,0,0,.92)),radial-gradient(ellipse at 50% 46%,transparent 0 25%,rgba(0,0,0,.86) 60%,#000 100%);z-index:3;pointer-events:none}
    .team-tunnel-field{position:absolute;left:50%;top:8%;width:min(72vw,820px);height:72vh;transform:translateX(-50%) scale(.72);clip-path:polygon(28% 0,72% 0,100% 100%,0 100%);background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.34) 22%,rgba(79,191,125,.82) 58%,#154d2d 100%);box-shadow:0 0 120px rgba(255,255,255,.36),0 0 160px color-mix(in srgb,${secondary} 42%,transparent);animation:field-zoom 2.35s cubic-bezier(.18,.9,.2,1) forwards}
    .team-tunnel-field:after{content:'';position:absolute;left:16%;right:16%;bottom:14%;height:2px;background:rgba(255,255,255,.75);box-shadow:0 38px 0 rgba(255,255,255,.5),0 76px 0 rgba(255,255,255,.34)}
    .team-tunnel-wall{position:absolute;top:-2%;bottom:-4%;width:50%;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.14),rgba(0,0,0,.82)),repeating-linear-gradient(0deg,rgba(255,255,255,.09) 0 1px,transparent 1px 58px),linear-gradient(150deg,color-mix(in srgb,${primary} 42%,#050505),#030303 72%);box-shadow:inset 0 0 120px rgba(0,0,0,.9);z-index:2}
    .team-tunnel-wall.left{left:0;clip-path:polygon(0 0,100% 16%,68% 86%,0 100%)}
    .team-tunnel-wall.right{right:0;clip-path:polygon(0 16%,100% 0,100% 100%,32% 86%);background:linear-gradient(270deg,rgba(255,255,255,.05),rgba(255,255,255,.14),rgba(0,0,0,.82)),repeating-linear-gradient(0deg,rgba(255,255,255,.09) 0 1px,transparent 1px 58px),linear-gradient(210deg,color-mix(in srgb,${secondary} 36%,#050505),#030303 72%)}
    .team-tunnel-ceiling{position:absolute;left:12%;right:12%;top:-3%;height:28%;clip-path:polygon(0 0,100% 0,76% 100%,24% 100%);background:repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 2px,transparent 2px 74px),linear-gradient(180deg,#17191d,#030303);box-shadow:inset 0 -30px 76px #000;z-index:4}
    .team-tunnel-floor{position:absolute;left:7%;right:7%;bottom:-10%;height:48%;clip-path:polygon(34% 0,66% 0,100% 100%,0 100%);background:repeating-linear-gradient(90deg,rgba(255,255,255,.16) 0 2px,transparent 2px 12vw),linear-gradient(180deg,rgba(255,255,255,.08),rgba(4,38,22,.88) 38%,#06150d);box-shadow:inset 0 46px 90px rgba(0,0,0,.7);z-index:4;animation:floor-move .7s linear infinite}
    .team-tunnel-beam{position:absolute;top:7%;width:18vw;height:70vh;background:linear-gradient(180deg,rgba(255,255,255,.44),rgba(255,255,255,.08) 44%,transparent);filter:blur(18px);opacity:.58;mix-blend-mode:screen;z-index:5}
    .team-tunnel-beam.left{left:18%;transform:skewX(18deg)}.team-tunnel-beam.right{right:18%;transform:skewX(-18deg)}
    .team-tunnel-smoke{position:absolute;left:-10%;right:-10%;bottom:10%;height:34%;background:radial-gradient(ellipse at 25% 50%,rgba(255,255,255,.2),transparent 36%),radial-gradient(ellipse at 68% 58%,rgba(255,255,255,.18),transparent 38%),linear-gradient(0deg,rgba(255,255,255,.12),transparent);filter:blur(22px);opacity:.78;z-index:6;animation:smoke-drift 2.7s ease-in-out infinite alternate}
    .team-tunnel-lockup{position:relative;z-index:8;text-align:center;width:min(88vw,720px);padding-top:6vh;transform:translateY(34px) scale(.82);opacity:0;animation:lockup-enter 2.25s cubic-bezier(.18,.9,.2,1) .18s forwards;text-shadow:0 10px 34px rgba(0,0,0,.92)}
    .team-tunnel-project{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;padding:7px 12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.34);font-size:11px;font-weight:900;text-transform:uppercase;color:rgba(255,255,255,.72);letter-spacing:.18em}
    .team-tunnel-project:before{content:'';width:8px;height:8px;border-radius:999px;background:${secondary};box-shadow:0 0 18px ${secondary}}
    .team-tunnel-logo{width:132px;height:132px;margin:0 auto 18px;display:grid;place-items:center;background:rgba(0,0,0,.48);border:1px solid rgba(255,255,255,.28);box-shadow:0 0 72px color-mix(in srgb,${secondary} 58%,transparent),inset 0 1px 0 rgba(255,255,255,.18)}
    .team-tunnel-logo img{width:102px;height:102px;object-fit:contain}.team-tunnel-logo strong{font-size:30px;font-weight:900}
    .team-tunnel-name{font-size:clamp(2.8rem,8vw,6.5rem);line-height:.9;font-weight:900;letter-spacing:0}
    .team-tunnel-team{margin-top:12px;font-size:clamp(1rem,2.5vw,1.35rem);font-weight:900;color:rgba(255,255,255,.78);letter-spacing:0}
    .team-tunnel-copy{max-width:520px;margin:12px auto 0;color:rgba(255,255,255,.58);font-size:clamp(.9rem,2vw,1.05rem);line-height:1.5;font-weight:600}
    .team-tunnel-stripe{width:min(360px,68vw);height:5px;margin:20px auto 0;background:linear-gradient(90deg,transparent,${primary},${secondary},transparent);box-shadow:0 0 28px color-mix(in srgb,${secondary} 50%,transparent)}
    @keyframes field-zoom{0%{transform:translateX(-50%) scale(.58);filter:brightness(.72)}70%{transform:translateX(-50%) scale(.9);filter:brightness(1.18)}100%{transform:translateX(-50%) scale(1);filter:brightness(1)}}
    @keyframes floor-move{to{background-position:12vw 0,0 0}}
    @keyframes smoke-drift{to{transform:translateX(32px) translateY(-8px);opacity:.9}}
    @keyframes lockup-enter{0%{transform:translateY(44px) scale(.72);opacity:0}52%{opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}
    @keyframes tunnel-fade{0%,80%{opacity:1}100%{opacity:0;visibility:hidden}}
  `;
  document.head.appendChild(style);
  const overlay=document.createElement('div');
  overlay.className='team-tunnel';
  overlay.innerHTML=`
    <div class="team-tunnel-stage">
      <div class="team-tunnel-field"></div>
      <div class="team-tunnel-wall left"></div>
      <div class="team-tunnel-wall right"></div>
      <div class="team-tunnel-ceiling"></div>
      <div class="team-tunnel-floor"></div>
      <div class="team-tunnel-beam left"></div>
      <div class="team-tunnel-beam right"></div>
      <div class="team-tunnel-smoke"></div>
      <div class="team-tunnel-lockup">
        <div class="team-tunnel-project">Welcome to the NFL Project</div>
        <div class="team-tunnel-logo">${logoMarkup}</div>
        <div class="team-tunnel-name">${safeName}</div>
        <div class="team-tunnel-team">${safeTeam}</div>
        <div class="team-tunnel-copy">Pick your team. Track their journey across math, writing, geography, and more.</div>
        <div class="team-tunnel-stripe"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>{overlay.remove();style.remove()},3000);
}
function addAccountControls() {const nav = document.querySelector('nav');const right = nav?.lastElementChild;if (!right || document.getElementById('account-controls')) return;const controls = document.createElement('div');controls.id = 'account-controls';controls.className = 'shrink-0 flex items-center gap-2';const initials=escapeHtml(initialsFor(portalUser.displayName)),safeName=escapeHtml(portalUser.displayName||'Student');controls.innerHTML = `${portalUser.role === 'teacher' ? '<a href="/teacher" title="Teacher dashboard" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><iconify-icon icon="lucide:layout-dashboard"></iconify-icon></a>' : ''}<a id="portal-profile" href="index.html?page=profile" title="Open profile" aria-label="Open profile for ${safeName}" class="student-team-mark w-9 h-9 rounded-full grid place-items-center text-[11px] font-black tracking-wide">${initials}</a><button id="portal-logout" title="Sign out" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/15 hover:text-red-300"><iconify-icon icon="lucide:log-out"></iconify-icon></button>`;right.appendChild(controls);controls.querySelector('#portal-logout').addEventListener('click', async () => { await portalApi('/api/logout', { method:'POST' }); window.location.href='/login'; });}
async function initializeAccountExperience() {try {const { user } = await portalApi('/api/me');portalUser = user;applyAssignedTeamBranding(); addAccountControls(); showTeamTunnelEntrance(); sendEngagement('page_view');} catch (error) { console.warn('Account experience could not initialize.', error); }}
window.addEventListener('pagehide', () => sendEngagement('time_spent', Math.round((Date.now() - portalStartedAt) / 1000)));
initializeAccountExperience();
