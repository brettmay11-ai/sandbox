(() => {
  const section = document.getElementById('math');
  if (!section) return;

  const style = document.createElement('style');
  style.textContent = `
    .math-game-field{position:relative;height:92px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:repeating-linear-gradient(90deg,#174d2a 0,#174d2a calc(10% - 1px),rgba(255,255,255,.22) calc(10% - 1px),rgba(255,255,255,.22) 10%)}
    .math-game-field:before,.math-game-field:after{content:'END ZONE';position:absolute;top:0;bottom:0;width:48px;display:grid;place-items:center;background:#15365c;color:rgba(255,255,255,.65);font-size:8px;font-weight:800;writing-mode:vertical-rl;letter-spacing:1px}
    .math-game-field:before{left:0}.math-game-field:after{right:0}
    .math-game-progress{position:absolute;left:48px;top:0;bottom:0;background:rgba(255,214,10,.18);border-right:3px solid #ffd60a;transition:width .55s ease}
    .math-game-ball{position:absolute;top:34px;transform:translateX(-50%);font-size:24px;transition:left .55s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}
    .math-game-button:disabled{opacity:.45;cursor:not-allowed}
    .math-game-rank:first-child{background:rgba(255,214,10,.08)}
  `;
  document.head.appendChild(style);

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
        <div class="math-game-field"><div id="mg-progress" class="math-game-progress"></div><div id="mg-ball" class="math-game-ball" aria-hidden="true">🏈</div></div>
      </div>
      <div class="grid lg:grid-cols-[1.5fr_1fr] border-t border-white/10">
        <div class="p-5 md:p-7 lg:border-r border-white/10">
          <div id="mg-question-meta" class="flex gap-2 mb-4"></div>
          <div id="mg-question" class="min-h-[82px] text-lg md:text-xl font-semibold leading-relaxed text-white/85">Loading your first play...</div>
          <form id="mg-form" class="mt-5 flex flex-col sm:flex-row gap-2">
            <label class="sr-only" for="mg-answer">Your answer</label><input id="mg-answer" type="number" step="any" required autocomplete="off" placeholder="Enter your answer" class="min-w-0 flex-1 px-4 py-3 bg-black/30 border border-white/15 text-white outline-none focus:border-brand-400">
            <button id="mg-submit" class="math-game-button px-5 py-3 bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold uppercase tracking-wider transition">Run the Play</button>
            <button id="mg-next-play" type="button" class="math-game-button hidden px-5 py-3 border border-white/15 hover:bg-white/5 text-white text-xs font-bold uppercase tracking-wider transition">Next Play</button>
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
    $('mg-question').textContent=challenge.question;
    $('mg-question-meta').innerHTML=`<span class="px-2 py-1 border border-brand-400/30 text-brand-400 text-[10px] font-bold uppercase">${escapeHtml(challenge.difficulty)}</span><span class="px-2 py-1 border border-white/10 text-white/50 text-[10px] font-bold">+${challenge.xp} XP</span><span class="px-2 py-1 border border-white/10 text-white/50 text-[10px] font-bold">+${challenge.yards} yards</span>`;
    $('mg-feedback').classList.add('hidden'); $('mg-next-play').classList.add('hidden'); $('mg-submit').classList.remove('hidden'); $('mg-answer').disabled=false; $('mg-answer').value=''; $('mg-answer').focus();
  }

  async function loadProfile() { const data=await api('/api/math-game/profile'); renderProfile(data.profile); state.weekly=data.weekly; state.allTime=data.allTime; renderLeaderboard(); }
  async function nextChallenge() { if(state.busy)return; state.busy=true; $('mg-question').textContent='Calling the next play...'; $('mg-submit').disabled=true; try{const data=await api('/api/math-game/challenge',{method:'POST',body:'{}'});setQuestion(data.challenge)}catch(error){$('mg-question').textContent=error.message}finally{state.busy=false;$('mg-submit').disabled=false} }

  $('mg-form').addEventListener('submit',async event=>{event.preventDefault();if(!state.challenge||state.busy)return;state.busy=true;$('mg-submit').disabled=true;$('mg-answer').disabled=true;try{const data=await api('/api/math-game/answer',{method:'POST',body:JSON.stringify({challengeId:state.challenge.id,answer:$('mg-answer').value})});renderProfile(data.profile);state.weekly=data.weekly;state.allTime=data.allTime;renderLeaderboard();window.showEarnedBadges?.(data.awardedBadges);const feedback=$('mg-feedback');feedback.className=`mt-4 p-4 border text-sm leading-relaxed ${data.correct?'border-green-500/30 bg-green-500/10 text-green-200':'border-red-500/30 bg-red-500/10 text-red-200'}`;feedback.innerHTML=data.correct?`<strong>${data.touchdown?'Touchdown!':'First down!'}</strong> ${escapeHtml(data.explanation)} You earned ${data.xpEarned} XP and ${data.yardsEarned} yards.`:`<strong>Incomplete play.</strong> The answer was ${data.correctAnswer}. ${escapeHtml(data.explanation)}`;$('mg-submit').classList.add('hidden');$('mg-next-play').classList.remove('hidden');state.challenge=null}catch(error){$('mg-answer').disabled=false;$('mg-submit').disabled=false;$('mg-feedback').className='mt-4 p-4 border border-red-500/30 bg-red-500/10 text-red-200 text-sm';$('mg-feedback').textContent=error.message}finally{state.busy=false}});
  $('mg-next-play').addEventListener('click',nextChallenge);
  $('mg-weekly-tab').addEventListener('click',()=>{state.board='weekly';renderLeaderboard()});
  $('mg-season-tab').addEventListener('click',()=>{state.board='allTime';renderLeaderboard()});

  loadProfile().then(nextChallenge).catch(error=>{$('mg-question').textContent=error.message;$('mg-submit').disabled=true});
})();
