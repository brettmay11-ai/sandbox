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
  const safeName=escapeHtml(portalUser.displayName||'Student'),safeTeam=escapeHtml(team?.name||'Your Team'),safeInitials=escapeHtml(initialsFor(portalUser.displayName));
  const logoMarkup=team?.logo?`<img src="${escapeHtml(team.logo)}" alt="${safeTeam} logo">`:`<strong>${escapeHtml(team?.abbr||'NFL')}</strong>`;
  const style=document.createElement('style');
  style.textContent=`
    .team-tunnel{position:fixed;inset:0;z-index:120;overflow:hidden;color:#fff;background:#020306;animation:tunnel-fade 3.35s ease forwards}
    .team-tunnel *{box-sizing:border-box}
    .team-tunnel-stage{position:absolute;inset:0;perspective:900px;background:radial-gradient(ellipse at 50% 42%,rgba(255,255,255,.16),transparent 18%),linear-gradient(180deg,#05070a 0%,#020306 64%,#07120b 100%)}
    .team-tunnel-opening{position:absolute;left:50%;top:10%;width:min(68vw,760px);height:64vh;transform:translateX(-50%);clip-path:polygon(20% 0,80% 0,100% 100%,0 100%);background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(255,255,255,.28) 24%,rgba(31,129,74,.62) 72%,rgba(25,109,55,.95));box-shadow:0 0 120px rgba(255,255,255,.34),0 0 150px color-mix(in srgb,${secondary} 42%,transparent);animation:tunnel-opening-pulse 1.1s ease-in-out infinite alternate}
    .team-tunnel-wall{position:absolute;top:0;bottom:0;width:48%;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.12),rgba(0,0,0,.68)),repeating-linear-gradient(0deg,rgba(255,255,255,.08) 0 1px,transparent 1px 54px),linear-gradient(160deg,color-mix(in srgb,${primary} 38%,#050505),#030303 70%);box-shadow:inset 0 0 90px rgba(0,0,0,.82)}
    .team-tunnel-wall.left{left:0;clip-path:polygon(0 0,100% 12%,72% 88%,0 100%)}
    .team-tunnel-wall.right{right:0;clip-path:polygon(0 12%,100% 0,100% 100%,28% 88%);background:linear-gradient(270deg,rgba(255,255,255,.03),rgba(255,255,255,.12),rgba(0,0,0,.68)),repeating-linear-gradient(0deg,rgba(255,255,255,.08) 0 1px,transparent 1px 54px),linear-gradient(200deg,color-mix(in srgb,${secondary} 34%,#050505),#030303 70%)}
    .team-tunnel-ceiling{position:absolute;left:14%;right:14%;top:-2%;height:28%;clip-path:polygon(0 0,100% 0,78% 100%,22% 100%);background:repeating-linear-gradient(90deg,rgba(255,255,255,.16) 0 2px,transparent 2px 72px),linear-gradient(180deg,#15171b,#050505);box-shadow:inset 0 -28px 70px rgba(0,0,0,.78)}
    .team-tunnel-floor{position:absolute;left:5%;right:5%;bottom:-6%;height:48%;clip-path:polygon(30% 0,70% 0,100% 100%,0 100%);background:repeating-linear-gradient(90deg,rgba(255,255,255,.15) 0 2px,transparent 2px 11vw),linear-gradient(180deg,rgba(255,255,255,.08),rgba(12,69,38,.72) 36%,#08331f);box-shadow:inset 0 50px 85px rgba(0,0,0,.55);animation:tunnel-floor-rush .85s linear infinite}
    .team-tunnel-light{position:absolute;top:7%;width:18vw;height:64vh;background:linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,.08) 42%,transparent);filter:blur(14px);opacity:.56;mix-blend-mode:screen;animation:tunnel-light-flicker .8s ease-in-out infinite alternate}
    .team-tunnel-light.left{left:15%;transform:skewX(18deg)}
    .team-tunnel-light.right{right:15%;transform:skewX(-18deg)}
    .team-tunnel-haze{position:absolute;left:0;right:0;bottom:16%;height:28%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent),linear-gradient(0deg,rgba(255,255,255,.16),transparent);filter:blur(20px);opacity:.65;animation:tunnel-haze 2.4s ease-in-out infinite alternate}
    .team-tunnel-brand{position:absolute;top:16%;width:88px;height:88px;display:grid;place-items:center;opacity:.24;filter:drop-shadow(0 0 24px rgba(255,255,255,.28))}
    .team-tunnel-brand img{max-width:100%;max-height:100%;object-fit:contain}
    .team-tunnel-brand strong{font-size:20px;font-weight:900}
    .team-tunnel-brand.left{left:8%;transform:rotateY(36deg) skewY(-8deg)}
    .team-tunnel-brand.right{right:8%;transform:rotateY(-36deg) skewY(8deg)}
    .team-tunnel-runout{position:absolute;left:50%;bottom:10%;z-index:3;width:min(88vw,680px);transform:translate(-50%,22%) scale(.48);text-align:center;animation:tunnel-runout 2.75s cubic-bezier(.19,1,.22,1) forwards;text-shadow:0 8px 32px rgba(0,0,0,.9)}
    .team-tunnel-logo{width:118px;height:118px;margin:0 auto 14px;display:grid;place-items:center;background:rgba(0,0,0,.46);border:1px solid rgba(255,255,255,.24);box-shadow:0 0 65px color-mix(in srgb,${secondary} 58%,transparent)}
    .team-tunnel-logo img{width:92px;height:92px;object-fit:contain}
    .team-tunnel-logo strong{font-size:26px;font-weight:900}
    .team-tunnel-athlete{position:relative;width:130px;height:132px;margin:0 auto -10px;filter:drop-shadow(0 18px 30px rgba(0,0,0,.78));animation:tunnel-stride .34s ease-in-out infinite alternate}
    .team-tunnel-helmet{position:absolute;left:39px;top:0;width:52px;height:52px;border-radius:50% 50% 42% 42%;display:grid;place-items:center;background:${secondary};border:4px solid rgba(255,255,255,.82);color:#fff;font-weight:900;font-size:14px}
    .team-tunnel-jersey{position:absolute;left:23px;top:45px;width:84px;height:70px;border-radius:22px 22px 18px 18px;background:linear-gradient(135deg,${primary},color-mix(in srgb,${secondary} 68%,${primary}));border:3px solid rgba(255,255,255,.8)}
    .team-tunnel-jersey:before,.team-tunnel-jersey:after{content:'';position:absolute;top:11px;width:42px;height:14px;background:${primary};border:3px solid rgba(255,255,255,.56)}
    .team-tunnel-jersey:before{left:-33px;transform:rotate(24deg)}
    .team-tunnel-jersey:after{right:-33px;transform:rotate(-24deg)}
    .team-tunnel-leg{position:absolute;top:108px;width:21px;height:42px;background:#101318;border:2px solid rgba(255,255,255,.28)}
    .team-tunnel-leg.left{left:42px;transform:rotate(15deg)}
    .team-tunnel-leg.right{right:42px;transform:rotate(-13deg)}
    .team-tunnel-name{font-size:clamp(2.5rem,8vw,5.8rem);line-height:.92;font-weight:900;letter-spacing:0}
    .team-tunnel-team{margin-top:12px;font-size:clamp(.95rem,2.4vw,1.3rem);font-weight:800;color:rgba(255,255,255,.78);letter-spacing:0}
    @keyframes tunnel-floor-rush{to{background-position:11vw 0,0 0}}
    @keyframes tunnel-opening-pulse{to{filter:brightness(1.15)}}
    @keyframes tunnel-light-flicker{to{opacity:.82}}
    @keyframes tunnel-haze{to{transform:translateY(-8px);opacity:.86}}
    @keyframes tunnel-stride{to{transform:translateY(-5px) rotate(-1deg)}}
    @keyframes tunnel-runout{0%{transform:translate(-50%,22%) scale(.48);opacity:.08}38%{opacity:1}72%{transform:translate(-50%,1%) scale(1.08)}100%{transform:translate(-50%,0) scale(1)}}
    @keyframes tunnel-fade{0%,82%{opacity:1}100%{opacity:0;visibility:hidden}}
  `;
  document.head.appendChild(style);
  const overlay=document.createElement('div');
  overlay.className='team-tunnel';
  overlay.innerHTML=`
    <div class="team-tunnel-stage">
      <div class="team-tunnel-opening"></div>
      <div class="team-tunnel-wall left"></div>
      <div class="team-tunnel-wall right"></div>
      <div class="team-tunnel-ceiling"></div>
      <div class="team-tunnel-floor"></div>
      <div class="team-tunnel-light left"></div>
      <div class="team-tunnel-light right"></div>
      <div class="team-tunnel-haze"></div>
      <div class="team-tunnel-brand left">${logoMarkup}</div>
      <div class="team-tunnel-brand right">${logoMarkup}</div>
      <div class="team-tunnel-runout">
        <div class="team-tunnel-logo">${logoMarkup}</div>
        <div class="team-tunnel-athlete" aria-hidden="true">
          <div class="team-tunnel-helmet">${safeInitials}</div>
          <div class="team-tunnel-jersey"></div>
          <div class="team-tunnel-leg left"></div>
          <div class="team-tunnel-leg right"></div>
        </div>
        <div class="team-tunnel-name">${safeName}</div>
        <div class="team-tunnel-team">${safeTeam}</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>{overlay.remove();style.remove()},3500);
}
function addAccountControls() {const nav = document.querySelector('nav');const right = nav?.lastElementChild;if (!right || document.getElementById('account-controls')) return;const controls = document.createElement('div');controls.id = 'account-controls';controls.className = 'shrink-0 flex items-center gap-2';const initials=escapeHtml(initialsFor(portalUser.displayName)),safeName=escapeHtml(portalUser.displayName||'Student');controls.innerHTML = `${portalUser.role === 'teacher' ? '<a href="/teacher" title="Teacher dashboard" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><iconify-icon icon="lucide:layout-dashboard"></iconify-icon></a>' : ''}<a id="portal-profile" href="index.html?page=profile" title="Open profile" aria-label="Open profile for ${safeName}" class="student-team-mark w-9 h-9 rounded-full grid place-items-center text-[11px] font-black tracking-wide">${initials}</a><button id="portal-logout" title="Sign out" class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/15 hover:text-red-300"><iconify-icon icon="lucide:log-out"></iconify-icon></button>`;right.appendChild(controls);controls.querySelector('#portal-logout').addEventListener('click', async () => { await portalApi('/api/logout', { method:'POST' }); window.location.href='/login'; });}
async function initializeAccountExperience() {try {const { user } = await portalApi('/api/me');portalUser = user;applyAssignedTeamBranding(); addAccountControls(); showTeamTunnelEntrance(); sendEngagement('page_view');} catch (error) { console.warn('Account experience could not initialize.', error); }}
window.addEventListener('pagehide', () => sendEngagement('time_spent', Math.round((Date.now() - portalStartedAt) / 1000)));
initializeAccountExperience();
