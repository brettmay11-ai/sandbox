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
  const fieldProgress = (yards, height = 'h-24') => {
    const value = Math.max(0, Math.min(100, Number(yards) || 0));
    return `<div class="${height} relative overflow-hidden border border-white/10" style="background:repeating-linear-gradient(90deg,#174d2a 0,#174d2a calc(10% - 1px),rgba(255,255,255,.22) calc(10% - 1px),rgba(255,255,255,.22) 10%)">
      <div class="absolute left-0 top-0 bottom-0 w-10 grid place-items-center text-[7px] font-black text-white/65" style="background:var(--student-team-primary,#013369);writing-mode:vertical-rl">END ZONE</div>
      <div class="absolute right-0 top-0 bottom-0 w-10 grid place-items-center text-[7px] font-black text-white/65" style="background:var(--student-team-primary,#013369);writing-mode:vertical-rl">END ZONE</div>
      <div class="absolute left-0 top-0 bottom-0 bg-yellow-400/20 border-r-2 border-yellow-300" style="width:${value}%"></div>
      <div class="absolute top-1/2 w-8 h-5 rounded-full border-2 border-white/75 shadow-lg" style="left:${value}%;background:#7b3f18;transform:translate(-50%,-50%)"><span class="absolute left-2 right-2 top-1/2 h-0.5 bg-white -translate-y-1/2"></span><span class="absolute left-1/2 top-1 bottom-1 w-0.5 bg-white -translate-x-1/2"></span></div>
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
        <div class="border border-white/10"><div class="p-5 border-b border-white/10 flex justify-between gap-3"><div><div class="text-[10px] uppercase text-white/35 font-bold">Level Progress</div><h2 class="text-xl font-black mt-1">${esc(profile.level)}</h2></div><div class="text-right text-xs text-white/45">${profile.nextLevel ? `${profile.xpToNext} XP to ${esc(profile.nextLevel)}` : 'Highest level reached'}</div></div><div class="p-5">${fieldProgress(levelProgress, 'h-24')}<div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 mt-5 border border-white/10"><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Touchdowns</div><div class="text-xl font-black mt-1">${profile.touchdowns || 0}</div></div><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Accuracy</div><div class="text-xl font-black mt-1">${accuracy}%</div></div><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Current Streak</div><div class="text-xl font-black mt-1">${profile.current_streak || 0}</div></div><div class="bg-[#111] p-4"><div class="text-[9px] uppercase text-white/35">Best Streak</div><div class="text-xl font-black mt-1">${profile.best_streak || 0}</div></div></div></div></div>
        <div class="border border-white/10"><div class="p-5 border-b border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Current Drive</div><h2 class="text-xl font-black mt-1">${profile.drive_yards || 0} of 100 yards</h2></div><div class="p-5">${fieldProgress(profile.drive_yards || 0, 'h-48')}</div></div>
      </div>
      <div class="grid lg:grid-cols-2 gap-6"><div class="border border-white/10"><div class="p-5 border-b border-white/10"><h2 class="font-bold">Weekly Leaders</h2></div><div class="px-5">${leaderRows(game.weekly, 'xp')}</div></div><div class="border border-white/10"><div class="p-5 border-b border-white/10"><h2 class="font-bold">Season Leaders</h2></div><div class="px-5">${leaderRows(game.allTime, 'total_xp')}</div></div></div>`;
    document.getElementById('sd-loading').remove();
    content.classList.remove('hidden');
  }).catch(error => {
    document.getElementById('sd-loading').textContent = error.message;
  });
})();
