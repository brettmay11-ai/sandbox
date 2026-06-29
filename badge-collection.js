(() => {
  const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cachedUser = null;
  const queue = [];
  let animating = false;

  const style = document.createElement('style');
  style.textContent = `
    .badge-card{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.12)}
    .badge-card.locked{filter:saturate(.18);opacity:.46}
    .badge-card:before{content:'';position:absolute;inset:-1px;background:radial-gradient(circle at var(--badge-x,50%) 0,var(--badge-accent,rgba(91,155,213,.5)),transparent 42%);opacity:.24;pointer-events:none}
    .badge-icon{background:color-mix(in srgb,var(--badge-accent,#5b9bd5) 22%,transparent);border:1px solid color-mix(in srgb,var(--badge-accent,#5b9bd5) 65%,transparent);color:var(--badge-accent,#5b9bd5)}
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
    section.innerHTML = `<div class="max-w-6xl mx-auto px-4 md:px-6">
      <div class="border-y border-white/10 py-7 mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div class="flex items-center gap-4"><div class="student-team-mark w-16 h-16 rounded-full grid place-items-center text-lg font-black">${esc(initialsFor(user.displayName))}</div><div><div class="text-[10px] uppercase tracking-[.2em] text-brand-400 font-bold">Student Profile</div><h1 class="text-3xl md:text-4xl font-black mt-2">${esc(user.displayName || 'Student')}</h1><p class="text-sm text-white/45 mt-2">${esc(team?.name || 'Team assignment pending')} / ${esc(user.username || '')}</p></div></div>
        <div class="flex gap-px bg-white/10 border border-white/10"><div class="bg-[#111] px-5 py-3"><div class="text-[9px] uppercase text-white/35">Earned</div><div class="text-xl font-black">${profile.earnedCount} / ${profile.total}</div></div><div class="bg-[#111] px-5 py-3"><div class="text-[9px] uppercase text-white/35">Latest</div><div class="text-xl font-black">${recent[0] ? esc(recent[0].title) : 'None yet'}</div></div></div>
      </div>
      <div class="mb-6 border border-white/10 p-5"><div class="text-[10px] uppercase tracking-[.2em] text-brand-400 font-bold">Badge Collection</div><h2 class="text-2xl font-black mt-2">Your locker of wins</h2><p class="text-sm text-white/45 mt-2">Earn badges from math plays, writing assignments, city scouting, and coach challenges.</p></div>
      <div class="grid md:grid-cols-4 gap-px bg-white/10 border border-white/10 mb-6">${profile.categories.map(item => `<div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35 font-bold">${esc(item.category)}</div><div class="text-xl font-black mt-1">${item.earned} / ${item.total}</div></div>`).join('')}</div>
      ${recent.length ? `<div class="mb-6"><h2 class="font-bold mb-3">Recently Earned</h2><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">${recent.map(badge => badgeMarkup(badge, true)).join('')}</div></div>` : ''}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${profile.badges.map(badge => badgeMarkup(badge)).join('')}</div>
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
