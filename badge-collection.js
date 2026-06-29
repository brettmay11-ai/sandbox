(() => {
  const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cachedUser = null;
  const queue = [];
  let animating = false;

  const style = document.createElement('style');
  style.textContent = `
    #profile{position:relative;overflow:hidden;background:radial-gradient(circle at 18% 4%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 18%,transparent),transparent 28%),linear-gradient(180deg,#080a0d 0,#111 42%,#08090b 100%)}
    #profile:before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 84px),linear-gradient(90deg,rgba(255,255,255,.05),transparent 18%,transparent 82%,rgba(255,255,255,.04));opacity:.52}
    .locker-room{position:relative;z-index:1}
    .locker-hero{position:relative;overflow:hidden;min-height:330px;background:linear-gradient(135deg,color-mix(in srgb,var(--student-team-primary,#013369) 86%,#050505),#101010 54%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 58%,#090909));border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 90px rgba(0,0,0,.45)}
    .locker-hero:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.1) 0 1px,transparent 1px 13%),repeating-linear-gradient(0deg,transparent 0 36px,rgba(0,0,0,.18) 36px 38px);opacity:.36}
    .locker-hero:after{content:'';position:absolute;left:0;right:0;bottom:0;height:72px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.42))}
    .locker-nameplate{position:relative;background:rgba(0,0,0,.46);border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
    .locker-jersey{position:relative;display:grid;place-items:center;width:132px;height:150px;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.22);clip-path:polygon(21% 0,39% 10%,61% 10%,79% 0,100% 23%,84% 38%,84% 100%,16% 100%,16% 38%,0 23%)}
    .locker-jersey:before{content:'';position:absolute;inset:10px;border:1px dashed rgba(255,255,255,.25);clip-path:inherit}
    .locker-stat{background:rgba(0,0,0,.34);border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
    .locker-section{background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.022));border:1px solid rgba(255,255,255,.11);box-shadow:0 18px 60px rgba(0,0,0,.22)}
    .locker-cubby{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.12)}
    .locker-cubby:before{content:'';position:absolute;left:12px;right:12px;top:10px;height:4px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0 9px,transparent 9px 15px);opacity:.45}
    .locker-badge-grid{perspective:1200px}
    .badge-card{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(24,26,30,.98),rgba(10,11,13,.98));border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 48px rgba(0,0,0,.28);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
    .badge-card:hover{transform:translateY(-3px) rotateX(2deg);border-color:color-mix(in srgb,var(--badge-accent,#5b9bd5) 55%,rgba(255,255,255,.12));box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 38px color-mix(in srgb,var(--badge-accent,#5b9bd5) 16%,transparent)}
    .badge-card.locked{filter:saturate(.18);opacity:.5}
    .badge-card:before{content:'';position:absolute;inset:-1px;background:radial-gradient(circle at 50% 0,var(--badge-accent,rgba(91,155,213,.5)),transparent 42%);opacity:.2;pointer-events:none}
    .badge-card:after{content:'';position:absolute;top:10px;right:12px;width:30px;height:8px;border-top:2px solid rgba(255,255,255,.16);border-bottom:2px solid rgba(255,255,255,.1);opacity:.8}
    .badge-icon{background:color-mix(in srgb,var(--badge-accent,#5b9bd5) 22%,transparent);border:1px solid color-mix(in srgb,var(--badge-accent,#5b9bd5) 65%,transparent);color:var(--badge-accent,#5b9bd5);box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
    .badge-ribbon{background:linear-gradient(90deg,var(--badge-accent,#5b9bd5),color-mix(in srgb,var(--badge-accent,#5b9bd5) 45%,#fff));height:3px}
    .badge-unlock-overlay{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:radial-gradient(circle at center,rgba(91,155,213,.16),rgba(0,0,0,.78));pointer-events:none;overflow:hidden}
    .badge-unlock-card{position:relative;width:min(420px,calc(100vw - 32px));padding:30px 26px 26px;text-align:center;background:rgba(9,13,20,.92);border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 90px rgba(0,0,0,.58),0 0 80px color-mix(in srgb,var(--badge-accent,#5b9bd5) 38%,transparent);animation:badge-pop .72s cubic-bezier(.2,1.25,.2,1) both}
    .badge-unlock-card:before{content:'';position:absolute;inset:-2px;background:linear-gradient(135deg,var(--badge-accent,#5b9bd5),transparent 38%,rgba(255,255,255,.25),transparent 65%,var(--badge-accent,#5b9bd5));opacity:.55;z-index:-1;filter:blur(10px)}
    .badge-unlock-icon{width:96px;height:96px;margin:0 auto 18px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--badge-accent,#5b9bd5) 22%,transparent);border:1px solid color-mix(in srgb,var(--badge-accent,#5b9bd5) 70%,transparent);color:var(--badge-accent,#5b9bd5);animation:badge-pulse 1.1s ease-in-out infinite}
    .badge-confetti{position:absolute;width:10px;height:22px;border-radius:999px;background:var(--badge-accent,#5b9bd5);left:50%;top:50%;opacity:.88;transform:rotate(var(--spin)) translateY(-46vh);animation:badge-confetti 1.28s ease-out forwards}
    @keyframes badge-pop{0%{opacity:0;transform:translateY(26px) scale(.76) rotateX(22deg)}55%{opacity:1;transform:translateY(-8px) scale(1.05) rotateX(0)}100%{opacity:1;transform:translateY(0) scale(1) rotateX(0)}}
    @keyframes badge-pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 color-mix(in srgb,var(--badge-accent,#5b9bd5) 36%,transparent)}50%{transform:scale(1.08);box-shadow:0 0 0 16px transparent}}
    @keyframes badge-confetti{0%{transform:rotate(var(--spin)) translateY(0) scale(.7);opacity:1}100%{transform:rotate(var(--spin)) translateY(-52vh) translateX(var(--drift)) scale(1);opacity:0}}
  `;
  document.head.appendChild(style);

  async function api(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Badges could not load.');
    return data;
  }

  function badgeMarkup(badge, compact = false) {
    return `<div class="badge-card ${badge.earned ? '' : 'locked'} ${compact ? 'p-3' : 'p-5'}" style="--badge-accent:${badge.accent}">
      <div class="badge-ribbon absolute left-0 top-0 right-0"></div>
      <div class="relative z-10 ${compact ? 'flex items-center gap-3' : ''}">
        <div class="badge-icon ${compact ? 'w-10 h-10' : 'w-14 h-14'} rounded-full grid place-items-center shrink-0"><iconify-icon icon="lucide:${badge.earned ? badge.icon : 'lock'}" class="${compact ? 'text-lg' : 'text-2xl'}"></iconify-icon></div>
        <div class="${compact ? 'min-w-0' : 'mt-4'}">
          <div class="text-[9px] uppercase tracking-widest ${badge.earned ? 'text-white/35' : 'text-white/25'}">${esc(badge.rarity)} / ${esc(badge.category)}</div>
          <h3 class="${compact ? 'text-xs truncate' : 'text-sm'} font-black mt-1">${esc(badge.title)}</h3>
          ${compact ? '' : `<p class="text-xs leading-5 text-white/45 mt-2">${esc(badge.description)}</p>`}
          ${badge.earned ? `<div class="text-[10px] text-green-300 mt-3">Earned ${new Date(badge.earnedAt).toLocaleDateString()}</div>` : '<div class="text-[10px] text-white/25 mt-3">Locked</div>'}
        </div>
      </div>
    </div>`;
  }

  function initialsFor(name) {
    const parts = String(name || 'Student').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || 'ST').toUpperCase();
  }

  function renderProfilePage(profile) {
    const section = document.getElementById('profile');
    if (!section) return;
    const recent = profile.earned.slice(0, 4);
    const user = cachedUser || {};
    const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(user.selectedTeam) : null;
    const percent = profile.total ? Math.round(profile.earnedCount / profile.total * 100) : 0;
    section.innerHTML = `<div class="locker-room max-w-6xl mx-auto px-4 md:px-6">
      <div class="locker-hero mb-6 p-5 md:p-7">
        <div class="relative z-10 grid lg:grid-cols-[1fr_300px] gap-6 items-stretch">
          <div class="flex flex-col justify-between gap-8">
            <div class="locker-nameplate p-5 md:p-6">
              <div class="text-[10px] uppercase tracking-[.26em] text-white/50 font-black">Student Locker</div>
              <h1 class="text-4xl md:text-6xl font-black mt-3 leading-none">${esc(user.displayName || 'Student')}</h1>
              <div class="flex flex-wrap items-center gap-2 mt-4 text-xs text-white/55">
                <span class="px-3 py-1 border border-white/10 bg-black/20">${esc(team?.name || 'Team assignment pending')}</span>
                <span class="px-3 py-1 border border-white/10 bg-black/20">Locker ${esc(user.username || initialsFor(user.displayName))}</span>
                <span class="px-3 py-1 border border-white/10 bg-black/20">${profile.earnedCount} badges earned</span>
              </div>
            </div>
            <div class="grid sm:grid-cols-3 gap-3">
              <div class="locker-stat p-4"><div class="text-[9px] uppercase text-white/35 font-black">Badge Wall</div><div class="text-2xl font-black mt-1">${profile.earnedCount} / ${profile.total}</div></div>
              <div class="locker-stat p-4"><div class="text-[9px] uppercase text-white/35 font-black">Completion</div><div class="text-2xl font-black mt-1">${percent}%</div></div>
              <div class="locker-stat p-4"><div class="text-[9px] uppercase text-white/35 font-black">Latest Patch</div><div class="text-lg font-black mt-1 truncate">${recent[0] ? esc(recent[0].title) : 'None yet'}</div></div>
            </div>
          </div>
          <div class="flex lg:flex-col items-center justify-center gap-4">
            <div class="locker-jersey" style="background:linear-gradient(180deg,${team?.primary || 'var(--student-team-primary,#013369)'},${team?.secondary || 'var(--student-team-secondary,#D50A0A)'})">
              <div class="relative z-10 text-center"><div class="text-[10px] uppercase tracking-widest text-white/70 font-black">${esc(team?.abbr || 'NFL')}</div><div class="text-5xl font-black leading-none">${esc(initialsFor(user.displayName))}</div></div>
            </div>
            ${team?.logo ? `<div class="w-20 h-20 rounded-full bg-black/35 border border-white/15 grid place-items-center"><img src="${esc(team.logo)}" alt="${esc(team.name)} logo" class="w-14 h-14 object-contain"></div>` : ''}
          </div>
        </div>
      </div>
      <div class="locker-section mb-6 p-5 md:p-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-5">
          <div><div class="text-[10px] uppercase tracking-[.24em] text-brand-400 font-black">Locker Cubbies</div><h2 class="text-2xl md:text-3xl font-black mt-2">Badge collection</h2><p class="text-sm text-white/45 mt-2">Earn patches from math plays, writing assignments, city scouting, and coach challenges.</p></div>
          <div class="h-2 w-full md:w-56 bg-white/10 overflow-hidden"><div class="h-full student-team-mark" style="width:${percent}%"></div></div>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${profile.categories.map(item => `<div class="locker-cubby p-4 pt-6"><div class="text-[9px] uppercase text-white/35 font-black">${esc(item.category)}</div><div class="flex items-end justify-between gap-3 mt-2"><div class="text-3xl font-black">${item.earned}</div><div class="text-xs text-white/35">of ${item.total}</div></div></div>`).join('')}</div>
      </div>
      ${recent.length ? `<div class="locker-section mb-6 p-5 md:p-6"><div class="flex items-center gap-2 mb-4"><iconify-icon icon="lucide:sparkles" class="text-brand-400"></iconify-icon><h2 class="font-black">Fresh from the equipment room</h2></div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${recent.map(badge => badgeMarkup(badge, true)).join('')}</div></div>` : ''}
      <div class="locker-section p-5 md:p-6">
        <div class="flex items-center justify-between gap-3 mb-5"><div><div class="text-[10px] uppercase tracking-[.24em] text-white/35 font-black">Patch Wall</div><h2 class="text-2xl font-black mt-1">All badges</h2></div><iconify-icon icon="lucide:shield-check" class="text-3xl text-white/25"></iconify-icon></div>
        <div class="locker-badge-grid grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${profile.badges.map(badge => badgeMarkup(badge)).join('')}</div>
      </div>
    </div>`;
  }

  function attachDashboardPreview(profile) {
    const attach = () => {
      const content = document.getElementById('sd-content');
      if (!content) return false;
      const earned = profile.earned.slice(0, 3);
      const html = `<div class="p-5 border-b border-white/10 flex items-center justify-between gap-3"><div><div class="text-[10px] uppercase text-white/35 font-bold">Badge Collection</div><h2 class="text-xl font-black mt-1">${profile.earnedCount} of ${profile.total} earned</h2></div><a href="index.html?page=profile" class="px-4 py-2 text-xs font-bold student-team-mark">Open Profile</a></div><div class="grid md:grid-cols-3 gap-px bg-white/10">${earned.length ? earned.map(badge => `<div class="bg-[#111]">${badgeMarkup(badge, true)}</div>`).join('') : '<div class="md:col-span-3 bg-[#111] p-6 text-sm text-white/35">Earn your first badge by answering a math play, submitting writing, or completing a City Scout challenge.</div>'}</div>`;
      const existing = document.getElementById('badge-dashboard-panel');
      if (existing) { existing.innerHTML = html; return true; }
      const panel = document.createElement('div');
      panel.id = 'badge-dashboard-panel';
      panel.className = 'border border-white/10 mb-6';
      panel.innerHTML = html;
      const anchor = [...content.children].find(child => String(child.className).includes('lg:grid-cols-[1.25fr_.75fr]'));
      content.insertBefore(panel, anchor || content.children[2] || null);
      return true;
    };
    if (attach()) return;
    const observer = new MutationObserver(() => { if (attach()) observer.disconnect(); });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  function refreshBadgeSurfaces(profile) {
    renderProfilePage(profile);
    attachDashboardPreview(profile);
  }

  function showNextBadge() {
    if (animating || !queue.length) return;
    animating = true;
    const badge = queue.shift();
    const overlay = document.createElement('div');
    overlay.className = 'badge-unlock-overlay';
    overlay.style.setProperty('--badge-accent', badge.accent || '#5b9bd5');
    overlay.innerHTML = `<div class="badge-unlock-card" style="--badge-accent:${badge.accent || '#5b9bd5'}">
      <div class="text-[10px] uppercase tracking-[.28em] text-white/40 font-bold">Badge Earned</div>
      <div class="badge-unlock-icon"><iconify-icon icon="lucide:${badge.icon}" class="text-5xl"></iconify-icon></div>
      <h2 class="text-3xl font-black">${esc(badge.title)}</h2>
      <p class="text-sm text-white/55 leading-6 mt-3">${esc(badge.description)}</p>
      <div class="mt-5 inline-flex items-center gap-2 px-4 py-2 border border-white/10 bg-white/5 text-[10px] uppercase tracking-widest text-white/55">${esc(badge.rarity)} / ${esc(badge.category)}</div>
    </div>`;
    for (let i = 0; i < 30; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'badge-confetti';
      piece.style.setProperty('--spin', `${i * 12}deg`);
      piece.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (30 + (i % 7) * 18)}px`);
      piece.style.animationDelay = `${(i % 8) * 0.035}s`;
      piece.style.background = i % 3 === 0 ? '#fff' : (i % 3 === 1 ? badge.accent : '#D50A0A');
      overlay.appendChild(piece);
    }
    document.body.appendChild(overlay);
    setTimeout(() => {
      overlay.remove();
      animating = false;
      showNextBadge();
    }, 3300);
  }

  window.showEarnedBadges = badges => {
    const fresh = Array.isArray(badges) ? badges.filter(badge => badge && badge.id) : [];
    if (!fresh.length) return;
    queue.push(...fresh);
    showNextBadge();
    api('/api/badges/profile').then(refreshBadgeSurfaces).catch(() => {});
  };

  window.refreshBadgeCollection = () => Promise.all([api('/api/me'), api('/api/badges/profile')]).then(([me, profile]) => { cachedUser = me.user; refreshBadgeSurfaces(profile); });

  Promise.all([api('/api/me'), api('/api/badges/profile')]).then(([me, profile]) => { cachedUser = me.user; refreshBadgeSurfaces(profile); }).catch(error => {
    const section = document.getElementById('profile');
    if (section && page === 'profile') section.innerHTML = `<div class="p-10 text-red-300">${esc(error.message)}</div>`;
  });
})();
