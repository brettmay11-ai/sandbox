(() => {
  const section = document.getElementById('math');
  if (!section) return;

  const style = document.createElement('style');
  style.textContent = `
    .math-game-field{position:relative;height:112px;isolation:isolate;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:radial-gradient(circle at 18% 20%,rgba(255,255,255,.08) 0 1px,transparent 1px 7px),radial-gradient(circle at 64% 72%,rgba(255,255,255,.055) 0 1px,transparent 1px 8px),repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 2px,transparent 2px 7px),linear-gradient(90deg,#0b351f 0,#176334 48%,#0d4326 100%);box-shadow:inset 0 18px 50px rgba(255,255,255,.04),inset 0 -22px 60px rgba(0,0,0,.42),0 18px 46px rgba(0,0,0,.22)}
    .math-game-field:before{content:'';position:absolute;left:48px;right:48px;top:0;bottom:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.78) 0 2px,transparent 2px 10%),linear-gradient(180deg,rgba(255,255,255,.72) 0 2px,transparent 2px calc(100% - 2px),rgba(255,255,255,.72) calc(100% - 2px));opacity:.72;z-index:1;pointer-events:none}
    .math-game-field:after{content:'';position:absolute;left:48px;right:48px;top:23%;bottom:23%;background:repeating-linear-gradient(90deg,transparent 0 calc(5% - 1px),rgba(255,255,255,.58) calc(5% - 1px) 5%);opacity:.62;z-index:1;pointer-events:none}
    .math-game-endzone{position:absolute;top:0;bottom:0;width:48px;z-index:2;display:grid;place-items:center;background:linear-gradient(180deg,color-mix(in srgb,var(--student-team-primary,#013369) 78%,#000),color-mix(in srgb,var(--student-team-secondary,#D50A0A) 36%,#000));box-shadow:inset 0 0 28px rgba(0,0,0,.45)}
    .math-game-endzone.left{left:0}.math-game-endzone.right{right:0}.math-game-endzone span{font-size:8px;font-weight:900;letter-spacing:.14em;color:rgba(255,255,255,.78);writing-mode:vertical-rl;text-transform:uppercase;text-shadow:0 1px 4px rgba(0,0,0,.7)}
    .math-game-yard-number{position:absolute;top:12px;z-index:2;transform:translateX(-50%);font-size:10px;font-weight:900;color:rgba(255,255,255,.48);text-shadow:0 1px 3px rgba(0,0,0,.65)}.math-game-yard-number.bottom{top:auto;bottom:12px;transform:translateX(-50%) rotate(180deg)}
    .math-game-progress{position:absolute;left:48px;top:0;bottom:0;background:linear-gradient(90deg,rgba(255,218,77,.1),rgba(255,218,77,.24));border-right:3px solid #f7d154;box-shadow:0 0 24px rgba(247,209,84,.24);transition:width .55s ease;z-index:3}
    .math-game-ball{position:absolute;top:50%;z-index:4;width:34px;height:21px;border-radius:50%;background:radial-gradient(circle at 30% 28%,#d89455,#8a411f 58%,#4b1f0e);border:1px solid rgba(255,255,255,.5);box-shadow:0 10px 18px rgba(0,0,0,.42),inset 0 2px 4px rgba(255,255,255,.22);transform:translate(-50%,-50%) rotate(-18deg);transition:left .55s ease}
    .math-game-ball:before{content:'';position:absolute;left:7px;right:7px;top:9px;height:2px;background:rgba(255,255,255,.86);box-shadow:0 0 4px rgba(255,255,255,.45)}.math-game-ball:after{content:'';position:absolute;left:13px;top:5px;width:8px;height:11px;border-left:2px solid rgba(255,255,255,.85);border-right:2px solid rgba(255,255,255,.85)}
    .math-game-button:disabled{opacity:.45;cursor:not-allowed}
    .math-game-rank:first-child{background:rgba(255,214,10,.08)}
    .math-playbook-card{position:relative;isolation:isolate;overflow:hidden;min-height:138px;text-align:left;border:1px solid rgba(255,255,255,.13);background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 44px rgba(0,0,0,.24);transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
    .math-playbook-card:before{content:'';position:absolute;inset:0;background:linear-gradient(120deg,transparent 0 48%,color-mix(in srgb,var(--play-accent,#5b9bd5) 34%,transparent) 49% 51%,transparent 52%),repeating-linear-gradient(90deg,rgba(255,255,255,.055) 0 1px,transparent 1px 22px);opacity:.68;z-index:-1}
    .math-playbook-card:hover:not(:disabled){transform:translateY(-3px);border-color:color-mix(in srgb,var(--play-accent,#5b9bd5) 64%,rgba(255,255,255,.18));background:linear-gradient(145deg,rgba(255,255,255,.105),rgba(255,255,255,.038));box-shadow:0 22px 58px rgba(0,0,0,.32),0 0 36px color-mix(in srgb,var(--play-accent,#5b9bd5) 20%,transparent)}
    .math-playbook-card:disabled{opacity:.48;cursor:not-allowed}
    .math-route-dot{width:8px;height:8px;border-radius:999px;background:var(--play-accent,#5b9bd5);box-shadow:0 0 16px var(--play-accent,#5b9bd5)}
    .math-route-line{height:2px;min-width:54px;background:linear-gradient(90deg,var(--play-accent,#5b9bd5),rgba(255,255,255,.18))}
  `;
  document.head.appendChild(style);

  const playCalls = [
    { yards:5, name:'Quick Slant', label:'Short gain', difficulty:'Rookie', accent:'#22c55e', icon:'zap', note:'Fast facts' },
    { yards:10, name:'Curl Route', label:'Move chains', difficulty:'Starter', accent:'#5b9bd5', icon:'corner-down-right', note:'One clean step' },
    { yards:15, name:'Deep Cross', label:'Big chunk', difficulty:'Captain', accent:'#f59e0b', icon:'route', note:'Two-step thinking' },
    { yards:20, name:'End Zone Shot', label:'High risk', difficulty:'All-Pro', accent:'#ef4444', icon:'crosshair', note:'Fractions, percent, or travel' }
  ];
  const yardNumbers = [10,20,30,40,50,40,30,20,10].map((number, index) => {
    const position = `calc(48px + (100% - 96px) * ${(index + 1) / 10})`;
    return `<span class="math-game-yard-number" style="left:${position}">${number}</span><span class="math-game-yard-number bottom" style="left:${position}">${number}</span>`;
  }).join('');
  const game = document.createElement('div');
  game.className = 'max-w-6xl mx-auto px-6 pb-14';
  game.innerHTML = `
    <div class="border-y border-white/10 bg-white/[.025]">
      <div class="px-5 py-5 md:px-7 flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div><div class="text-[10px] uppercase tracking-[.2em] text-brand-400 font-bold mb-2">Math Competition</div><h2 class="text-2xl md:text-3xl font-black">Road to the Super Bowl</h2><p class="text-xs text-white/45 mt-2">Solve NFL math plays, move down the field, and score touchdowns.</p></div>
        <div class="flex gap-2"><span id="mg-level" class="px-3 py-2 border border-brand-400/30 bg-brand-500/10 text-brand-400 text-xs font-bold">Rookie</span><span id="mg-next" class="px-3 py-2 border border-white/10 text-white/45 text-xs">250 XP to Starter</span></div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 border-y border-white/10">
        <div class="p-4 md:p-5 border-r border-b md:border-b-0 border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Season XP</div><div id="mg-xp" class="text-2xl font-black mt-1">0</div></div>
        <div class="p-4 md:p-5 md:border-r border-b md:border-b-0 border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Touchdowns</div><div id="mg-touchdowns" class="text-2xl font-black mt-1">0</div></div>
        <div class="p-4 md:p-5 border-r border-white/10"><div class="text-[10px] uppercase text-white/35 font-bold">Current Streak</div><div id="mg-streak" class="text-2xl font-black mt-1">0</div></div>
        <div class="p-4 md:p-5"><div class="text-[10px] uppercase text-white/35 font-bold">Accuracy</div><div id="mg-accuracy" class="text-2xl font-black mt-1">0%</div></div>
      </div>
      <div class="p-5 md:p-7">
        <div class="flex justify-between text-[10px] uppercase font-bold text-white/40 mb-2"><span>Current Drive</span><span id="mg-yards">0 / 100 yards</span></div>
        <div class="math-game-field"><div class="math-game-endzone left"><span>End Zone</span></div><div class="math-game-endzone right"><span>End Zone</span></div>${yardNumbers}<div id="mg-progress" class="math-game-progress"></div><div id="mg-ball" class="math-game-ball" aria-hidden="true"></div></div>
      </div>
      <div class="grid lg:grid-cols-[1.5fr_1fr] border-t border-white/10">
        <div class="p-5 md:p-7 lg:border-r border-white/10">
          <div id="mg-playbook-wrap" class="mb-6">
            <div class="flex items-center justify-between gap-3 mb-3">
              <div>
                <div class="text-[10px] uppercase tracking-[.22em] text-brand-400 font-black">Choose Your Play</div>
                <h3 class="text-xl font-black mt-1">Offensive Playbook</h3>
              </div>
              <div class="hidden sm:flex items-center gap-2 text-[10px] uppercase text-white/35 font-bold"><iconify-icon icon="lucide:gamepad-2" class="text-brand-400"></iconify-icon>Pick yards, set difficulty</div>
            </div>
            <div id="mg-playbook" class="grid sm:grid-cols-2 gap-3"></div>
          </div>
          <div id="mg-question-meta" class="flex gap-2 mb-4"></div>
          <div id="mg-question" class="min-h-[82px] text-lg md:text-xl font-semibold leading-relaxed text-white/85">Choose a play from the playbook to start your drive.</div>
          <form id="mg-form" class="hidden mt-5 flex flex-col sm:flex-row gap-2">
            <label class="sr-only" for="mg-answer">Your answer</label><input id="mg-answer" type="number" step="any" required autocomplete="off" placeholder="Enter your answer" class="min-w-0 flex-1 px-4 py-3 bg-black/30 border border-white/15 text-white outline-none focus:border-brand-400">
            <button id="mg-submit" class="math-game-button px-5 py-3 bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold uppercase tracking-wider transition">Run the Play</button>
            <button id="mg-next-play" type="button" class="math-game-button hidden px-5 py-3 border border-white/15 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-wider transition">Choose Next Play</button>
          </form>
          <div id="mg-feedback" class="hidden mt-4 p-4 border text-sm leading-relaxed"></div>
        </div>
        <div>
          <div class="p-4 border-b border-white/10 flex items-center justify-between gap-3"><h3 class="text-sm font-bold">Leaderboard</h3><div class="flex border border-white/10"><button id="mg-weekly-tab" class="px-3 py-2 text-[10px] uppercase font-bold bg-white/10">This Week</button><button id="mg-season-tab" class="px-3 py-2 text-[10px] uppercase font-bold text-white/40">Season</button></div></div>
          <div id="mg-leaderboard" class="min-h-[250px]"></div>
        </div>
      </div>
    </div>`;

  const oldProblems = section.querySelector('#math-problems');
  if (oldProblems) oldProblems.parentNode.insertBefore(game, oldProblems);
  else section.appendChild(game);

  const $ = id => document.getElementById(id);
  const state = { challenge:null, weekly:[], allTime:[], board:'weekly', busy:false };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  async function api(path, options={}) { const response=await fetch(path,{headers:{'Content-Type':'application/json'},...options}); const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||'The game could not load.'); return data; }

  function renderPlaybook(disabled=false) {
    $('mg-playbook').innerHTML = playCalls.map(play => `<button type="button" class="math-playbook-card p-4" data-yards="${play.yards}" style="--play-accent:${play.accent}" ${disabled?'disabled':''}>
      <div class="relative z-10 flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] uppercase tracking-[.2em] text-white/40 font-black">${escapeHtml(play.label)}</div>
          <div class="text-lg font-black mt-1">${escapeHtml(play.name)}</div>
        </div>
        <div class="w-11 h-11 border border-white/15 bg-black/25 grid place-items-center text-white"><iconify-icon icon="lucide:${escapeHtml(play.icon)}" class="text-xl"></iconify-icon></div>
      </div>
      <div class="relative z-10 flex items-center gap-2 mt-4" aria-hidden="true"><span class="math-route-dot"></span><span class="math-route-line"></span><span class="math-route-dot"></span></div>
      <div class="relative z-10 grid grid-cols-3 gap-px mt-4 bg-white/10 border border-white/10">
        <div class="bg-black/28 p-2"><div class="text-[8px] uppercase text-white/35 font-black">Yards</div><div class="text-lg font-black">${play.yards}</div></div>
        <div class="bg-black/28 p-2"><div class="text-[8px] uppercase text-white/35 font-black">XP</div><div class="text-lg font-black">${play.yards}</div></div>
        <div class="bg-black/28 p-2"><div class="text-[8px] uppercase text-white/35 font-black">Level</div><div class="text-[11px] font-black mt-1">${escapeHtml(play.difficulty)}</div></div>
      </div>
      <div class="relative z-10 text-[10px] text-white/42 font-semibold mt-3">${escapeHtml(play.note)}</div>
    </button>`).join('');
  }

  function renderProfile(profile) {
    $('mg-xp').textContent=Number(profile.total_xp||0).toLocaleString();
    $('mg-touchdowns').textContent=profile.touchdowns||0;
    $('mg-streak').textContent=profile.current_streak||0;
    $('mg-accuracy').textContent=profile.questions_answered?`${Math.round(profile.correct_answers/profile.questions_answered*100)}%`:'0%';
    $('mg-level').textContent=profile.level||'Rookie';
    $('mg-next').textContent=profile.nextLevel?`${profile.xpToNext} XP to ${profile.nextLevel}`:'Top Level Reached';
    const yards=Math.max(0,Math.min(99,Number(profile.drive_yards)||0)), width=`calc((100% - 96px) * ${yards/100})`;
    $('mg-yards').textContent=`${yards} / 100 yards`;
    $('mg-progress').style.width=width;
    $('mg-ball').style.left=`calc(48px + (100% - 96px) * ${yards/100})`;
  }

  function renderLeaderboard() {
    const rows=state.board==='weekly'?state.weekly:state.allTime;
    $('mg-weekly-tab').className=`px-3 py-2 text-[10px] uppercase font-bold ${state.board==='weekly'?'bg-white/10':'text-white/40'}`;
    $('mg-season-tab').className=`px-3 py-2 text-[10px] uppercase font-bold ${state.board==='allTime'?'bg-white/10':'text-white/40'}`;
    $('mg-leaderboard').innerHTML=rows.length?rows.map((row,index)=>`<div class="math-game-rank grid grid-cols-[32px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/5"><span class="text-xs font-black text-white/35">${index+1}</span><span class="min-w-0"><span class="block text-xs font-semibold truncate">${escapeHtml(row.display_name||row.username)}</span><span class="block text-[10px] text-white/35 truncate">${escapeHtml(row.selected_team||'Team not selected')}</span></span><span class="text-right"><span class="block text-sm font-black">${Number(state.board==='weekly'?row.xp:row.total_xp).toLocaleString()} XP</span><span class="block text-[9px] text-white/35">${row.touchdowns||0} TD</span></span></div>`).join(''):'<div class="p-8 text-center text-xs text-white/35">The leaderboard is ready for its first score.</div>';
  }

  function setQuestion(challenge) {
    state.challenge=challenge;
    $('mg-playbook-wrap').classList.add('hidden');
    $('mg-form').classList.remove('hidden');
    $('mg-question').textContent=challenge.question;
    $('mg-question-meta').innerHTML=`<span class="px-2 py-1 border border-brand-400/30 text-brand-400 text-[10px] font-bold uppercase">${escapeHtml(challenge.playName||'Play Call')}</span><span class="px-2 py-1 border border-brand-400/30 text-brand-400 text-[10px] font-bold uppercase">${escapeHtml(challenge.difficulty)}</span><span class="px-2 py-1 border border-white/10 text-white/50 text-[10px] font-bold">+${challenge.xp} XP</span><span class="px-2 py-1 border border-white/10 text-white/50 text-[10px] font-bold">+${challenge.yards} yards</span>`;
    $('mg-feedback').classList.add('hidden'); $('mg-next-play').classList.add('hidden'); $('mg-submit').classList.remove('hidden'); $('mg-answer').disabled=false; $('mg-answer').value=''; $('mg-answer').focus();
  }

  function showPlaybook(message='Choose a play from the playbook to start your drive.') {
    state.challenge = null;
    renderPlaybook(false);
    $('mg-playbook-wrap').classList.remove('hidden');
    $('mg-form').classList.add('hidden');
    $('mg-submit').disabled = false;
    $('mg-answer').disabled = false;
    $('mg-submit').classList.remove('hidden');
    $('mg-next-play').classList.add('hidden');
    $('mg-question-meta').innerHTML = '';
    $('mg-question').textContent = message;
    $('mg-feedback').classList.add('hidden');
  }

  async function loadProfile() { const data=await api('/api/math-game/profile'); renderProfile(data.profile); state.weekly=data.weekly; state.allTime=data.allTime; renderLeaderboard(); }
  async function nextChallenge(yards) { if(state.busy)return; state.busy=true; renderPlaybook(true); $('mg-question').textContent='Calling the play...'; try{const data=await api('/api/math-game/challenge',{method:'POST',body:JSON.stringify({yards})});setQuestion(data.challenge)}catch(error){$('mg-question').textContent=error.message;renderPlaybook(false)}finally{state.busy=false;$('mg-submit').disabled=false} }

  $('mg-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!state.challenge || state.busy) return;
    state.busy = true;
    $('mg-submit').disabled = true;
    $('mg-answer').disabled = true;
    try {
      const data = await api('/api/math-game/answer', { method:'POST', body:JSON.stringify({ challengeId:state.challenge.id, answer:$('mg-answer').value }) });
      renderProfile(data.profile);
      state.weekly = data.weekly;
      state.allTime = data.allTime;
      renderLeaderboard();
      const showBadges = () => window.showEarnedBadges?.(data.awardedBadges);
      if (data.levelUp && window.showLevelUpCelebration) {
        window.showLevelUpCelebration(data.levelUp);
        setTimeout(showBadges, 4600);
      } else {
        showBadges();
      }
      const feedback = $('mg-feedback');
      feedback.className = `mt-4 p-4 border text-sm leading-relaxed ${data.correct ? 'border-green-500/30 bg-green-500/10 text-green-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`;
      const successLabel = data.touchdown ? 'Touchdown!' : data.yardsEarned >= 10 ? 'First down!' : 'Positive gain!';
      feedback.innerHTML = data.correct ? `<strong>${successLabel}</strong> ${escapeHtml(data.explanation)} You earned ${data.xpEarned} XP and ${data.yardsEarned} yards.` : `<strong>Incomplete play.</strong> The answer was ${data.correctAnswer}. ${escapeHtml(data.explanation)}`;
      $('mg-submit').classList.add('hidden');
      $('mg-next-play').classList.remove('hidden');
      state.challenge = null;
    } catch (error) {
      $('mg-answer').disabled = false;
      $('mg-submit').disabled = false;
      $('mg-feedback').className = 'mt-4 p-4 border border-red-500/30 bg-red-500/10 text-red-200 text-sm';
      $('mg-feedback').textContent = error.message;
    } finally {
      state.busy = false;
    }
  });
  $('mg-playbook').addEventListener('click', event => {
    const button = event.target.closest('[data-yards]');
    if (!button || state.busy) return;
    nextChallenge(Number(button.dataset.yards));
  });
  $('mg-next-play').addEventListener('click',()=>showPlaybook('Choose the next play call.'));
  $('mg-weekly-tab').addEventListener('click',()=>{state.board='weekly';renderLeaderboard()});
  $('mg-season-tab').addEventListener('click',()=>{state.board='allTime';renderLeaderboard()});

  loadProfile().then(()=>showPlaybook()).catch(error=>{$('mg-question').textContent=error.message;$('mg-submit').disabled=true});
})();
