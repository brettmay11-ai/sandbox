(() => {
  const section = document.getElementById('writing');
  if (!section) return;

  const activities = {
    postgame:{ label:'Postgame Reporter', icon:'newspaper', xp:50, goal:120, prompt:"Explain what happened in your team's latest game. Include the final score, an important play, and evidence from a statistic.", starters:['The most important moment of the game was...', 'One statistic that explains the result is...', 'My team can improve by...'] },
    prediction:{ label:'Make Your Prediction', icon:'chart-no-axes-combined', xp:40, goal:100, prompt:"Predict your team's next game. Use at least one statistic as evidence, then explain what you will check after the game.", starters:['I predict that my team will...', 'The strongest evidence for my prediction is...', 'After the game, I will check...'] },
    journal:{ label:'Season Journal', icon:'book-open', xp:30, goal:80, prompt:"Record an important moment from your team's season and explain why it matters.", starters:['This week, my team...', 'This moment matters because...', 'My biggest question now is...'] }
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers:{ 'Content-Type':'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The Press Room could not load.');
    return data;
  };
  let state = { activity:'postgame', entries:[], profile:null, team:'your team' };

  section.innerHTML = `<div class="max-w-6xl mx-auto px-4 md:px-6">
    <div class="border-y border-white/10 py-7 mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <div class="text-[10px] uppercase tracking-[.2em] text-brand-400 font-bold">NFL Press Room</div>
        <h1 class="text-3xl md:text-4xl font-black mt-2">Tell the story of your season</h1>
        <p class="text-sm text-white/45 mt-2">Research, draft, revise, and submit writing about <span id="wl-team">your team</span>.</p>
      </div>
      <div class="flex gap-px bg-white/10 border border-white/10">
        <div class="bg-[#111] px-5 py-3"><div class="text-[9px] uppercase text-white/35">Writing XP</div><div id="wl-xp" class="text-xl font-black">0</div></div>
        <div class="bg-[#111] px-5 py-3"><div class="text-[9px] uppercase text-white/35">Submitted</div><div id="wl-submissions" class="text-xl font-black">0</div></div>
        <div class="bg-[#111] px-5 py-3"><div class="text-[9px] uppercase text-white/35">Returned</div><div id="wl-returned" class="text-xl font-black">0</div></div>
      </div>
    </div>
    <div id="wl-activities" class="grid md:grid-cols-3 gap-3 mb-6"></div>
    <div class="grid lg:grid-cols-[1.45fr_.55fr] gap-6">
      <div class="border border-white/10">
        <div class="p-5 border-b border-white/10">
          <div id="wl-status-flow" class="grid grid-cols-4 gap-1 mb-5"></div>
          <div id="wl-feedback-panel" class="hidden mb-5"></div>
          <div id="wl-activity-label" class="text-[10px] uppercase text-brand-400 font-bold"></div>
          <input id="wl-title" maxlength="120" placeholder="Add a headline or title" class="mt-3 w-full bg-transparent text-2xl font-black outline-none placeholder:text-white/20">
          <p id="wl-prompt" class="mt-3 text-sm text-white/55 leading-relaxed"></p>
          <div id="wl-starters" class="flex flex-wrap gap-2 mt-4"></div>
        </div>
        <div class="p-5">
          <textarea id="wl-content" maxlength="12000" class="w-full min-h-[330px] resize-y bg-black/25 border border-white/10 p-4 text-sm leading-7 outline-none focus:border-brand-400" placeholder="Start writing here..."></textarea>
          <div class="mt-3 flex items-center gap-3"><div class="h-2 flex-1 bg-white/5 overflow-hidden"><div id="wl-progress" class="h-full bg-brand-500 transition-all"></div></div><span id="wl-count" class="text-[10px] text-white/40 min-w-[90px] text-right">0 words</span></div>
        </div>
        <div class="p-5 border-t border-white/10">
          <div class="text-[10px] uppercase text-white/35 font-bold mb-3">Reporter's Checklist</div>
          <div id="wl-checklist" class="grid sm:grid-cols-2 gap-3"></div>
          <div id="wl-message" class="hidden mt-4 p-3 text-xs border"></div>
          <div class="flex flex-wrap gap-2 mt-5">
            <button id="wl-save" class="px-5 py-3 border border-white/15 hover:bg-white/5 text-xs font-bold">Save Draft</button>
            <button id="wl-revise" class="hidden px-5 py-3 bg-amber-500 text-black text-xs font-black">Revise This Piece</button>
            <button id="wl-submit" class="px-5 py-3 bg-brand-500 hover:bg-brand-400 text-xs font-bold">Submit to Teacher</button>
          </div>
        </div>
      </div>
      <aside class="space-y-6">
        <div class="border border-white/10"><div class="p-4 border-b border-white/10"><h2 class="font-bold">My Press Box</h2></div><div id="wl-history"></div></div>
        <div class="border border-white/10"><div class="p-4 border-b border-white/10"><h2 class="font-bold">Writing Leaders</h2></div><div id="wl-leaders"></div></div>
      </aside>
    </div>
  </div>`;

  const $ = id => document.getElementById(id);
  const words = () => $('wl-content').value.trim().split(/\s+/).filter(Boolean).length;
  const currentEntry = () => state.entries.find(item => item.activity === state.activity) || {};
  const isLocked = entry => ['submitted', 'complete', 'reviewed', 'revision'].includes(entry.status);
  const statusLabel = status => ({ draft:'Drafting', submitted:'With Teacher', revision:'Needs Revision', complete:'Complete', reviewed:'Complete' }[status] || 'Drafting');
  const entryStatusLabel = entry => entry.status === 'draft' && entry.teacher_feedback ? 'Revising' : statusLabel(entry.status);
  const statusClasses = status => ({
    draft:'text-white/45 border-white/10 bg-white/[.03]',
    submitted:'text-blue-200 border-blue-400/30 bg-blue-500/10',
    revision:'text-amber-200 border-amber-400/40 bg-amber-500/10',
    complete:'text-green-200 border-green-400/35 bg-green-500/10',
    reviewed:'text-green-200 border-green-400/35 bg-green-500/10'
  }[status] || 'text-white/45 border-white/10 bg-white/[.03]');

  function checklist() {
    return Object.fromEntries([...document.querySelectorAll('[data-check]')].map(input => [input.dataset.check, input.checked]));
  }

  function renderStatusFlow(entry = {}) {
    const status = entry.status || 'draft';
    const active = status === 'complete' || status === 'reviewed' ? 3 : status === 'revision' ? 2 : status === 'submitted' ? 1 : 0;
    const steps = [['Draft', 'pencil'], ['Submitted', 'send'], ['Teacher Reviewed', 'clipboard-check'], [status === 'revision' ? 'Revise' : 'Complete', status === 'revision' ? 'rotate-ccw' : 'check-circle']];
    $('wl-status-flow').innerHTML = steps.map(([label, icon], index) => `<div class="p-3 border ${index <= active ? 'border-brand-400/35 bg-brand-500/10 text-white' : 'border-white/10 bg-white/[.02] text-white/30'}">
      <div class="flex items-center gap-2"><iconify-icon icon="lucide:${icon}" class="text-sm"></iconify-icon><span class="text-[9px] uppercase font-black">${esc(label)}</span></div>
    </div>`).join('');
  }

  function renderFeedback(entry = {}) {
    const panel = $('wl-feedback-panel');
    if (entry.status === 'revision') {
      panel.className = 'mb-5 p-4 border border-amber-300/35 bg-amber-400/10 text-amber-50';
      panel.innerHTML = `<div class="flex items-start gap-3"><iconify-icon icon="lucide:message-square-warning" class="text-xl text-amber-200"></iconify-icon><div><div class="text-xs font-black uppercase">Feedback returned: revise and resubmit</div><p class="text-sm leading-6 mt-2 whitespace-pre-wrap">${esc(entry.teacher_feedback || 'Use your teacher feedback to make this stronger, then resubmit.')}</p></div></div>`;
      panel.classList.remove('hidden');
      return;
    }
    if (entry.status === 'draft' && entry.teacher_feedback) {
      panel.className = 'mb-5 p-4 border border-amber-300/25 bg-amber-400/10 text-amber-50';
      panel.innerHTML = `<div class="flex items-start gap-3"><iconify-icon icon="lucide:clipboard-pen" class="text-xl text-amber-200"></iconify-icon><div><div class="text-xs font-black uppercase">Revision notes</div><p class="text-sm leading-6 mt-2 whitespace-pre-wrap">${esc(entry.teacher_feedback)}</p></div></div>`;
      panel.classList.remove('hidden');
      return;
    }
    if ((entry.status === 'complete' || entry.status === 'reviewed') && entry.teacher_feedback) {
      panel.className = 'mb-5 p-4 border border-green-300/30 bg-green-400/10 text-green-50';
      panel.innerHTML = `<div class="flex items-start gap-3"><iconify-icon icon="lucide:badge-check" class="text-xl text-green-200"></iconify-icon><div><div class="text-xs font-black uppercase">Marked complete</div><p class="text-sm leading-6 mt-2 whitespace-pre-wrap">${esc(entry.teacher_feedback)}</p></div></div>`;
      panel.classList.remove('hidden');
      return;
    }
    panel.className = 'hidden';
    panel.innerHTML = '';
  }

  function renderActivities() {
    $('wl-activities').innerHTML = Object.entries(activities).map(([key, activity]) => {
      const entry = state.entries.find(item => item.activity === key) || {};
      const selected = key === state.activity;
      return `<button data-activity="${key}" class="text-left p-5 border ${selected ? 'border-brand-400 bg-brand-500/10' : 'border-white/10 hover:bg-white/[.03]'}">
        <div class="flex items-center justify-between"><iconify-icon icon="lucide:${activity.icon}" class="text-xl text-brand-400"></iconify-icon><span class="text-[10px] font-bold text-white/40">+${activity.xp} XP</span></div>
        <div class="font-bold mt-4">${activity.label}</div>
        <div class="flex items-center justify-between gap-2 mt-2"><span class="text-[10px] text-white/35">Goal: ${activity.goal} words</span><span class="text-[9px] uppercase font-black ${entry.status === 'revision' || entry.teacher_feedback && entry.status === 'draft' ? 'text-amber-300' : entry.status === 'complete' || entry.status === 'reviewed' ? 'text-green-300' : entry.status === 'submitted' ? 'text-blue-300' : 'text-white/30'}">${entryStatusLabel(entry)}</span></div>
      </button>`;
    }).join('');
    document.querySelectorAll('[data-activity]').forEach(button => button.onclick = () => selectActivity(button.dataset.activity));
  }

  function renderChecklist(entry = {}) {
    const checks = [['capitals', 'I checked capitals'], ['punctuation', 'I checked punctuation'], ['evidence', 'I used facts or statistics'], ['sentences', 'I wrote complete sentences']];
    $('wl-checklist').innerHTML = checks.map(([key, label]) => `<label class="flex items-center gap-3 text-xs text-white/65"><input data-check="${key}" type="checkbox" ${entry.checklist?.[key] ? 'checked' : ''} class="accent-blue-500">${label}</label>`).join('');
  }

  function setLocked(entry) {
    const locked = isLocked(entry);
    $('wl-title').disabled = locked;
    $('wl-content').disabled = locked;
    document.querySelectorAll('[data-check]').forEach(input => { input.disabled = locked; });
    $('wl-starters').querySelectorAll('button').forEach(button => { button.disabled = locked; button.classList.toggle('opacity-40', locked); });
    $('wl-save').classList.toggle('hidden', locked);
    $('wl-submit').classList.toggle('hidden', locked);
    $('wl-revise').classList.toggle('hidden', entry.status !== 'revision');
    $('wl-content').classList.toggle('opacity-60', locked);
  }

  function selectActivity(key) {
    state.activity = key;
    const activity = activities[key];
    const entry = currentEntry();
    $('wl-activity-label').textContent = `${activity.label} · ${entryStatusLabel(entry)}`;
    $('wl-prompt').textContent = activity.prompt.replace('your team', state.team);
    $('wl-title').value = entry.title || '';
    $('wl-content').value = entry.content || '';
    $('wl-starters').innerHTML = activity.starters.map(text => `<button class="px-3 py-2 border border-white/10 text-[10px] text-white/55 hover:text-white hover:bg-white/5">${esc(text)}</button>`).join('');
    [...$('wl-starters').children].forEach((button, index) => button.onclick = () => {
      const starter = activity.starters[index];
      $('wl-content').value += `${$('wl-content').value.trim() ? '\n\n' : ''}${starter} `;
      updateCount();
      $('wl-content').focus();
    });
    renderChecklist(entry);
    renderStatusFlow(entry);
    renderFeedback(entry);
    renderActivities();
    updateCount();
    setLocked(entry);
    showMessage(entry.status === 'submitted' ? 'Submitted to your teacher. You can edit again after feedback comes back.' : '', 'info');
  }

  function updateCount() {
    const count = words();
    const goal = activities[state.activity].goal;
    $('wl-count').textContent = `${count} / ${goal} words`;
    $('wl-progress').style.width = `${Math.min(100, count / goal * 100)}%`;
  }

  function showMessage(text, type = 'success') {
    const el = $('wl-message');
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text;
    const styles = {
      error:'border-red-500/30 bg-red-500/10 text-red-200',
      info:'border-blue-500/30 bg-blue-500/10 text-blue-100',
      success:'border-green-500/30 bg-green-500/10 text-green-200'
    };
    el.className = `mt-4 p-3 text-xs border ${styles[type] || styles.success}`;
  }

  function renderProfile(data) {
    state.profile = data;
    $('wl-xp').textContent = Number(data.writingXp || 0).toLocaleString();
    $('wl-submissions').textContent = data.submissions || 0;
    $('wl-returned').textContent = data.returned || 0;
    $('wl-history').innerHTML = state.entries.length ? state.entries.map(entry => `<button data-open="${entry.activity}" class="w-full text-left p-4 border-b border-white/5 hover:bg-white/[.03]">
      <div class="flex justify-between gap-2"><span class="text-xs font-bold">${esc(activities[entry.activity]?.label || entry.activity)}</span><span class="text-[9px] uppercase px-2 py-1 border ${statusClasses(entry.status)}">${esc(entryStatusLabel(entry))}</span></div>
      <div class="text-[10px] text-white/35 mt-2 truncate">${esc(entry.title || 'Untitled draft')}</div>
      ${entry.status === 'revision' ? '<div class="text-[10px] text-amber-300 mt-2">Teacher feedback is ready</div>' : ''}
      ${entry.status === 'draft' && entry.teacher_feedback ? '<div class="text-[10px] text-amber-300 mt-2">Revision in progress</div>' : ''}
      ${entry.status === 'complete' || entry.status === 'reviewed' ? '<div class="text-[10px] text-green-300 mt-2">Finished</div>' : ''}
    </button>`).join('') : '<div class="p-6 text-center text-xs text-white/35">Your saved writing will appear here.</div>';
    document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => selectActivity(button.dataset.open));
    $('wl-leaders').innerHTML = data.leaderboard?.length ? data.leaderboard.slice(0, 5).map((row, index) => `<div class="grid grid-cols-[24px_1fr_auto] gap-2 p-3 border-b border-white/5 text-xs"><span class="text-white/30 font-black">${index + 1}</span><span class="truncate">${esc(row.display_name)}</span><span class="font-black">${row.writing_xp} XP</span></div>`).join('') : '<div class="p-6 text-center text-xs text-white/35">No submissions yet.</div>';
  }

  async function save(submit = false) {
    const payload = { activity:state.activity, title:$('wl-title').value, content:$('wl-content').value, checklist:checklist() };
    try {
      const data = await api(submit ? '/api/writing/submit' : '/api/writing/save', { method:'POST', body:JSON.stringify(payload) });
      showMessage(data.message);
      window.showEarnedBadges?.(data.awardedBadges);
      await load();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function revise() {
    try {
      const data = await api('/api/writing/revise', { method:'POST', body:JSON.stringify({ activity:state.activity }) });
      showMessage(data.message, 'info');
      await load();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function load() {
    const [me, data] = await Promise.all([api('/api/me'), api('/api/writing/profile')]);
    state.team = typeof getNFLTeamBrand === 'function' ? (getNFLTeamBrand(me.user.selectedTeam)?.name || 'your team') : 'your team';
    state.entries = data.entries || [];
    $('wl-team').textContent = state.team;
    renderProfile(data);
    selectActivity(state.activity);
    window.refreshStudentWritingNotifications?.();
  }

  $('wl-content').addEventListener('input', updateCount);
  $('wl-save').onclick = () => save(false);
  $('wl-submit').onclick = () => save(true);
  $('wl-revise').onclick = revise;
  load().catch(error => showMessage(error.message, 'error'));
})();
