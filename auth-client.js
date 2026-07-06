/* Signed-in student experience and lightweight engagement tracking. */
let portalUser = null;
const portalStartedAt = Date.now();
async function portalApi(url, options = {}) {const response = await fetch(url, { ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });if (response.status === 401) { window.location.href = '/login'; throw new Error('Please sign in.'); }const data = await response.json();if (!response.ok) throw new Error(data.error || 'Request failed.');return data;}
function sendEngagement(event, durationSeconds = 0) {const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';const body = JSON.stringify({ page, event, durationSeconds });if (navigator.sendBeacon && event === 'time_spent') navigator.sendBeacon('/api/engagement', new Blob([body], { type:'application/json' }));else fetch('/api/engagement', { method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true }).catch(() => {});}
function teamColorLuminance(hex) {const n = parseInt(String(hex || '').replace('#',''), 16);if (Number.isNaN(n)) return 0.5;return (0.2126*(n>>16&255) + 0.7152*(n>>8&255) + 0.0722*(n&255)) / 255;}
function pickTeamAccent(primary, secondary) {for (const candidate of [secondary, primary]) {const lum = teamColorLuminance(candidate);if (lum >= 0.18 && lum <= 0.88) return `color-mix(in srgb, ${candidate} 72%, #fff)`;}return `color-mix(in srgb, ${primary} 45%, #fff)`;}
function applyAssignedTeamBranding() {if (portalUser.role !== 'student') return;const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(portalUser.selectedTeam) : null;const primary=team?.primary||'#013369',secondary=team?.secondary||'#D50A0A',accent=pickTeamAccent(primary,secondary);const style=document.createElement('style');style.textContent=`:root{--student-team-primary:${primary};--student-team-secondary:${secondary};--student-team-accent:${accent}}body:before{content:'';position:fixed;z-index:60;top:0;left:0;right:0;height:3px;background:var(--student-team-secondary)}nav{border-bottom-color:${primary}!important}nav [aria-current="page"]{background:${primary}33!important;border-color:${secondary}88!important;color:#fff!important}.student-team-mark{background:${primary};border:1px solid ${secondary};color:#fff}.student-team-accent{border-color:${secondary}!important}body .text-brand-400{color:var(--student-team-accent)}body .bg-brand-500{background-color:${primary}}body .bg-brand-500\\/20{background-color:color-mix(in srgb,${primary} 25%,transparent)}body .bg-brand-500\\/15{background-color:color-mix(in srgb,${primary} 18%,transparent)}body .border-brand-500\\/30{border-color:color-mix(in srgb,${primary} 42%,transparent)}`;document.head.appendChild(style);const brand=document.querySelector('nav > div:first-child');if(brand&&team){const originalLogo=brand.querySelector('img');if(originalLogo){originalLogo.src=team.logo;originalLogo.alt=`${team.name} logo`;originalLogo.title=team.name;originalLogo.className='h-9 w-9 object-contain shrink-0';originalLogo.onerror=()=>{originalLogo.style.display='none'}}}}
function escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function initialsFor(name){const parts=String(name||'Student').trim().split(/\s+/).filter(Boolean);return (parts.length>1?`${parts[0][0]}${parts[parts.length-1][0]}`:parts[0]?.slice(0,2)||'ST').toUpperCase()}
function showTeamTunnelEntrance(){
  if(portalUser.role!=='student')return;
  const key=`team-tunnel:${portalUser.username}`;
  try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'shown')}catch(error){}
  const team=typeof getNFLTeamBrand==='function'?getNFLTeamBrand(portalUser.selectedTeam):null;
  const primary=team?.primary||'#013369',secondary=team?.secondary||'#D50A0A';
  const safeTeam=escapeHtml(team?.name||'Your Team'),safeAbbr=escapeHtml(team?.abbr||'NFL');
  const logoMarkup=team?.logo
    ?`<img src="${escapeHtml(team.logo)}" alt="${safeTeam} logo" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><strong style="display:none">${safeAbbr}</strong>`
    :`<strong>${safeAbbr}</strong>`;
  const rawName=String(portalUser.displayName||'Student');
  const nameLetters=[...rawName].map((ch,i)=>ch===' '
    ?'<span class="ti-gap"></span>'
    :`<span class="ti-letter" style="animation-delay:${(0.66+i*0.045).toFixed(3)}s">${escapeHtml(ch)}</span>`).join('');
  const style=document.createElement('style');
  style.textContent=`
    .team-intro{position:fixed;inset:0;z-index:120;overflow:hidden;color:#fff;background:#04050a;animation:ti-exit .5s ease 2.25s forwards}
    .team-intro.ti-skip{animation:ti-exit .22s ease 0s forwards}
    .team-intro *{box-sizing:border-box}
    .ti-panel{position:absolute;top:-12%;bottom:-12%;width:52%;z-index:1}
    .ti-panel.left{left:-8%;background:repeating-linear-gradient(115deg,rgba(255,255,255,.05) 0 2px,transparent 2px 64px),linear-gradient(115deg,${primary},color-mix(in srgb,${primary} 45%,#000) 82%);transform:translateX(-115%) skewX(-14deg);animation:ti-panel-in .5s cubic-bezier(.16,1,.3,1) .04s forwards}
    .ti-panel.right{right:-8%;background:repeating-linear-gradient(115deg,rgba(255,255,255,.05) 0 2px,transparent 2px 64px),linear-gradient(295deg,${secondary},color-mix(in srgb,${secondary} 40%,#000) 82%);transform:translateX(115%) skewX(-14deg);animation:ti-panel-in .5s cubic-bezier(.16,1,.3,1) .12s forwards}
    .ti-slash{position:absolute;top:-20%;bottom:-20%;left:-12%;width:9%;background:linear-gradient(180deg,transparent,rgba(255,255,255,.9),transparent);transform:skewX(-14deg);filter:blur(6px);mix-blend-mode:screen;z-index:2;animation:ti-slash .55s cubic-bezier(.5,0,.2,1) .18s forwards;opacity:0}
    .ti-vignette{position:absolute;inset:0;z-index:3;pointer-events:none;background:radial-gradient(ellipse at 50% 42%,transparent 30%,rgba(0,0,0,.55) 78%,rgba(0,0,0,.82) 100%)}
    .ti-stage{position:absolute;inset:0;z-index:5;display:grid;place-items:center;padding:24px;animation:ti-shake .28s linear .4s}
    .ti-lockup{text-align:center;width:min(94vw,900px)}
    .ti-logo-wrap{position:relative;width:150px;height:150px;margin:0 auto 10px;display:grid;place-items:center}
    .ti-logo{width:100%;height:100%;display:grid;place-items:center;opacity:0;transform:scale(2.5);animation:ti-logo-slam .4s cubic-bezier(.2,1.1,.35,1) .3s forwards;filter:drop-shadow(0 0 34px color-mix(in srgb,${secondary} 65%,transparent))}
    .ti-logo img{width:126px;height:126px;object-fit:contain}
    .ti-logo strong{font-size:44px;font-weight:900;letter-spacing:.04em}
    .ti-ring{position:absolute;inset:0;border:2px solid rgba(255,255,255,.85);border-radius:999px;opacity:0;animation:ti-ring .7s ease-out .44s forwards}
    .ti-ring.d2{animation-delay:.56s;border-width:1px}
    .ti-kicker{opacity:0;margin:6px 0 10px;font-size:clamp(11px,1.6vw,14px);font-weight:800;text-transform:uppercase;letter-spacing:.3em;color:rgba(255,255,255,.75);animation:ti-rise .45s cubic-bezier(.2,1,.4,1) .56s forwards;text-shadow:0 2px 14px rgba(0,0,0,.8)}
    .ti-name{font-family:'Anton','Inter',sans-serif;font-weight:400;font-size:clamp(3rem,11vw,7.5rem);line-height:.92;text-transform:uppercase;letter-spacing:.01em;transform:skewX(-3deg);display:flex;flex-wrap:wrap;justify-content:center;text-shadow:0 10px 44px rgba(0,0,0,.85)}
    .ti-letter{display:inline-block;opacity:0;transform:translateY(.5em) rotate(5deg);animation:ti-letter .34s cubic-bezier(.2,1.15,.35,1) forwards}
    .ti-gap{display:inline-block;width:.34em}
    .ti-stripe{width:min(400px,72vw);height:5px;margin:22px auto 0;border-radius:99px;background:linear-gradient(90deg,${primary},${secondary});box-shadow:0 0 28px color-mix(in srgb,${secondary} 55%,transparent);transform:scaleX(0);animation:ti-stripe .5s cubic-bezier(.2,1,.35,1) 1.25s forwards}
    .ti-sub{opacity:0;margin-top:14px;font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.26em;color:rgba(255,255,255,.55);animation:ti-rise .4s ease 1.4s forwards}
    .ti-flash{position:absolute;inset:0;z-index:9;background:#fff;opacity:0;pointer-events:none;animation:ti-flash .34s ease-out .38s}
    @keyframes ti-panel-in{to{transform:translateX(0) skewX(-14deg)}}
    @keyframes ti-slash{0%{opacity:0;left:-12%}20%{opacity:1}100%{opacity:0;left:108%}}
    @keyframes ti-logo-slam{55%{opacity:1;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
    @keyframes ti-ring{0%{opacity:.9;transform:scale(.35)}100%{opacity:0;transform:scale(2.7)}}
    @keyframes ti-flash{0%{opacity:0}25%{opacity:.8}100%{opacity:0}}
    @keyframes ti-shake{0%,100%{transform:translate(0,0)}25%{transform:translate(6px,-5px)}50%{transform:translate(-5px,4px)}75%{transform:translate(3px,2px)}}
    @keyframes ti-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ti-letter{to{opacity:1;transform:translateY(0) rotate(0)}}
    @keyframes ti-stripe{to{transform:scaleX(1)}}
    @keyframes ti-exit{to{opacity:0;transform:scale(1.06);visibility:hidden}}
    @media (prefers-reduced-motion:reduce){
      .team-intro{animation:ti-exit .4s ease 1.5s forwards}
      .team-intro .ti-panel,.team-intro .ti-logo,.team-intro .ti-kicker,.team-intro .ti-letter,.team-intro .ti-stripe,.team-intro .ti-sub{animation:none!important;opacity:1!important;transform:none!important}
      .team-intro .ti-panel.left,.team-intro .ti-panel.right{transform:skewX(-14deg)!important}
      .team-intro .ti-slash,.team-intro .ti-flash,.team-intro .ti-ring{display:none}
      .team-intro .ti-stage{animation:none}
      .team-intro .ti-name{transform:none}
    }
  `;
  document.head.appendChild(style);
  const overlay=document.createElement('div');
  overlay.className='team-intro';
  overlay.setAttribute('role','presentation');
  overlay.innerHTML=`
    <div class="ti-panel left"></div>
    <div class="ti-panel right"></div>
    <div class="ti-slash"></div>
    <div class="ti-vignette"></div>
    <div class="ti-flash"></div>
    <div class="ti-stage">
      <div class="ti-lockup">
        <div class="ti-logo-wrap"><span class="ti-ring"></span><span class="ti-ring d2"></span><div class="ti-logo">${logoMarkup}</div></div>
        <div class="ti-kicker">Starting for the ${safeTeam}</div>
        <div class="ti-name">${nameLetters}</div>
        <div class="ti-stripe"></div>
        <div class="ti-sub">NFL Project &bull; 2026 Season</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup=()=>{overlay.remove();style.remove()};
  const dismiss=()=>{if(!overlay.isConnected)return;overlay.classList.add('ti-skip');setTimeout(cleanup,240)};
  overlay.addEventListener('pointerdown',dismiss);
  window.addEventListener('keydown',dismiss,{once:true});
  setTimeout(cleanup,2850);
}
function addAccountControls() {const nav = document.querySelector('nav');const right = nav?.lastElementChild;if (!right || document.getElementById('account-controls')) return;const controls = document.createElement('div');controls.id = 'account-controls';controls.className = 'shrink-0 flex items-center gap-2';const initials=escapeHtml(initialsFor(portalUser.displayName)),safeName=escapeHtml(portalUser.displayName||'Student');controls.innerHTML = `${portalUser.role === 'teacher' ? '<a href="/teacher" title="Teacher dashboard" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><iconify-icon icon="lucide:layout-dashboard"></iconify-icon></a>' : ''}<a id="portal-profile" href="index.html?page=profile" title="Open profile" aria-label="Open profile for ${safeName}" class="student-team-mark w-9 h-9 rounded-full grid place-items-center text-[11px] font-black tracking-wide">${initials}</a><button id="portal-logout" title="Sign out" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/15 hover:text-red-300"><iconify-icon icon="lucide:log-out"></iconify-icon></button>`;right.appendChild(controls);controls.querySelector('#portal-logout').addEventListener('click', async () => { await portalApi('/api/logout', { method:'POST' }); window.location.href='/login'; });}
async function initializeAccountExperience() {try {const { user } = await portalApi('/api/me');portalUser = user;applyAssignedTeamBranding(); addAccountControls(); showTeamTunnelEntrance(); sendEngagement('page_view');} catch (error) { console.warn('Account experience could not initialize.', error); }}
window.addEventListener('pagehide', () => sendEngagement('time_spent', Math.round((Date.now() - portalStartedAt) / 1000)));
initializeAccountExperience();
