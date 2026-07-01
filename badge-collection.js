(() => {
  const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cachedUser = null;
  let cachedMath = null;
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
    .player-card{position:relative;overflow:hidden;background:linear-gradient(145deg,color-mix(in srgb,var(--student-team-primary,#013369) 72%,#080808),#0d0f13 58%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 44%,#090909));border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 80px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12)}
    .player-card:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.09),transparent 25%,transparent 75%,rgba(255,255,255,.07)),repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 2px,transparent 2px 14px);opacity:.5}
    .player-card-logo{background:rgba(0,0,0,.36);border:1px solid rgba(255,255,255,.18)}
    .badge-progress-track{position:relative;overflow:hidden;height:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 8px rgba(0,0,0,.28)}
    .badge-progress-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--student-team-primary,#013369),var(--student-team-secondary,#D50A0A),#facc15);box-shadow:0 0 26px color-mix(in srgb,var(--student-team-secondary,#D50A0A) 35%,transparent);transition:width .55s ease}
    .badge-progress-fill:after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent,rgba(255,255,255,.38),transparent);animation:badge-progress-shine 2.8s ease-in-out infinite}
    .trophy-case{position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.085),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 24px 80px rgba(0,0,0,.28)}
    .trophy-case:before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,rgba(255,255,255,.18),transparent 16%,transparent 48%,rgba(255,255,255,.08) 52%,transparent 70%);pointer-events:none}
    .locker-badge-grid{perspective:1200px}
    .badge-card{position:relative;overflow:hidden;background:linear-gradient(145deg,rgba(24,26,30,.98),rgba(10,11,13,.98));border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 48px rgba(0,0,0,.28);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
    .badge-card:hover{transform:translateY(-3px) rotateX(2deg);border-color:color-mix(in srgb,var(--badge-accent,#5b9bd5) 55%,rgba(255,255,255,.12));box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 38px color-mix(in srgb,var(--badge-accent,#5b9bd5) 16%,transparent)}
    .badge-card.locked{filter:saturate(.18);opacity:.5}
    .badge-card:before{content:'';position:absolute;inset:-1px;background:radial-gradient(circle at 50% 0,var(--badge-accent,rgba(91,155,213,.5)),transparent 42%);opacity:.2;pointer-events:none}
    .badge-card:after{content:'';position:absolute;top:10px;right:12px;width:30px;height:8px;border-top:2px solid rgba(255,255,255,.16);border-bottom:2px solid rgba(255,255,255,.1);opacity:.8}
    .badge-unlock-overlay{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:radial-gradient(circle at center,rgba(91,155,213,.16),rgba(0,0,0,.78));pointer-events:none;overflow:hidden}
    .badge-unlock-card{position:relative;width:min(420px,calc(100vw - 32px));padding:30px 26px 26px;text-align:center;background:rgba(9,13,20,.92);border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 90px rgba(0,0,0,.58),0 0 80px color-mix(in srgb,var(--badge-accent,#5b9bd5) 38%,transparent);animation:badge-pop .72s cubic-bezier(.2,1.25,.2,1) both}
    .badge-unlock-card:before{content:'';position:absolute;inset:-2px;background:linear-gradient(135deg,var(--badge-accent,#5b9bd5),transparent 38%,rgba(255,255,255,.25),transparent 65%,var(--badge-accent,#5b9bd5));opacity:.55;z-index:-1;filter:blur(10px)}
    .badge-confetti{position:absolute;width:10px;height:22px;border-radius:999px;background:var(--badge-accent,#5b9bd5);left:50%;top:50%;opacity:.88;transform:rotate(var(--spin)) translateY(-46vh);animation:badge-confetti 1.28s ease-out forwards}
    .badge-rarity-common{--badge-metal:conic-gradient(from 18deg,#ffffff,#b9c4cf 15%,#f8fafc 28%,#778492 47%,#edf2f7 62%,#9aa7b5 78%,#ffffff);--badge-metal-inner:radial-gradient(circle at 33% 25%,#ffffff,#d8e0e8 28%,#9daab7 58%,#64717e);--badge-metal-edge:#f8fafc;--badge-metal-shadow:#6f7f8f;--badge-metal-glow:rgba(210,226,240,.28);--badge-ink:#1f2937}
    .badge-rarity-rare{--badge-metal:conic-gradient(from 18deg,#fff8c9,#f3c55b 14%,#fff4a8 31%,#9c6517 48%,#ffd76b 65%,#b97818 82%,#fff8d8);--badge-metal-inner:radial-gradient(circle at 32% 24%,#fff8c9,#ffd76b 34%,#c8851f 65%,#75420d);--badge-metal-edge:#fff2a3;--badge-metal-shadow:#8f5813;--badge-metal-glow:rgba(250,204,21,.36);--badge-ink:#3f2506}
    .badge-rarity-epic{--badge-metal:conic-gradient(from 18deg,#fffbd1,#f5d66d 13%,#fffef2 26%,#d6aa31 38%,#f3c55b 54%,#ffffff 66%,#9f7aea 78%,#ffd56a);--badge-metal-inner:radial-gradient(circle at 30% 20%,#ffffff,#ffe58a 28%,#d4a528 56%,#6d4a0b 78%,#7c3aed);--badge-metal-edge:#fff7bc;--badge-metal-shadow:#7c4a09;--badge-metal-glow:rgba(251,191,36,.52);--badge-ink:#2f1d05}
    .badge-card{isolation:isolate;background:linear-gradient(145deg,rgba(255,255,255,.075),transparent 22%),radial-gradient(circle at 72% 0,var(--badge-metal-glow),transparent 34%),linear-gradient(145deg,rgba(24,26,30,.98),rgba(10,11,13,.98));border-color:color-mix(in srgb,var(--badge-metal-edge) 38%,rgba(255,255,255,.1));box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 18px 48px rgba(0,0,0,.28),0 0 34px var(--badge-metal-glow)}
    .badge-card:hover{border-color:color-mix(in srgb,var(--badge-metal-edge) 70%,rgba(255,255,255,.1));box-shadow:0 24px 66px rgba(0,0,0,.42),0 0 56px var(--badge-metal-glow)}
    .badge-card:before{background:radial-gradient(circle at 24% 0,var(--badge-metal-glow),transparent 44%),linear-gradient(115deg,transparent 0 34%,rgba(255,255,255,.16) 43%,transparent 52%);opacity:.72}
    .badge-card:after{top:-45%;right:auto;left:-80%;width:52%;height:190%;border:0;background:linear-gradient(110deg,transparent,rgba(255,255,255,.34),transparent);opacity:.55;transform:rotate(18deg);animation:badge-card-shine 5.8s ease-in-out infinite}
    .badge-card.locked{filter:saturate(.2);opacity:.48}
    .badge-card.locked:after{animation:none;opacity:.1}
    .badge-rarity-label{color:color-mix(in srgb,var(--badge-metal-edge) 70%,rgba(255,255,255,.38))}
    .badge-medal-wrap{position:relative;display:grid;place-items:center;width:92px;margin:0 auto 16px;filter:drop-shadow(0 16px 24px rgba(0,0,0,.4))}
    .badge-card-compact .badge-medal-wrap{width:62px;margin:0;filter:drop-shadow(0 10px 16px rgba(0,0,0,.36))}
    .badge-medal{position:relative;display:grid;place-items:center;border-radius:999px;background:var(--badge-metal);color:var(--badge-ink);box-shadow:inset 0 2px 3px rgba(255,255,255,.75),inset 0 -8px 15px rgba(0,0,0,.35),0 0 36px var(--badge-metal-glow)}
    .badge-medal-lg{width:86px;height:86px}.badge-medal-sm{width:56px;height:56px}
    .badge-medal:before{content:'';position:absolute;inset:8px;border-radius:inherit;background:var(--badge-metal-inner);box-shadow:inset 0 2px 6px rgba(255,255,255,.52),inset 0 -9px 12px rgba(0,0,0,.34);z-index:0}
    .badge-medal:after{content:'';position:absolute;inset:15px;border-radius:inherit;border:1px solid rgba(255,255,255,.5);background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.22) 0 8deg,transparent 8deg 18deg);opacity:.62;z-index:1}
    .badge-medal-star{position:absolute;inset:-12px;background:var(--badge-metal);clip-path:polygon(50% 0,58% 18%,78% 8%,76% 30%,98% 35%,82% 50%,98% 65%,76% 70%,78% 92%,58% 82%,50% 100%,42% 82%,22% 92%,24% 70%,2% 65%,18% 50%,2% 35%,24% 30%,22% 8%,42% 18%);opacity:.46;z-index:-1}
    .badge-medal-icon{position:relative;z-index:2;display:grid;place-items:center;width:56%;height:56%;border-radius:999px;background:rgba(255,255,255,.26);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 1px 8px rgba(0,0,0,.18)}
    .badge-medal-pips{position:absolute;left:50%;bottom:11px;z-index:3;display:flex;gap:3px;transform:translateX(-50%)}
    .badge-medal-sm .badge-medal-pips{bottom:6px;gap:2px}.badge-medal-pips span{width:5px;height:5px;border-radius:999px;background:var(--badge-ink);opacity:.72}.badge-medal-sm .badge-medal-pips span{width:3px;height:3px}
    .badge-medal-ribbons{position:absolute;top:72%;display:flex;gap:5px;z-index:-2}.badge-medal-ribbons span{width:22px;height:34px;background:linear-gradient(180deg,var(--badge-accent,#5b9bd5),rgba(0,0,0,.28));clip-path:polygon(0 0,100% 0,86% 100%,50% 76%,14% 100%);border:1px solid rgba(255,255,255,.16)}
    .badge-card-compact .badge-medal-ribbons span{width:15px;height:24px}.badge-card-compact .badge-medal-ribbons{gap:3px}
    .badge-unlock-overlay{background:radial-gradient(circle at center,var(--badge-metal-glow),rgba(0,0,0,.82) 58%)}
    .badge-unlock-card{border-color:color-mix(in srgb,var(--badge-metal-edge) 50%,rgba(255,255,255,.14));box-shadow:0 30px 90px rgba(0,0,0,.58),0 0 110px var(--badge-metal-glow)}
    .badge-unlock-card .badge-medal-wrap{width:132px;margin:20px auto 18px;animation:badge-pulse 1.1s ease-in-out infinite}
    .badge-unlock-card .badge-medal-lg{width:124px;height:124px}
    .badge-unlock-card .badge-medal-ribbons span{width:30px;height:44px}
    @keyframes badge-pop{0%{opacity:0;transform:translateY(26px) scale(.76) rotateX(22deg)}55%{opacity:1;transform:translateY(-8px) scale(1.05) rotateX(0)}100%{opacity:1;transform:translateY(0) scale(1) rotateX(0)}}
    @keyframes badge-pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 color-mix(in srgb,var(--badge-accent,#5b9bd5) 36%,transparent)}50%{transform:scale(1.08);box-shadow:0 0 0 16px transparent}}
    @keyframes badge-confetti{0%{transform:rotate(var(--spin)) translateY(0) scale(.7);opacity:1}100%{transform:rotate(var(--spin)) translateY(-52vh) translateX(var(--drift)) scale(1);opacity:0}}
    @keyframes badge-card-shine{0%,42%{transform:translateX(0) rotate(18deg)}62%,100%{transform:translateX(360%) rotate(18deg)}}
    @keyframes badge-progress-shine{0%,45%{transform:translateX(-100%)}75%,100%{transform:translateX(100%)}}
  `;
  document.head.appendChild(style);

  async function api(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Badges could not load.');
    return data;
  }

  function rarityClass(badge) {
    return `badge-rarity-${String(badge?.rarity || 'Common').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }

  function rarityPips(badge) {
    const rarity = String(badge?.rarity || 'Common').toLowerCase();
    const count = rarity === 'epic' ? 3 : rarity === 'rare' ? 2 : 1;
    return Array.from({ length:count }, () => '<span></span>').join('');
  }

  function badgeMedalMarkup(badge, compact = false) {
    const iconName = badge.earned ? (badge.icon || 'award') : 'lock';
    return `<div class="badge-medal-wrap">
      <div class="badge-medal ${compact ? 'badge-medal-sm' : 'badge-medal-lg'}">
        <div class="badge-medal-star"></div>
        <div class="badge-medal-icon"><iconify-icon icon="lucide:${esc(iconName)}" class="${compact ? 'text-xl' : 'text-3xl'}"></iconify-icon></div>
        <div class="badge-medal-pips">${rarityPips(badge)}</div>
      </div>
      <div class="badge-medal-ribbons"><span></span><span></span></div>
    </div>`;
  }

  function badgeConfettiColors(badge) {
    const rarity = String(badge?.rarity || 'Common').toLowerCase();
    if (rarity === 'epic') return ['#fff7bc', '#f5c542', '#ffffff', '#8b5cf6', badge.accent || '#facc15'];
    if (rarity === 'rare') return ['#fff4a8', '#facc15', '#b97818', '#ffffff', badge.accent || '#facc15'];
    return ['#f8fafc', '#cbd5e1', '#94a3b8', '#ffffff', badge.accent || '#cbd5e1'];
  }

  function badgeMarkup(badge, compact = false) {
    return `<div class="badge-card ${rarityClass(badge)} ${badge.earned ? '' : 'locked'} ${compact ? 'badge-card-compact p-3' : 'p-5'}" style="--badge-accent:${badge.accent}">
      <div class="relative z-10 ${compact ? 'flex items-center gap-3' : ''}">
        ${badgeMedalMarkup(badge, compact)}
        <div class="${compact ? 'min-w-0' : 'mt-4'}">
          <div class="badge-rarity-label text-[9px] uppercase tracking-widest">${esc(badge.rarity)} / ${esc(badge.category)}</div>
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

  function badgeProgressBar(percent, earnedCount, total) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    return `<div class="mb-5">
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="text-[10px] uppercase tracking-widest text-white/35 font-black">Badge Completion</div>
        <div class="text-xs text-white/45">${value}% complete · ${Number(earnedCount || 0)} of ${Number(total || 0)}</div>
      </div>
      <div class="badge-progress-track"><div class="badge-progress-fill" style="width:${value}%"></div></div>
    </div>`;
  }

  function renderProfilePage(profile) {
    const section = document.getElementById('profile');
    if (!section) return;
    const recent = profile.earned.slice(0, 4);
    const user = cachedUser || {};
    const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(user.selectedTeam) : null;
    const math = cachedMath?.profile || {};
    const percent = profile.total ? Math.round(profile.earnedCount / profile.total * 100) : 0;
    const accuracy = math.questions_answered ? Math.round(Number(math.correct_answers || 0) / Number(math.questions_answered || 1) * 100) : 0;
    const favoriteBadge = recent[0];
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
      <div class="mb-6">
        <div class="player-card p-5">
          <div class="relative z-10">
            <div class="flex items-start justify-between gap-4">
              <div><div class="text-[10px] uppercase tracking-[.24em] text-white/50 font-black">Student Trading Card</div><h2 class="text-3xl font-black mt-2">${esc(user.displayName || 'Student')}</h2><p class="text-xs text-white/55 mt-2">${esc(team?.name || 'Free Agent')} / ${esc(math.level || 'Rookie')}</p></div>
              <div class="player-card-logo w-20 h-20 grid place-items-center shrink-0">${team?.logo ? `<img src="${esc(team.logo)}" alt="${esc(team.name)} logo" class="w-14 h-14 object-contain">` : `<span class="font-black">${esc(team?.abbr || 'NFL')}</span>`}</div>
            </div>
            <div class="mt-6 h-44 grid place-items-center border border-white/12 bg-black/20"><div class="locker-jersey scale-75" style="background:linear-gradient(180deg,${team?.primary || 'var(--student-team-primary,#013369)'},${team?.secondary || 'var(--student-team-secondary,#D50A0A)'})"><div class="relative z-10 text-center"><div class="text-[10px] uppercase tracking-widest text-white/70 font-black">${esc(team?.abbr || 'NFL')}</div><div class="text-5xl font-black leading-none">${esc(initialsFor(user.displayName))}</div></div></div></div>
            <div class="grid grid-cols-2 gap-px bg-white/10 border border-white/10 mt-5">
              <div class="bg-black/35 p-3"><div class="text-[8px] uppercase text-white/35 font-black">XP</div><div class="text-xl font-black">${Number(math.total_xp || 0).toLocaleString()}</div></div>
              <div class="bg-black/35 p-3"><div class="text-[8px] uppercase text-white/35 font-black">Level</div><div class="text-xl font-black truncate">${esc(math.level || 'Rookie')}</div></div>
              <div class="bg-black/35 p-3"><div class="text-[8px] uppercase text-white/35 font-black">Favorite Badge</div><div class="text-sm font-black truncate">${favoriteBadge ? esc(favoriteBadge.title) : 'None yet'}</div></div>
              <div class="bg-black/35 p-3"><div class="text-[8px] uppercase text-white/35 font-black">Accuracy</div><div class="text-xl font-black">${accuracy}%</div></div>
            </div>
            <div class="mt-5 text-[10px] uppercase tracking-widest text-white/35 font-black">Season Stats</div>
            <div class="grid grid-cols-3 gap-2 mt-2 text-center"><div class="bg-black/25 border border-white/10 p-2"><div class="text-lg font-black">${math.touchdowns || 0}</div><div class="text-[8px] text-white/35">TD</div></div><div class="bg-black/25 border border-white/10 p-2"><div class="text-lg font-black">${math.current_streak || 0}</div><div class="text-[8px] text-white/35">Streak</div></div><div class="bg-black/25 border border-white/10 p-2"><div class="text-lg font-black">${math.questions_answered || 0}</div><div class="text-[8px] text-white/35">Answers</div></div></div>
          </div>
        </div>
      </div>
      <div class="trophy-case p-5 md:p-6">
        ${badgeProgressBar(percent, profile.earnedCount, profile.total)}
        <div class="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
          <div><div class="text-[10px] uppercase tracking-[.24em] text-brand-400 font-black">Badge Trophy Case</div><h2 class="text-2xl md:text-3xl font-black mt-2">Badge collection</h2><p class="text-sm text-white/45 mt-2">Earn patches from math plays, writing assignments, city scouting, and coach challenges.</p></div>
          <div class="text-sm text-white/45">${profile.earnedCount} of ${profile.total} earned</div>
        </div>
        <div class="relative z-10 locker-badge-grid grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${profile.badges.map(badge => badgeMarkup(badge)).join('')}</div>
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
    overlay.className = `badge-unlock-overlay ${rarityClass(badge)}`;
    overlay.style.setProperty('--badge-accent', badge.accent || '#5b9bd5');
    overlay.innerHTML = `<div class="badge-unlock-card ${rarityClass(badge)}" style="--badge-accent:${badge.accent || '#5b9bd5'}">
      <div class="text-[10px] uppercase tracking-[.28em] text-white/40 font-bold">Badge Earned</div>
      ${badgeMedalMarkup(badge)}
      <h2 class="text-3xl font-black">${esc(badge.title)}</h2>
      <p class="text-sm text-white/55 leading-6 mt-3">${esc(badge.description)}</p>
      <div class="badge-rarity-label mt-5 inline-flex items-center gap-2 px-4 py-2 border border-white/10 bg-white/5 text-[10px] uppercase tracking-widest">${esc(badge.rarity)} / ${esc(badge.category)}</div>
    </div>`;
    const colors = badgeConfettiColors(badge);
    for (let i = 0; i < 30; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'badge-confetti';
      piece.style.setProperty('--spin', `${i * 12}deg`);
      piece.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (30 + (i % 7) * 18)}px`);
      piece.style.animationDelay = `${(i % 8) * 0.035}s`;
      piece.style.background = colors[i % colors.length];
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

  window.refreshBadgeCollection = () => Promise.all([api('/api/me'), api('/api/badges/profile'), api('/api/math-game/profile')]).then(([me, profile, math]) => { cachedUser = me.user; cachedMath = math; refreshBadgeSurfaces(profile); });

  Promise.all([api('/api/me'), api('/api/badges/profile'), api('/api/math-game/profile')]).then(([me, profile, math]) => { cachedUser = me.user; cachedMath = math; refreshBadgeSurfaces(profile); }).catch(error => {
    const section = document.getElementById('profile');
    if (section && page === 'profile') section.innerHTML = `<div class="p-10 text-red-300">${esc(error.message)}</div>`;
  });
})();
