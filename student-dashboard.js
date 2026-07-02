(() => {
  const section = document.getElementById('dashboard');
  if (!section) return;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const api = async url => {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) location.href = '/login';
    if (!response.ok) throw new Error(data.error || 'Dashboard could not load.');
    return data;
  };
  const rankText = rank => rank?.position ? `#${rank.position} of ${rank.total}` : 'Not ranked yet';
  const leaderRows = (rows, field) => rows.length ? rows.slice(0, 5).map((row, index) => `<div class="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-3 border-b border-white/5"><span class="text-xs font-black text-white/30">${index + 1}</span><span class="min-w-0"><span class="block text-xs font-semibold truncate">${esc(row.display_name || row.username)}</span><span class="block text-[10px] text-white/35">${esc(row.selected_team || 'Unassigned')}</span></span><span class="text-xs font-black">${Number(row[field] || 0).toLocaleString()} XP</span></div>`).join('') : '<div class="py-8 text-center text-xs text-white/35">No scores yet.</div>';
  const style = document.createElement('style');
  style.textContent = `
    .real-field{position:relative;isolation:isolate;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:radial-gradient(circle at 18% 20%,rgba(255,255,255,.08) 0 1px,transparent 1px 7px),radial-gradient(circle at 64% 72%,rgba(255,255,255,.055) 0 1px,transparent 1px 8px),repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 2px,transparent 2px 7px),linear-gradient(90deg,#0b351f 0,#176334 48%,#0d4326 100%);box-shadow:inset 0 18px 50px rgba(255,255,255,.04),inset 0 -22px 60px rgba(0,0,0,.42),0 18px 46px rgba(0,0,0,.25)}
    .real-field:before{content:'';position:absolute;left:48px;right:48px;top:0;bottom:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.78) 0 2px,transparent 2px 10%),linear-gradient(180deg,rgba(255,255,255,.72) 0 2px,transparent 2px calc(100% - 2px),rgba(255,255,255,.72) calc(100% - 2px));opacity:.72;z-index:1;pointer-events:none}
    .real-field:after{content:'';position:absolute;left:48px;right:48px;top:23%;bottom:23%;background:repeating-linear-gradient(90deg,transparent 0 calc(5% - 1px),rgba(255,255,255,.58) calc(5% - 1px) 5%);opacity:.62;z-index:1;pointer-events:none}
    .real-endzone{position:absolute;top:0;bottom:0;width:48px;z-index:2;display:grid;place-items:center;background:linear-gradient(180deg,color-mix(in srgb,var(--student-team-primary,#013369) 78%,#000),color-mix(in srgb,var(--student-team-secondary,#D50A0A) 36%,#000));box-shadow:inset 0 0 28px rgba(0,0,0,.45)}
    .real-endzone.left{left:0}.real-endzone.right{right:0}
    .real-endzone span{font-size:8px;font-weight:900;letter-spacing:.14em;color:rgba(255,255,255,.78);writing-mode:vertical-rl;text-transform:uppercase;text-shadow:0 1px 4px rgba(0,0,0,.7)}
    .real-progress{position:absolute;left:48px;top:0;bottom:0;background:linear-gradient(90deg,rgba(255,218,77,.1),rgba(255,218,77,.24));border-right:3px solid #f7d154;box-shadow:0 0 24px rgba(247,209,84,.24);z-index:3}
    .real-yard-number{position:absolute;top:12px;z-index:2;transform:translateX(-50%);font-size:10px;font-weight:900;color:rgba(255,255,255,.48);text-shadow:0 1px 3px rgba(0,0,0,.65)}
    .real-yard-number.bottom{top:auto;bottom:12px;transform:translateX(-50%) rotate(180deg)}
    .real-football{position:absolute;top:50%;z-index:4;width:34px;height:21px;border-radius:50%;background:radial-gradient(circle at 30% 28%,#d89455,#8a411f 58%,#4b1f0e);border:1px solid rgba(255,255,255,.5);box-shadow:0 10px 18px rgba(0,0,0,.42),inset 0 2px 4px rgba(255,255,255,.22);transform:translate(-50%,-50%) rotate(-18deg)}
    .real-football:before{content:'';position:absolute;left:7px;right:7px;top:9px;height:2px;background:rgba(255,255,255,.86);box-shadow:0 0 4px rgba(255,255,255,.45)}
    .real-football:after{content:'';position:absolute;left:13px;top:5px;width:8px;height:11px;border-left:2px solid rgba(255,255,255,.85);border-right:2px solid rgba(255,255,255,.85)}
    .xp-meter{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:radial-gradient(circle at 18% 30%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 24%,transparent),transparent 34%),linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.015));box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 18px 48px rgba(0,0,0,.24)}
    .xp-meter:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 1px,transparent 1px 12px);opacity:.4;pointer-events:none}
    .xp-track{position:relative;height:22px;overflow:hidden;background:rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 2px 12px rgba(0,0,0,.44)}
    .xp-fill{height:100%;background:linear-gradient(90deg,var(--student-team-primary,#013369),var(--student-team-secondary,#D50A0A),#f7d154);box-shadow:0 0 28px color-mix(in srgb,var(--student-team-secondary,#D50A0A) 55%,transparent);transition:width .6s ease}
    .xp-check{position:absolute;top:-7px;bottom:-7px;width:1px;background:rgba(255,255,255,.22)}
    .xp-medallion{width:72px;height:72px;border-radius:999px;display:grid;place-items:center;background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.32),transparent 28%),linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));box-shadow:0 0 0 1px rgba(255,255,255,.22),0 18px 42px rgba(0,0,0,.32)}
  `;
  document.head.appendChild(style);
  const xpMeter = (percent, profile) => {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const ticks = [25,50,75].map(mark => `<span class="xp-check" style="left:${mark}%"></span>`).join('');
    return `<div class="xp-meter p-5">
      <div class="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
        <div class="xp-medallion shrink-0"><div class="text-center"><div class="text-[9px] uppercase text-white/60 font-black">Level</div><div class="text-2xl font-black">${esc(profile.level || 'Rookie').slice(0, 2).toUpperCase()}</div></div></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-3 mb-3"><span class="text-[10px] uppercase text-white/35 font-black">XP Meter</span><span class="text-xs font-black text-white">${value}%</span></div>
          <div class="xp-track">${ticks}<div class="xp-fill" style="width:${value}%"></div></div>
          <div class="mt-3 flex justify-between text-[9px] uppercase text-white/35 font-black"><span>${Number(profile.total_xp || 0).toLocaleString()} XP</span><span>${profile.nextLevel ? esc(profile.nextLevel) : 'Max Level'}</span></div>
        </div>
      </div>
    </div>`;
  };
  const fieldProgress = (yards, height = 'h-24') => {
    const value = Math.max(0, Math.min(100, Number(yards) || 0));
    const left = `calc(48px + (100% - 96px) * ${value / 100})`;
    const width = `calc((100% - 96px) * ${value / 100})`;
    const numbers = [10,20,30,40,50,40,30,20,10].map((number, index) => {
      const position = `calc(48px + (100% - 96px) * ${(index + 1) / 10})`;
      return `<span class="real-yard-number" style="left:${position}">${number}</span><span class="real-yard-number bottom" style="left:${position}">${number}</span>`;
    }).join('');
    return `<div class="${height} real-field">
      <div class="real-endzone left"><span>End Zone</span></div>
      <div class="real-endzone right"><span>End Zone</span></div>
      ${numbers}
      <div class="real-progress" style="width:${width}"></div>
      <div class="real-football" style="left:${left}"></div>
    </div>`;
  };

  section.innerHTML = '<div class="max-w-6xl mx-auto"><div id="sd-loading" class="py-24 text-center text-sm text-white/40">Loading your dashboard...</div><div id="sd-content" class="hidden"></div></div>';

  Promise.all([api('/api/me'), api('/api/math-game/profile')]).then(([me, game]) => {
    const user = me.user;
    const profile = game.profile;
    const team = typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(user.selectedTeam) : null;
    const accuracy = profile.questions_answered ? Math.round(profile.correct_answers / profile.questions_answered * 100) : 0;
    const nextTotal = Number(profile.total_xp || 0) + Number(profile.xpToNext || 0);
    const levelProgress = profile.nextLevel && nextTotal ? Math.round(Number(profile.total_xp || 0) / nextTotal * 100) : 100;
    const content = document.getElementById('sd-content');
    content.innerHTML = `
      <div class="mb-8 border-y border-white/10 py-6 flex flex-col md:flex-row md:items-end justify-between gap-5"><div class="flex items-center gap-4"><div class="student-team-mark w-16 h-16 grid place-items-center text-lg font-black">${team?.abbr || 'NFL'}</div><div><div class="text-[10px] uppercase tracking-[.2em] text-white/40">Student Dashboard</div><h1 class="text-3xl md:text-4xl font-black mt-1">${esc(user.displayName)}</h1><p class="text-xs text-white/45 mt-2">${esc(team?.name || 'Team assignment pending')}</p></div></div><a href="index.html?page=math" class="inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold text-white student-team-mark"><iconify-icon icon="lucide:play"></iconify-icon>Play Math Game</a></div>
      <div class="grid grid-cols-2 lg:grid-cols-4 border border-white/10 mb-6"><div class="p-5 border-r border-b lg:border-b-0 border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Total XP</div><div class="text-3xl font-black mt-2">${Number(profile.total_xp || 0).toLocaleString()}</div></div><div class="p-5 lg:border-r border-b lg:border-b-0 border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Season Rank</div><div class="text-2xl font-black mt-2">${rankText(game.rankings?.season)}</div></div><div class="p-5 border-r border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Weekly Rank</div><div class="text-2xl font-black mt-2">${rankText(game.rankings?.weekly)}</div></div><div class="p-5"><div class="text-[10px] uppercase text-white/35 font-bold">Questions Answered</div><div class="text-3xl font-black mt-2">${profile.questions_answered || 0}</div></div></div>
      <div class="grid lg:grid-cols-[1.25fr_.75fr] gap-6 mb-6">
        <div class="border border-white/10"><div class="p-5 border-b border-white/10 flex justify-between gap-3"><div><div class="text-[10px] uppercase text-white/35 font-bold">Level Progress</div><h2 class="text-xl font-black mt-1">${esc(profile.level)}</h2></div><div class="text-right text-xs text-white/45">${profile.nextLevel ? `${profile.xpToNext} XP to ${esc(profile.nextLevel)}` : 'Highest level reached'}</div></div><div class="p-5">${xpMeter(levelProgress, profile)}<div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 mt-5 border border-white/10"><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Touchdowns</div><div class="text-xl font-black mt-1">${profile.touchdowns || 0}</div></div><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Accuracy</div><div class="text-xl font-black mt-1">${accuracy}%</div></div><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Current Streak</div><div class="text-xl font-black mt-1">${profile.current_streak || 0}</div></div><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Best Streak</div><div class="text-xl font-black mt-1">${profile.best_streak || 0}</div></div></div></div></div>
        <div class="border border-white/10"><div class="p-5 border-b border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Current Drive</div><h2 class="text-xl font-black mt-1">${profile.drive_yards || 0} of 100 yards</h2></div><div class="p-5">${fieldProgress(profile.drive_yards || 0, 'h-48')}</div></div>
      </div>
      <div class="grid lg:grid-cols-2 gap-6"><div class="border border-white/10"><div class="p-5 border-b border-white/10"><h2 class="font-bold">Weekly Leaders</h2></div><div class="px-5">${leaderRows(game.weekly, 'xp')}</div></div><div class="border border-white/10"><div class="p-5 border-b border-white/10"><h2 class="font-bold">Season Leaders</h2></div><div class="px-5">${leaderRows(game.allTime, 'total_xp')}</div></div></div>`;
    document.getElementById('sd-loading').remove();
    content.classList.remove('hidden');
  }).catch(error => {
    document.getElementById('sd-loading').textContent = error.message;
  });
})();
