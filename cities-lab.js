(() => {
  const section = document.getElementById('cities');
  if (!section || typeof NFL_TEAMS === 'undefined' || typeof STATE_FACTS === 'undefined') return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers:{ 'Content-Type':'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'City Scout could not load.');
    return data;
  };
  let selected = NFL_TEAMS[0];
  let profile = { progress:[], socialXp:0, completed:0, leaderboard:[] };
  let username = null;

  const capCoord = team => (typeof CAPITAL_COORDS !== 'undefined' && CAPITAL_COORDS[team.state]) || null;
  const capDistance = team => { const c = capCoord(team); return c ? Math.round(haversine(team.lat, team.lng, c.lat, c.lng)) : null; };
  const COMPASS = ['North','Northeast','East','Southeast','South','Southwest','West','Northwest'];
  function bearing(lat1, lng1, lat2, lng2) {
    const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
  const popNum = value => parseFloat(String(value || '0').replace(/[^0-9.]/g, '')) || 0;

  const style = document.createElement('style');
  style.textContent = `
    .cs-wrap{position:relative;z-index:1}
    .cs-hero{position:relative;overflow:hidden;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(120deg,color-mix(in srgb,var(--student-team-primary,#013369) 72%,#000),#0b0d12 58%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 34%,#000));box-shadow:0 22px 60px rgba(0,0,0,.4)}
    .cs-hero:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.045) 0 2px,transparent 2px 66px),linear-gradient(180deg,rgba(255,255,255,.08),transparent 42%);pointer-events:none}
    .cs-title{font-family:'Anton','Inter',sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.01em;line-height:.94;transform:skewX(-2deg);text-shadow:0 6px 24px rgba(0,0,0,.55)}
    .cs-stat{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);border-radius:14px}
    .cs-card{background:rgba(255,255,255,.03);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.09);border-radius:18px;box-shadow:0 16px 44px rgba(0,0,0,.2)}
    .cs-tile{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;transition:transform .2s ease,border-color .2s ease}
    .cs-tile:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--student-team-primary,#013369) 45%,transparent)}
    .cs-select{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 14px;font-size:14px;color:rgba(255,255,255,.85);outline:none}
    .cs-choice{position:relative;overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:12px;font-size:12px;font-weight:600;transition:all .18s ease;cursor:pointer}
    .cs-choice:hover:not(:disabled){border-color:color-mix(in srgb,var(--student-team-primary,#013369) 50%,transparent);background:color-mix(in srgb,var(--student-team-primary,#013369) 12%,transparent)}
    .cs-choice.right{border-color:rgba(34,197,94,.6);background:rgba(34,197,94,.16);color:#bbf7d0;animation:cs-pop .4s ease}
    .cs-choice.wrong{border-color:rgba(248,113,113,.55);background:rgba(248,113,113,.14);color:#fecaca;animation:cs-shake .4s ease}
    @keyframes cs-pop{0%{transform:scale(1)}45%{transform:scale(1.05)}100%{transform:scale(1)}}
    @keyframes cs-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
    .cs-submit{border-radius:12px;font-weight:800;background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));color:#fff;box-shadow:0 10px 26px rgba(0,0,0,.3);transition:transform .18s ease}
    .cs-submit:hover:not(:disabled){transform:translateY(-1px)}.cs-submit:disabled{opacity:.55;cursor:not-allowed}
    .cs-done{border-color:rgba(34,197,94,.4)!important;background:linear-gradient(160deg,rgba(34,197,94,.1),rgba(255,255,255,.02))}
    .cs-editor{width:100%;min-height:120px;resize:vertical;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.1);padding:12px;font-size:12px;line-height:1.7;outline:none;transition:border-color .2s ease}
    .cs-editor:focus{border-color:color-mix(in srgb,var(--student-team-primary,#013369) 60%,#5b9bd5)}
    .cs-compass-face{position:relative;width:150px;height:150px;border-radius:99px;background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.08),rgba(0,0,0,.35));border:2px solid rgba(255,255,255,.14);box-shadow:inset 0 4px 18px rgba(0,0,0,.5)}
    .cs-compass-tick{position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:900;color:rgba(255,255,255,.5)}
    .cs-compass-tick.e{top:50%;left:auto;right:8px;transform:translateY(-50%)}
    .cs-compass-tick.s{top:auto;bottom:8px}
    .cs-compass-tick.w{top:50%;left:8px;transform:translateY(-50%)}
    .cs-needle{position:absolute;left:50%;top:50%;width:5px;height:60px;transform:translate(-50%,-100%) rotate(0deg);transform-origin:50% 100%;transition:transform 1s cubic-bezier(.2,1,.3,1)}
    .cs-needle:before{content:'';position:absolute;left:0;top:0;width:5px;height:60px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,var(--student-team-secondary,#D50A0A),color-mix(in srgb,var(--student-team-secondary,#D50A0A) 40%,#000))}
    .cs-needle-hub{position:absolute;left:50%;top:50%;width:16px;height:16px;border-radius:99px;transform:translate(-50%,-50%);background:radial-gradient(circle at 40% 35%,#fff,#999);z-index:2}
    .cs-slider{width:100%;height:8px;border-radius:99px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,.1);outline:none}
    .cs-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:99px;background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));border:2px solid #fff;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.4)}
    .cs-slider::-moz-range-thumb{width:22px;height:22px;border-radius:99px;background:var(--student-team-secondary,#D50A0A);border:2px solid #fff;cursor:pointer}
    .cs-battle-bar{height:10px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.06)}
    .cs-leader-row{border-radius:12px;transition:background .18s ease}
    .cs-leader-row:hover{background:rgba(255,255,255,.05)}
    .cs-leader-you{background:color-mix(in srgb,var(--student-team-primary,#013369) 16%,transparent);border:1px solid color-mix(in srgb,var(--student-team-primary,#013369) 40%,transparent)}
    .cs-medal{width:22px;height:22px;border-radius:99px;display:grid;place-items:center;font-size:10px;font-weight:900;color:#1a1206}
    .cs-medal.m1{background:linear-gradient(135deg,#f7d154,#b8860b)}.cs-medal.m2{background:linear-gradient(135deg,#e8e8e8,#9ba3ad)}.cs-medal.m3{background:linear-gradient(135deg,#d99a6c,#8c5427)}
    .cs-celebrate{background:linear-gradient(120deg,rgba(34,197,94,.16),rgba(247,209,84,.12));border:1px solid rgba(34,197,94,.4);animation:cs-pop .5s ease}
  `;
  document.head.appendChild(style);

  section.innerHTML = `<div class="amb-ghost" aria-hidden="true">SCOUT</div><div class="cs-wrap max-w-6xl mx-auto px-4 md:px-6">
    <div class="cs-hero mb-6">
      <div class="relative z-10 p-6 md:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div class="min-w-0">
          <div class="inline-flex items-center gap-2 text-[10px] uppercase tracking-[.24em] text-white/60 font-black"><iconify-icon icon="lucide:compass"></iconify-icon>NFL City Scout</div>
          <h1 class="cs-title text-4xl md:text-6xl mt-3">Explore the places<br>behind the teams</h1>
          <p class="text-sm text-white/55 mt-3">Investigate geography, government, and culture across every NFL city.</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <div class="cs-stat px-5 py-3 text-center"><div class="text-[9px] uppercase tracking-wider text-white/45">Social XP</div><div id="cs-xp" class="text-2xl font-black mt-1">0</div></div>
          <div class="cs-stat px-4 py-3 flex items-center gap-3">
            <div class="relative w-12 h-12 shrink-0"><svg viewBox="0 0 44 44" class="w-12 h-12 -rotate-90"><circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4"/><circle id="cs-ring" cx="22" cy="22" r="18" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-dasharray="113" stroke-dashoffset="113" style="transition:stroke-dashoffset .6s ease"/></svg><div id="cs-ring-num" class="absolute inset-0 grid place-items-center text-[11px] font-black">0/4</div></div>
            <div class="text-[9px] uppercase tracking-wider text-white/45 leading-tight">Activities<br>Complete</div>
          </div>
        </div>
      </div>
    </div>

    <label class="block mb-6"><span class="block mb-2 text-[10px] uppercase tracking-wider text-white/40 font-bold">Team city to investigate</span><select id="cs-team" class="cs-select md:w-96"></select></label>

    <div id="cs-celebrate" class="hidden cs-celebrate rounded-2xl p-4 mb-6 flex items-center gap-3"><iconify-icon icon="lucide:party-popper" class="text-2xl text-amber-300"></iconify-icon><div><div class="font-black">City Scout complete!</div><div class="text-xs text-white/60">You finished all four investigations for this city. Try another team's city next.</div></div></div>

    <div id="cs-profile" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"></div>

    <div class="grid md:grid-cols-2 gap-4 mb-6">
      <div class="cs-card p-5">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-brand-400 font-bold mb-4"><iconify-icon icon="lucide:compass"></iconify-icon>Which way to the capital?</div>
        <div class="flex items-center gap-5">
          <div class="cs-compass-face shrink-0"><span class="cs-compass-tick n">N</span><span class="cs-compass-tick e">E</span><span class="cs-compass-tick s">S</span><span class="cs-compass-tick w">W</span><div id="cs-needle" class="cs-needle"></div><div class="cs-needle-hub"></div></div>
          <div class="min-w-0"><div class="text-sm text-white/60 leading-relaxed">From <strong id="cs-comp-city" class="text-white">&mdash;</strong>, the state capital <strong id="cs-comp-cap" class="text-white">&mdash;</strong> lies to the</div><div id="cs-comp-dir" class="text-2xl font-black mt-1">&mdash;</div><div id="cs-comp-dist" class="text-xs text-brand-400 font-mono mt-1">&mdash;</div></div>
        </div>
      </div>
      <div class="cs-card p-5">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-brand-400 font-bold mb-4"><iconify-icon icon="lucide:ruler"></iconify-icon>Guess the distance</div>
        <p class="text-sm text-white/60 mb-4">How far is <strong id="cs-guess-city" class="text-white">the city</strong> from its state capital? Drag to estimate the miles, then check.</p>
        <input id="cs-guess" type="range" min="0" max="800" value="200" class="cs-slider">
        <div class="flex justify-between text-[10px] text-white/35 mt-1 font-mono"><span>0 mi</span><span>800 mi</span></div>
        <div class="flex items-center justify-between gap-3 mt-4"><div class="text-lg font-black">Your guess: <span id="cs-guess-val" class="text-brand-400">200</span> mi</div><button id="cs-guess-check" class="cs-submit px-5 py-2.5 text-xs">Check</button></div>
        <div id="cs-guess-result" class="hidden mt-3 p-3 rounded-xl text-xs"></div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <div id="cs-challenges" class="space-y-5"></div>
      <aside class="space-y-6">
        <div class="cs-card"><div class="p-4 border-b border-white/8 flex items-center gap-2"><iconify-icon icon="lucide:git-compare" class="text-brand-400"></iconify-icon><h2 class="font-bold">Compare NFL Places</h2></div><div class="p-4"><select id="cs-compare-team" class="cs-select text-xs"></select><div id="cs-compare" class="mt-4"></div><textarea id="cs-compare-response" class="cs-editor mt-4" placeholder="How are these places alike and different? Use at least 20 words."></textarea><button data-complete="compare" class="cs-submit w-full mt-3 py-3 text-xs">Submit Comparison</button><div id="cs-compare-message" class="mt-2 text-xs"></div></div></div>
        <div class="cs-card"><div class="p-4 border-b border-white/8 flex items-center gap-2"><iconify-icon icon="lucide:trophy" class="text-brand-400"></iconify-icon><h2 class="font-bold">Social Studies Leaders</h2></div><div id="cs-leaders" class="p-2"></div></div>
      </aside>
    </div>
  </div>`;

  const $ = id => document.getElementById(id);
  const done = activity => profile.progress.some(item => item.activity === activity && item.completed);
  const stateOf = team => STATE_FACTS[team.state];

  function options() {
    const html = NFL_TEAMS.map(team => `<option value="${team.abbr}">${fullName(team)} &middot; ${team.city}, ${team.state}</option>`).join('');
    $('cs-team').innerHTML = html;
    $('cs-compare-team').innerHTML = html;
    $('cs-team').value = selected.abbr;
    $('cs-compare-team').value = NFL_TEAMS.find(team => team.abbr !== selected.abbr)?.abbr || selected.abbr;
  }

  function renderProfile() {
    const s = stateOf(selected);
    const items = [['NFL City', selected.city, 'lucide:building-2'], ['State Capital', s.capital, 'lucide:landmark'], ['U.S. Region', s.region, 'lucide:map'], ['Landmark', s.landmark, 'lucide:camera']];
    $('cs-profile').innerHTML = items.map(([label, value, icon]) => `<div class="cs-tile p-4"><div class="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-white/35 font-bold"><iconify-icon icon="${icon}" class="text-brand-400 text-xs"></iconify-icon>${label}</div><div class="text-sm font-black mt-2 leading-tight">${esc(value)}</div></div>`).join('');
    const xpEl = $('cs-xp'); xpEl.dataset.countup = profile.socialXp || 0; delete xpEl.dataset.countupDone; if (typeof runCountUps === 'function') runCountUps(xpEl.parentElement); else xpEl.textContent = profile.socialXp || 0;
    const completed = profile.completed || 0;
    const circ = 113;
    $('cs-ring').style.strokeDashoffset = circ * (1 - Math.min(4, completed) / 4);
    $('cs-ring-num').textContent = `${completed}/4`;
    $('cs-celebrate').classList.toggle('hidden', completed < 4);
    const me = username;
    $('cs-leaders').innerHTML = profile.leaderboard?.length ? profile.leaderboard.slice(0, 5).map((row, index) => {
      const medal = index < 3 ? `<span class="cs-medal m${index + 1}">${index + 1}</span>` : `<span class="w-[22px] text-center text-[11px] font-black text-white/30">${index + 1}</span>`;
      const you = row.username && row.username === me;
      return `<div class="cs-leader-row ${you ? 'cs-leader-you' : ''} grid grid-cols-[24px_1fr_auto] items-center gap-2 p-3 text-xs">${medal}<span class="truncate flex items-center gap-1.5">${esc(row.display_name)}${you ? '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/15">You</span>' : ''}</span><span class="font-black font-mono">${Number(row.social_xp || 0).toLocaleString()} XP</span></div>`;
    }).join('') : '<div class="p-6 text-xs text-center text-white/35">No scores yet.</div>';
  }

  function renderCompass() {
    const c = capCoord(selected), s = stateOf(selected), dist = capDistance(selected);
    $('cs-comp-city').textContent = selected.city;
    $('cs-comp-cap').textContent = s.capital;
    $('cs-guess-city').textContent = `${selected.city}, ${selected.state}`;
    if (!c || dist === null) { $('cs-comp-dir').textContent = '—'; $('cs-comp-dist').textContent = 'Data unavailable'; return; }
    if (selected.city === s.capital || dist < 8) {
      $('cs-needle').style.transform = 'translate(-50%,-100%) rotate(0deg)';
      $('cs-comp-dir').textContent = 'Right here!';
      $('cs-comp-dist').textContent = `${selected.city} is the state capital`;
      return;
    }
    const brg = bearing(selected.lat, selected.lng, c.lat, c.lng);
    $('cs-needle').style.transform = `translate(-50%,-100%) rotate(${brg}deg)`;
    $('cs-comp-dir').textContent = COMPASS[Math.round(brg / 45) % 8];
    $('cs-comp-dist').textContent = `${dist} miles away`;
  }

  function setupGuess() {
    const dist = capDistance(selected);
    const slider = $('cs-guess'), val = $('cs-guess-val'), result = $('cs-guess-result'), check = $('cs-guess-check');
    slider.value = 200; val.textContent = '200'; result.classList.add('hidden');
    slider.oninput = () => { val.textContent = slider.value; };
    check.onclick = () => {
      if (dist === null) { result.className = 'mt-3 p-3 rounded-xl text-xs bg-white/5 text-white/60'; result.textContent = 'Distance data is unavailable for this city.'; result.classList.remove('hidden'); return; }
      const guess = Number(slider.value), off = Math.abs(guess - dist);
      const tone = off <= 25 ? ['bg-green-500/15 border border-green-400/30 text-green-200', 'Bullseye!'] : off <= 75 ? ['bg-blue-500/15 border border-blue-400/30 text-blue-100', 'So close!'] : off <= 150 ? ['bg-amber-500/15 border border-amber-400/30 text-amber-100', 'Good try!'] : ['bg-white/5 border border-white/10 text-white/70', 'Keep scouting!'];
      result.className = `mt-3 p-3 rounded-xl text-xs ${tone[0]}`;
      result.innerHTML = `<span class="font-black">${tone[1]}</span> The real distance is <strong>${dist} mi</strong>. You were off by ${off} mi.`;
      result.classList.remove('hidden');
    };
  }

  function choiceCard(activity, title, prompt, choices, correct) {
    const complete = done(activity);
    return `<div class="cs-card ${complete ? 'cs-done' : ''} p-5">
      <div class="flex justify-between gap-3 mb-4"><div><div class="text-[10px] uppercase ${complete ? 'text-green-300' : 'text-brand-400'} font-bold flex items-center gap-1.5">${complete ? '<iconify-icon icon="lucide:check-circle"></iconify-icon>Completed' : 'Geography Challenge'}</div><h2 class="font-black mt-1">${title}</h2></div><span class="text-xs text-white/35 font-bold shrink-0">+15 XP</span></div>
      <p class="text-sm text-white/60 mb-4">${prompt}</p>
      <div class="grid grid-cols-2 gap-2">${choices.map(choice => `<button data-choice="${activity}" data-answer="${esc(choice)}" data-correct="${esc(correct)}" class="cs-choice" ${complete ? 'disabled' : ''}>${esc(choice)}</button>`).join('')}</div>
      <div id="cs-${activity}-message" class="mt-3 text-xs text-white/45"></div>
    </div>`;
  }

  function renderChallenges() {
    const s = stateOf(selected);
    const capitals = [s.capital, ...NFL_TEAMS.map(team => STATE_FACTS[team.state]?.capital).filter(value => value && value !== s.capital).slice(0, 3)].sort(() => Math.random() - .5);
    const regions = [s.region, ...['Northeast', 'South', 'Midwest', 'West'].filter(value => value !== s.region)].sort(() => Math.random() - .5);
    const whyDone = done('whyhere');
    const whyResp = whyDone ? esc(profile.progress.find(p => p.activity === 'whyhere')?.response || '') : '';
    $('cs-challenges').innerHTML = choiceCard('capital', 'Capital Challenge', `What is the capital of ${selected.state}, home state of the ${fullName(selected)}?`, capitals, s.capital)
      + choiceCard('region', 'Region Challenge', `${selected.city}, ${selected.state} belongs to which major U.S. region?`, regions, s.region)
      + `<div class="cs-card ${whyDone ? 'cs-done' : ''} p-5"><div class="flex justify-between gap-3 mb-3"><div><div class="text-[10px] uppercase ${whyDone ? 'text-green-300' : 'text-brand-400'} font-bold flex items-center gap-1.5">${whyDone ? '<iconify-icon icon="lucide:check-circle"></iconify-icon>Completed' : 'Human Geography'}</div><h2 class="font-black mt-1">Why Here?</h2></div><span class="text-xs text-white/35 font-bold shrink-0">+40 XP</span></div><p class="text-sm text-white/60 leading-6">Why do you think ${selected.city} grew into an important city? Consider transportation, climate, natural resources, jobs, or nearby landforms.</p><textarea id="cs-whyhere" class="cs-editor mt-4" placeholder="Explain your reasoning using at least 20 words." ${whyDone ? 'disabled' : ''}>${whyResp}</textarea><button data-complete="whyhere" class="cs-submit mt-3 px-5 py-3 text-xs" ${whyDone ? 'disabled' : ''}>${whyDone ? 'Submitted' : 'Submit Investigation'}</button></div>`;
    bindActions();
  }

  function renderCompare() {
    const other = NFL_TEAMS.find(team => team.abbr === $('cs-compare-team').value) || NFL_TEAMS[1];
    const a = stateOf(selected), b = stateOf(other);
    const aPop = popNum(a.pop), bPop = popNum(b.pop);
    const total = aPop + bPop || 1;
    const cell = (team, st, win) => `<div class="p-3 rounded-xl border ${win ? 'border-amber-400/40 bg-amber-500/8' : 'border-white/10 bg-white/[.03]'}"><div class="font-black text-sm flex items-center gap-1.5">${esc(team.city)}${win ? '<iconify-icon icon="lucide:crown" class="text-amber-300 text-xs"></iconify-icon>' : ''}</div><div class="text-[10px] text-white/45 mt-2 leading-5">${st.region}<br>Pop: ${st.pop}<br>${st.landmark}</div></div>`;
    $('cs-compare').innerHTML = `<div class="grid grid-cols-2 gap-2">${cell(selected, a, aPop >= bPop)}${cell(other, b, bPop > aPop)}</div>
      <div class="mt-3"><div class="flex justify-between text-[9px] uppercase text-white/35 font-bold mb-1"><span>Population</span><span>${a.pop} vs ${b.pop}</span></div>
      <div class="cs-battle-bar flex"><div style="width:${aPop / total * 100}%;background:linear-gradient(90deg,var(--student-team-primary,#013369),var(--student-team-secondary,#D50A0A))"></div><div style="width:${bPop / total * 100}%;background:rgba(255,255,255,.18)"></div></div></div>`;
  }

  function flash(button, label) {
    const original = button.innerHTML, classes = button.className;
    button.disabled = true;
    button.innerHTML = `<span class="inline-flex items-center gap-2"><iconify-icon icon="lucide:check"></iconify-icon>${label}</span>`;
    setTimeout(() => { button.disabled = false; button.className = classes; button.innerHTML = original; }, 1600);
  }

  async function complete(activity, response, button) {
    try {
      const data = await api('/api/social-studies/complete', { method:'POST', body:JSON.stringify({ activity, response }) });
      profile = data;
      window.showEarnedBadges?.(data.awardedBadges);
      flash(button, 'Completed!');
      renderProfile();
      setTimeout(renderChallenges, 1700);
    } catch (error) {
      const msg = $(`cs-${activity}-message`);
      if (msg) { msg.textContent = error.message; msg.className = 'mt-3 text-xs text-red-300'; }
      else alert(error.message);
    }
  }

  function bindActions() {
    document.querySelectorAll('[data-choice]').forEach(button => button.onclick = () => {
      const activity = button.dataset.choice, message = $(`cs-${activity}-message`);
      if (button.dataset.answer !== button.dataset.correct) {
        button.classList.add('wrong');
        setTimeout(() => button.classList.remove('wrong'), 450);
        message.textContent = 'Try again. Use the city and state profile for a clue.';
        message.className = 'mt-3 text-xs text-red-300';
        return;
      }
      button.classList.add('right');
      message.textContent = 'Correct!';
      message.className = 'mt-3 text-xs text-green-300';
      complete(activity, button.dataset.answer, button);
    });
    document.querySelectorAll('[data-complete]').forEach(button => button.onclick = () => complete(button.dataset.complete, button.dataset.complete === 'whyhere' ? $('cs-whyhere').value : $('cs-compare-response').value, button));
  }

  function renderAll() {
    renderProfile();
    renderCompass();
    setupGuess();
    renderChallenges();
    renderCompare();
  }

  async function load() {
    const [me, data] = await Promise.all([api('/api/me'), api('/api/social-studies/profile')]);
    profile = data;
    username = me.user.username;
    selected = NFL_TEAMS.find(team => team.abbr === me.user.selectedTeam) || NFL_TEAMS[0];
    options();
    renderAll();
    $('cs-team').onchange = () => { selected = NFL_TEAMS.find(team => team.abbr === $('cs-team').value) || selected; $('cs-compare-team').value = NFL_TEAMS.find(team => team.abbr !== selected.abbr)?.abbr || selected.abbr; renderAll(); };
    $('cs-compare-team').onchange = renderCompare;
  }
  load().catch(error => section.innerHTML = `<div class="cs-wrap max-w-6xl mx-auto px-6 py-16 text-center text-red-300">${esc(error.message)}</div>`);
})();
