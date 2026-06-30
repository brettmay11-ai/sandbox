/* Personalized, page-aware, safe Team Research Coach. */
(() => {
  const win = document.getElementById('chatbot-window');
  const button = document.getElementById('chatbot-btn');
  const messages = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  if (!win || !button || !messages || !input) return;

  let user = null;
  let focus = null;
  let activeChallenge = null;
  const page = typeof getCurrentPortalPage === 'function' ? getCurrentPortalPage() : 'home';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  const style = document.createElement('style');
  style.textContent = `
    #chatbot-btn{background:linear-gradient(135deg,var(--student-team-primary,#013369),var(--student-team-secondary,#D50A0A));box-shadow:0 18px 50px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.18) inset}
    #chatbot-btn:before{content:'';position:absolute;inset:5px;border:1px solid rgba(255,255,255,.24);border-radius:999px}
    #chatbot-window.coach-console{background:linear-gradient(180deg,rgba(11,16,24,.96),rgba(6,8,12,.98));box-shadow:0 28px 90px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.08);border-radius:18px}
    .coach-header{position:relative;overflow:hidden;background:linear-gradient(135deg,var(--student-team-primary,#013369),color-mix(in srgb,var(--student-team-primary,#013369) 62%,#050505));border-bottom:1px solid rgba(255,255,255,.14)}
    .coach-header:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 0 8%,rgba(255,255,255,.12) 8% 8.6%,transparent 8.6% 18%,rgba(255,255,255,.1) 18% 18.5%,transparent 18.5% 100%);opacity:.55;pointer-events:none}
    .coach-field{background:linear-gradient(180deg,rgba(17,71,36,.34),rgba(5,8,11,.92)),repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 1px,transparent 1px 10%);border-bottom:1px solid rgba(255,255,255,.08)}
    .coach-pill{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);transition:transform .18s ease,background .18s ease,border-color .18s ease}
    .coach-pill:hover{transform:translateY(-1px);background:rgba(255,255,255,.11);border-color:color-mix(in srgb,var(--student-team-secondary,#D50A0A) 60%,rgba(255,255,255,.1))}
    .coach-bubble{border-radius:16px 16px 16px 4px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 28px rgba(0,0,0,.18)}
    .coach-bubble-user{border-radius:16px 16px 4px 16px;background:linear-gradient(135deg,color-mix(in srgb,var(--student-team-primary,#013369) 76%,#fff),var(--student-team-primary,#013369));border:1px solid rgba(255,255,255,.16)}
    .coach-avatar{background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));box-shadow:0 0 0 1px rgba(255,255,255,.18) inset}
    .coach-send{background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));box-shadow:0 8px 24px rgba(0,0,0,.28)}
    .coach-input-shell{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1)}
    .sideline-coach{position:fixed;right:86px;bottom:20px;z-index:49;width:92px;height:104px;pointer-events:none;filter:drop-shadow(0 18px 22px rgba(0,0,0,.48));transform-origin:bottom right;animation:coach-bob 3.4s ease-in-out infinite}
    .sideline-coach.hidden-coach{opacity:0;transform:translateY(12px) scale(.82);animation:none;transition:opacity .2s ease,transform .2s ease}
    .sideline-coach-body{position:absolute;left:22px;right:14px;bottom:4px;height:58px;border-radius:22px 22px 12px 12px;background:linear-gradient(135deg,var(--student-team-primary,#013369),color-mix(in srgb,var(--student-team-secondary,#D50A0A) 72%,var(--student-team-primary,#013369)));border:2px solid rgba(255,255,255,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.34)}
    .sideline-coach-body:before{content:'';position:absolute;left:8px;right:8px;top:11px;height:3px;background:rgba(255,255,255,.72);box-shadow:0 10px 0 rgba(255,255,255,.24)}
    .sideline-coach-head{position:absolute;left:20px;top:12px;width:50px;height:50px;border-radius:50%;background:linear-gradient(145deg,#ffd7aa,#b87546);border:2px solid rgba(255,255,255,.82);box-shadow:inset 0 2px 0 rgba(255,255,255,.35)}
    .sideline-coach-cap{position:absolute;left:17px;top:6px;width:56px;height:24px;border-radius:22px 22px 12px 12px;background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));border:2px solid rgba(255,255,255,.75);z-index:2}
    .sideline-coach-cap:after{content:'';position:absolute;right:-12px;top:11px;width:22px;height:8px;border-radius:999px;background:var(--student-team-secondary,#D50A0A);border:1px solid rgba(255,255,255,.62)}
    .sideline-coach-face{position:absolute;left:29px;top:31px;width:4px;height:4px;border-radius:999px;background:#1f2937;box-shadow:17px 0 0 #1f2937,7px 12px 0 -1px rgba(31,41,55,.85)}
    .sideline-coach-headset{position:absolute;left:13px;top:20px;width:58px;height:38px;border:4px solid #111827;border-bottom:0;border-radius:32px 32px 0 0;z-index:3}
    .sideline-coach-headset:before{content:'';position:absolute;left:-5px;top:22px;width:11px;height:16px;border-radius:6px;background:#111827}.sideline-coach-headset:after{content:'';position:absolute;right:-7px;top:24px;width:30px;height:4px;background:#111827;transform:rotate(20deg);transform-origin:left center}
    .sideline-coach-mic{position:absolute;right:8px;top:49px;width:13px;height:8px;border-radius:999px;background:#111827;z-index:4}
    .sideline-playsheet{position:absolute;right:0;bottom:22px;width:34px;height:43px;transform:rotate(-8deg);border-radius:5px;background:linear-gradient(180deg,#f8fafc,#dbeafe);border:2px solid rgba(15,23,42,.45);box-shadow:0 8px 14px rgba(0,0,0,.28)}
    .sideline-playsheet:before{content:'';position:absolute;left:6px;right:6px;top:9px;height:2px;background:#1f7a3a;box-shadow:0 8px 0 #1f7a3a,0 16px 0 #1f7a3a}.sideline-playsheet:after{content:'X';position:absolute;right:6px;bottom:5px;color:#dc2626;font-size:10px;font-weight:900}
    .sideline-coach-shadow{position:absolute;left:19px;right:10px;bottom:0;height:12px;border-radius:999px;background:rgba(0,0,0,.35);filter:blur(3px)}
    @media (max-width:640px){.sideline-coach{right:70px;bottom:18px;width:70px;height:80px;transform:scale(.78);transform-origin:bottom right}.sideline-coach.hidden-coach{transform:translateY(10px) scale(.68)}}
    @keyframes coach-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  `;
  document.head.appendChild(style);

  button.title = 'Open Team Research Coach';
  button.className = 'fixed bottom-6 right-6 w-16 h-16 rounded-full flex items-center justify-center cursor-pointer hover:scale-105 transition z-50';
  button.innerHTML = '<iconify-icon icon="lucide:message-circle-more" class="relative text-white text-2xl"></iconify-icon>';
  let coachBuddy = document.getElementById('sideline-coach');
  if (!coachBuddy) {
    coachBuddy = document.createElement('div');
    coachBuddy.id = 'sideline-coach';
    coachBuddy.className = 'sideline-coach';
    coachBuddy.setAttribute('aria-hidden', 'true');
    coachBuddy.innerHTML = '<div class="sideline-coach-shadow"></div><div class="sideline-coach-body"></div><div class="sideline-coach-head"></div><div class="sideline-coach-cap"></div><div class="sideline-coach-face"></div><div class="sideline-coach-headset"></div><div class="sideline-coach-mic"></div><div class="sideline-playsheet"></div>';
    document.body.appendChild(coachBuddy);
  }
  const syncCoachBuddy = () => coachBuddy.classList.toggle('hidden-coach', !win.classList.contains('hidden'));
  new MutationObserver(syncCoachBuddy).observe(win, { attributes:true, attributeFilter:['class'] });
  syncCoachBuddy();

  win.className = 'hidden coach-console fixed bottom-24 right-3 sm:right-6 w-[calc(100vw-24px)] sm:w-[430px] h-[620px] max-h-[calc(100vh-120px)] border border-white/10 flex flex-col z-50 overflow-hidden';
  win.innerHTML = `
    <div class="coach-header p-4 flex items-center justify-between shrink-0">
      <div class="relative z-10 flex items-center gap-3 min-w-0">
        <div id="coach-logo" class="coach-avatar w-11 h-11 rounded-2xl grid place-items-center shrink-0"><iconify-icon icon="lucide:shield-question" class="text-white text-xl"></iconify-icon></div>
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-[.22em] text-white/55 font-bold">Team Research</div>
          <div id="coach-title" class="text-sm font-black text-white truncate">Coach Console</div>
        </div>
      </div>
      <button onclick="toggleChatbot()" title="Close" class="relative z-10 w-9 h-9 rounded-xl bg-black/20 border border-white/10 grid place-items-center text-white/65 hover:text-white hover:bg-black/30"><iconify-icon icon="lucide:x" class="text-base"></iconify-icon></button>
    </div>
    <div id="coach-scoreboard" class="coach-field px-4 py-3 grid grid-cols-3 gap-px text-center shrink-0">
      <div class="bg-black/25 p-2"><div class="text-[8px] uppercase text-white/35 font-bold">Page</div><div class="text-[11px] font-black">${esc(page)}</div></div>
      <div class="bg-black/25 p-2"><div class="text-[8px] uppercase text-white/35 font-bold">Team</div><div id="coach-team-chip" class="text-[11px] font-black">Loading</div></div>
      <div class="bg-black/25 p-2"><div class="text-[8px] uppercase text-white/35 font-bold">XP Play</div><div class="text-[11px] font-black">Ready</div></div>
    </div>
    <div id="coach-suggestions" class="px-3 py-3 border-b border-white/10 flex gap-2 overflow-x-auto shrink-0"></div>
    <div id="chat-messages" class="flex-1 p-4 overflow-y-auto space-y-3 text-[12px]"></div>
    <div class="p-3 border-t border-white/10 shrink-0">
      <div class="coach-input-shell flex items-center gap-2 rounded-2xl p-1.5">
        <input type="text" id="chat-input" placeholder="Ask your coach..." class="flex-1 bg-transparent px-3 py-2 text-[13px] text-white placeholder-white/30 outline-none" autocomplete="off">
        <button onclick="sendChatMessage()" title="Send" class="coach-send w-10 h-10 rounded-xl text-white grid place-items-center transition hover:scale-[1.03]"><iconify-icon icon="lucide:send-horizontal" class="text-base"></iconify-icon></button>
      </div>
    </div>`;

  const freshMessages = document.getElementById('chat-messages');
  const freshInput = document.getElementById('chat-input');
  const suggestions = document.getElementById('coach-suggestions');

  const safeMessage = (text, sender = 'bot') => {
    const row = document.createElement('div');
    row.className = `flex gap-2 ${sender === 'user' ? 'justify-end' : ''}`;
    if (sender !== 'user') {
      const icon = document.createElement('div');
      icon.className = 'coach-avatar w-8 h-8 rounded-xl flex items-center justify-center shrink-0';
      icon.innerHTML = '<iconify-icon icon="lucide:badge-help" class="text-white text-sm"></iconify-icon>';
      row.appendChild(icon);
    }
    const bubble = document.createElement('div');
    bubble.className = `${sender === 'user' ? 'coach-bubble-user text-white' : 'coach-bubble text-white/78'} p-3 max-w-[86%] text-[12px] leading-5 whitespace-pre-line`;
    bubble.textContent = String(text);
    row.appendChild(bubble);
    freshMessages.appendChild(row);
    freshMessages.scrollTop = freshMessages.scrollHeight;
  };
  window.appendChatMessage = safeMessage;

  async function api(path, options = {}) {
    const response = await fetch(path, { headers:{ 'Content-Type':'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Coach could not respond.');
    return data;
  }

  function assigned() {
    return typeof getNFLTeamBrand === 'function' ? getNFLTeamBrand(user?.selectedTeam) : null;
  }

  function teamData() {
    return typeof NFL_TEAMS !== 'undefined' ? NFL_TEAMS.find(team => team.abbr === user?.selectedTeam) : null;
  }

  function updateTeamDetails() {
    const team = assigned();
    const chip = document.getElementById('coach-team-chip');
    const logo = document.getElementById('coach-logo');
    const title = document.getElementById('coach-title');
    if (chip) chip.textContent = team?.abbr || user?.selectedTeam || 'Team';
    if (title) title.textContent = team?.name ? `${team.name} Coach` : 'Coach Console';
    if (team?.logo && logo) logo.innerHTML = `<img src="${esc(team.logo)}" alt="${esc(team.name)} logo" class="w-8 h-8 object-contain">`;
  }

  function setSuggestions() {
    const team = assigned();
    const byPage = {
      math:['Give me a math hint','Start an XP challenge','Football percentages'],
      travel:['How far does my team travel?','Explain time zones','Start an XP challenge'],
      writing:['Help me brainstorm','Give me a strong opening','Start an XP challenge'],
      cities:['Tell me about my team city','What state is my team in?','Start an XP challenge'],
      home:['Tell me about my team','What is the featured game?','Start an XP challenge']
    };
    const items = byPage[page] || [`Tell me about ${team?.name || 'my team'}`,'Who are my team leaders?','Start an XP challenge'];
    suggestions.innerHTML = '';
    items.forEach(text => {
      const chip = document.createElement('button');
      chip.className = 'coach-pill shrink-0 px-3.5 py-2 rounded-xl text-[10px] font-bold text-white/70';
      chip.textContent = text;
      chip.addEventListener('click', () => ask(text));
      suggestions.appendChild(chip);
    });
  }

  async function coachAnswer(question) {
    const lower = question.toLowerCase();
    const team = teamData();
    const brand = assigned();
    if (lower.includes('challenge') || lower.includes('quiz')) {
      const data = await api('/api/coach/challenge', { method:'POST', body:'{}' });
      activeChallenge = data.challenge;
      return `${data.challenge.question}\nAnswer correctly to earn ${data.challenge.xp} XP.`;
    }
    if (lower.includes('focus') && focus?.prompt) return `Your teacher's focus this week is: ${focus.prompt}`;
    if (lower.includes('featured game') && typeof FEATURED_GAME !== 'undefined') {
      const away = getTeam(FEATURED_GAME.away);
      const home = getTeam(FEATURED_GAME.home);
      return `The featured game is ${fullName(away)} at ${fullName(home)} in Week ${FEATURED_GAME.week}. Kickoff is ${FEATURED_GAME.day} at ${FEATURED_GAME.time}.`;
    }
    if (team && (lower.includes('my team') || lower.includes(team.name.toLowerCase()) || lower.includes(team.abbr.toLowerCase()))) {
      if (lower.includes('leader') && typeof fetchTeamLiveStats === 'function') {
        try {
          const data = await fetchTeamLiveStats(team.abbr);
          const leaders = [];
          for (const cat of LIVE_LEADER_CATEGORIES.slice(0, 3)) {
            const top = getCategoryLeaders(data.players, cat, 1)[0];
            if (top) leaders.push(`${cat.label}: ${top.Name} with ${formatLiveStat(top[cat.stat])}`);
          }
          return leaders.length ? `${brand.name} ${data.season} leaders:\n${leaders.join('\n')}` : 'Updated leaders are not available yet.';
        } catch (error) {
          return 'Updated team leaders are temporarily unavailable. Try the Player Stats page.';
        }
      }
      if (lower.includes('travel') || lower.includes('far')) return `Open the Travel page to see every ${brand.name} road trip, distance, and time-zone change.`;
      return `${brand.name} play in ${team.city}, ${team.state}, at ${team.stadium}. They compete in the ${team.div}. Ask me about their leaders, stadium, travel, or city.`;
    }
    if (page === 'math' && (lower.includes('hint') || lower.includes('help'))) return 'Try writing down what the question gives you, circle what it asks for, and choose the operation before calculating. I will help with the steps without giving away the answer.';
    if (page === 'writing' && (lower.includes('brainstorm') || lower.includes('opening'))) return `Start with one strong detail about ${brand?.name || 'your team'}: the city, stadium, fans, or an important game. Then explain why that detail matters.`;
    if (lower.includes('time zone')) return 'Time zones help people use local clock times as Earth rotates. NFL travel can make a game feel earlier or later to visiting players.';
    if (lower.includes('percentage')) return 'Football uses percentages for pass completion, win rate, stadium attendance, and field-goal accuracy.';
    return `I can help with ${brand?.name || 'your assigned team'}, the page you are studying, updated leaders, the featured game, or a short XP challenge.`;
  }

  async function ask(text) {
    if (!text.trim()) return;
    safeMessage(text, 'user');
    freshInput.value = '';
    try {
      const logged = await api('/api/coach/log', { method:'POST', body:JSON.stringify({ page, question:text }) });
      if (logged.safety?.blocked) {
        safeMessage(logged.safety.message);
        return;
      }
      if (activeChallenge) {
        const result = await api('/api/coach/answer', { method:'POST', body:JSON.stringify({ challengeId:activeChallenge.id, answer:text }) });
        if (result.safety?.blocked) {
          safeMessage(result.safety.message);
          return;
        }
        activeChallenge = null;
        window.showEarnedBadges?.(result.awardedBadges);
        safeMessage(result.correct ? `Correct! ${result.explanation} You earned ${result.xpEarned} XP.` : `Good try. ${result.explanation} The answer was ${result.correctAnswer}.`);
        return;
      }
      safeMessage(await coachAnswer(text));
    } catch (error) {
      safeMessage(error.message);
    }
  }

  window.sendChatMessage = () => ask(freshInput.value);
  freshInput.addEventListener('keypress', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      ask(freshInput.value);
    }
  });

  Promise.all([api('/api/me'), api('/api/coach/context')]).then(([me, context]) => {
    user = me.user;
    focus = context.focus;
    freshMessages.innerHTML = '';
    updateTeamDetails();
    safeMessage(`Hi, ${user.displayName}! I am your Team Research Coach.${assigned() ? ` I can help you follow the ${assigned().name}.` : ''}${focus?.prompt ? `\n\nThis week's class focus: ${focus.prompt}` : ''}`);
    setSuggestions();
  }).catch(error => safeMessage(error.message));
})();
