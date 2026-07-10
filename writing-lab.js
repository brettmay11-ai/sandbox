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
  let autosaveTimer = null;
  let lastSaved = { title:'', content:'', checklist:'' };

  const style = document.createElement('style');
  style.textContent = `
    #writing{position:relative;overflow:hidden;background:radial-gradient(circle at 10% 6%,color-mix(in srgb,var(--student-team-primary,#013369) 24%,transparent),transparent 34%),radial-gradient(circle at 92% 20%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 13%,transparent),transparent 30%),linear-gradient(180deg,#0a0a0a,#0b0e13 48%,#0a0a0a)}
    #writing:before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(255,255,255,.022) 0 1px,transparent 1px 94px);-webkit-mask:radial-gradient(ellipse at 50% 20%,#000 20%,transparent 74%);mask:radial-gradient(ellipse at 50% 20%,#000 20%,transparent 74%)}
    .wl-ghost{position:absolute;top:1%;right:-1%;z-index:0;pointer-events:none;font-family:'Anton',sans-serif;font-size:clamp(120px,18vw,280px);line-height:.8;color:var(--student-team-primary,#013369);opacity:.06;user-select:none;transform:skewX(-4deg)}
    .wl-wrap{position:relative;z-index:1}
    .wl-hero{position:relative;overflow:hidden;border-radius:20px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(120deg,color-mix(in srgb,var(--student-team-primary,#013369) 70%,#000),#0b0d12 58%,color-mix(in srgb,var(--student-team-secondary,#D50A0A) 34%,#000));box-shadow:0 22px 60px rgba(0,0,0,.4)}
    .wl-hero:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.045) 0 2px,transparent 2px 66px),linear-gradient(180deg,rgba(255,255,255,.08),transparent 42%);pointer-events:none}
    .wl-title{font-family:'Anton','Inter',sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:.01em;line-height:.94;transform:skewX(-2deg);text-shadow:0 6px 24px rgba(0,0,0,.55)}
    .wl-stat{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);border-radius:14px}
    .wl-card{background:rgba(255,255,255,.03);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.09);border-radius:18px;box-shadow:0 16px 44px rgba(0,0,0,.2)}
    .wl-activity{position:relative;overflow:hidden;text-align:left;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);transition:transform .2s ease,border-color .2s ease}
    .wl-activity:hover{transform:translateY(-3px)}
    .wl-activity.sel{border-color:color-mix(in srgb,var(--student-team-primary,#013369) 60%,transparent);background:color-mix(in srgb,var(--student-team-primary,#013369) 12%,rgba(255,255,255,.03))}
    .wl-activity:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--wl-accent,rgba(255,255,255,.15))}
    .wl-adot{width:8px;height:8px;border-radius:99px;flex-shrink:0}
    .wl-step{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;text-align:center}
    .wl-step-node{width:34px;height:34px;border-radius:99px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:rgba(255,255,255,.4);transition:all .3s ease;z-index:1}
    .wl-step.on .wl-step-node{background:linear-gradient(135deg,var(--student-team-primary,#013369),var(--student-team-secondary,#D50A0A));border-color:transparent;color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--student-team-primary,#013369) 26%,transparent)}
    .wl-step-line{position:absolute;top:17px;left:50%;width:100%;height:2px;background:rgba(255,255,255,.1);z-index:0}
    .wl-step.on .wl-step-line{background:linear-gradient(90deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369))}
    .wl-step:last-child .wl-step-line{display:none}
    .wl-step-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.4)}
    .wl-step.on .wl-step-label{color:rgba(255,255,255,.85)}
    .wl-editor{width:100%;min-height:340px;resize:vertical;border-radius:14px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.1);padding:18px;font-size:14px;line-height:1.8;outline:none;transition:border-color .2s ease,box-shadow .2s ease}
    .wl-editor:focus{border-color:color-mix(in srgb,var(--student-team-primary,#013369) 62%,#5b9bd5);box-shadow:0 0 0 3px color-mix(in srgb,var(--student-team-primary,#013369) 22%,transparent)}
    .wl-goal-track{position:relative;height:10px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden}
    .wl-goal-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--student-team-primary,#013369),var(--student-team-secondary,#D50A0A),#f7d154);transition:width .4s ease}
    .wl-goal-fill.done{background:linear-gradient(90deg,#22c55e,#4ade80)}
    .wl-starter{border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.02);transition:all .18s ease}
    .wl-starter:hover:not(:disabled){border-color:color-mix(in srgb,var(--student-team-primary,#013369) 45%,transparent);background:color-mix(in srgb,var(--student-team-primary,#013369) 10%,transparent);color:#fff}
    .wl-feedback{position:sticky;top:80px;z-index:5;border-radius:14px}
    .wl-btn{border-radius:12px;font-weight:800;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
    .wl-btn:hover{transform:translateY(-1px)}
    .wl-btn-submit{background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369));color:#fff;box-shadow:0 10px 28px rgba(0,0,0,.32)}
    .wl-btn-revise{background:linear-gradient(135deg,#f59e0b,#f7d154);color:#241a02}
    .wl-save-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;transition:color .2s ease}
    .wl-leader-row{border-radius:12px;transition:background .18s ease}
    .wl-leader-row:hover{background:rgba(255,255,255,.05)}
    .wl-leader-you{background:color-mix(in srgb,var(--student-team-primary,#013369) 16%,transparent);border:1px solid color-mix(in srgb,var(--student-team-primary,#013369) 40%,transparent)}
    .wl-medal{width:22px;height:22px;border-radius:99px;display:grid;place-items:center;font-size:10px;font-weight:900}
    .wl-modal{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:20px;background:rgba(4,5,10,.72);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .2s ease}
    .wl-modal.show{opacity:1;pointer-events:auto}
    .wl-modal-card{width:min(94vw,460px);border-radius:20px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(180deg,#12151c,#0b0d12);box-shadow:0 30px 90px rgba(0,0,0,.6);transform:translateY(12px) scale(.97);transition:transform .2s ease}
    .wl-modal.show .wl-modal-card{transform:none}
  `;
  document.head.appendChild(style);

  section.innerHTML = `<div class="wl-ghost" aria-hidden="true">PRESS</div><div class="wl-wrap max-w-6xl mx-auto px-4 md:px-6">
    <div class="wl-hero mb-7">
      <div class="relative z-10 p-6 md:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div class="min-w-0">
          <div class="inline-flex items-center gap-2 text-[10px] uppercase tracking-[.24em] text-white/60 font-black"><span class="w-2 h-2 rounded-full bg-white/70"></span>NFL Press Room</div>
          <h1 class="wl-title text-4xl md:text-6xl mt-3">Tell the story<br>of your season</h1>
          <p class="text-sm text-white/55 mt-3">Research, draft, revise, and submit writing about <span id="wl-team" class="font-bold text-white/80">your team</span>.</p>
        </div>
        <div class="grid grid-cols-3 gap-2 shrink-0">
          <div class="wl-stat px-4 py-3 text-center"><div class="text-[9px] uppercase tracking-wider text-white/45">Writing XP</div><div id="wl-xp" class="text-2xl font-black mt-1">0</div></div>
          <div class="wl-stat px-4 py-3 text-center"><div class="text-[9px] uppercase tracking-wider text-white/45">Submitted</div><div id="wl-submissions" class="text-2xl font-black mt-1">0</div></div>
          <div class="wl-stat px-4 py-3 text-center"><div class="text-[9px] uppercase tracking-wider text-white/45">Returned</div><div id="wl-returned" class="text-2xl font-black mt-1">0</div></div>
        </div>
      </div>
    </div>
    <div id="wl-activities" class="grid md:grid-cols-3 gap-3 mb-6"></div>
    <div class="grid lg:grid-cols-[1.45fr_.55fr] gap-6">
      <div class="wl-card">
        <div class="p-5 md:p-6 border-b border-white/8">
          <div id="wl-status-flow" class="flex items-start gap-1 mb-5"></div>
          <div id="wl-feedback-panel" class="hidden mb-5"></div>
          <div id="wl-activity-label" class="text-[10px] uppercase tracking-wider text-brand-400 font-bold"></div>
          <input id="wl-title" maxlength="120" placeholder="Add a headline or title" class="mt-3 w-full bg-transparent text-2xl md:text-3xl font-black outline-none placeholder:text-white/20">
          <p id="wl-prompt" class="mt-3 text-sm text-white/55 leading-relaxed"></p>
          <div id="wl-starters" class="flex flex-wrap gap-2 mt-4"></div>
        </div>
        <div class="p-5 md:p-6">
          <textarea id="wl-content" maxlength="12000" class="wl-editor" placeholder="Start writing here..."></textarea>
          <div class="mt-4 flex items-center gap-3">
            <div class="wl-goal-track flex-1"><div id="wl-progress" class="wl-goal-fill" style="width:0"></div></div>
            <span id="wl-count" class="text-[11px] text-white/50 font-mono min-w-[110px] text-right">0 words</span>
          </div>
        </div>
        <div class="p-5 md:p-6 border-t border-white/8">
          <div class="text-[10px] uppercase tracking-wider text-white/35 font-bold mb-3">Reporter's Checklist</div>
          <div id="wl-checklist" class="grid sm:grid-cols-2 gap-3"></div>
          <div id="wl-message" class="hidden mt-4 p-3 text-xs border rounded-xl"></div>
          <div class="flex flex-wrap items-center gap-3 mt-5">
            <button id="wl-save" class="wl-btn px-5 py-3 border border-white/15 hover:bg-white/5 text-xs">Save Draft</button>
            <button id="wl-revise" class="wl-btn wl-btn-revise hidden px-5 py-3 text-xs">Revise This Piece</button>
            <button id="wl-submit" class="wl-btn wl-btn-submit px-5 py-3 text-xs inline-flex items-center gap-2">Submit to Teacher <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/20" id="wl-xp-preview">+0 XP</span></button>
            <span id="wl-save-status" class="wl-save-status text-white/35 ml-auto"></span>
          </div>
        </div>
      </div>
      <aside class="space-y-6">
        <div class="wl-card"><div class="p-4 border-b border-white/8 flex items-center gap-2"><iconify-icon icon="lucide:folder-open" class="text-brand-400"></iconify-icon><h2 class="font-bold">My Press Box</h2></div><div id="wl-history" class="p-2"></div></div>
        <div class="wl-card"><div class="p-4 border-b border-white/8 flex items-center gap-2"><iconify-icon icon="lucide:pen-tool" class="text-brand-400"></iconify-icon><h2 class="font-bold">Writing Leaders</h2></div><div id="wl-leaders" class="p-2"></div></div>
      </aside>
    </div>
  </div>
  <div id="wl-confirm" class="wl-modal"><div class="wl-modal-card p-6">
    <div class="flex items-center gap-3 mb-4"><div class="w-11 h-11 rounded-2xl grid place-items-center" style="background:linear-gradient(135deg,var(--student-team-secondary,#D50A0A),var(--student-team-primary,#013369))"><iconify-icon icon="lucide:send" class="text-white text-lg"></iconify-icon></div><div><div class="text-[10px] uppercase tracking-widest text-white/45 font-black">Submit to teacher</div><div id="wl-confirm-title" class="font-black text-lg">Ready to submit?</div></div></div>
    <div id="wl-confirm-body" class="space-y-2 mb-5"></div>
    <div class="flex gap-3"><button id="wl-confirm-cancel" class="wl-btn flex-1 px-4 py-3 border border-white/15 hover:bg-white/5 text-xs">Keep Editing</button><button id="wl-confirm-go" class="wl-btn wl-btn-submit flex-1 px-4 py-3 text-xs">Submit Now</button></div>
  </div></div>`;

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
  const statusAccent = entry => entry.status === 'revision' || (entry.status === 'draft' && entry.teacher_feedback) ? '#f59e0b'
    : entry.status === 'complete' || entry.status === 'reviewed' ? '#22c55e'
    : entry.status === 'submitted' ? '#3b82f6' : 'rgba(255,255,255,.15)';

  function checklist() {
    return Object.fromEntries([...document.querySelectorAll('[data-check]')].map(input => [input.dataset.check, input.checked]));
  }

  function renderStatusFlow(entry = {}) {
    const status = entry.status || 'draft';
    const active = status === 'complete' || status === 'reviewed' ? 3 : status === 'revision' ? 2 : status === 'submitted' ? 1 : 0;
    const steps = [['Draft', 'pencil'], ['Submitted', 'send'], ['Reviewed', 'clipboard-check'], [status === 'revision' ? 'Revise' : 'Done', status === 'revision' ? 'rotate-ccw' : 'check-circle']];
    $('wl-status-flow').innerHTML = steps.map(([label, icon], index) => `<div class="wl-step ${index <= active ? 'on' : ''}"><div class="wl-step-line"></div><div class="wl-step-node"><iconify-icon icon="lucide:${icon}" class="text-sm"></iconify-icon></div><span class="wl-step-label">${esc(label)}</span></div>`).join('');
  }

  function renderFeedback(entry = {}) {
    const panel = $('wl-feedback-panel');
    const show = (cls, icon, title, body) => {
      panel.className = `wl-feedback mb-5 p-4 border ${cls}`;
      panel.innerHTML = `<div class="flex items-start gap-3"><iconify-icon icon="lucide:${icon}" class="text-xl shrink-0"></iconify-icon><div><div class="text-xs font-black uppercase tracking-wide">${title}</div><p class="text-sm leading-6 mt-2 whitespace-pre-wrap">${esc(body)}</p></div></div>`;
      panel.classList.remove('hidden');
    };
    if (entry.status === 'revision') return show('border-amber-300/40 bg-amber-400/10 text-amber-50', 'message-square-warning', 'Feedback returned: revise and resubmit', entry.teacher_feedback || 'Use your teacher feedback to make this stronger, then resubmit.');
    if (entry.status === 'draft' && entry.teacher_feedback) return show('border-amber-300/30 bg-amber-400/10 text-amber-50', 'clipboard-pen', 'Revision notes', entry.teacher_feedback);
    if ((entry.status === 'complete' || entry.status === 'reviewed') && entry.teacher_feedback) return show('border-green-300/30 bg-green-400/10 text-green-50', 'badge-check', 'Marked complete', entry.teacher_feedback);
    panel.className = 'hidden';
    panel.innerHTML = '';
  }

  function renderActivities() {
    $('wl-activities').innerHTML = Object.entries(activities).map(([key, activity]) => {
      const entry = state.entries.find(item => item.activity === key) || {};
      const selected = key === state.activity;
      const accent = statusAccent(entry);
      const statusTone = entry.status === 'revision' || (entry.teacher_feedback && entry.status === 'draft') ? 'text-amber-300' : entry.status === 'complete' || entry.status === 'reviewed' ? 'text-green-300' : entry.status === 'submitted' ? 'text-blue-300' : 'text-white/30';
      return `<button data-activity="${key}" class="wl-activity ${selected ? 'sel' : ''} p-5" style="--wl-accent:${accent}">
        <div class="flex items-center justify-between"><iconify-icon icon="lucide:${activity.icon}" class="text-xl text-brand-400"></iconify-icon><span class="text-[10px] font-bold text-white/40">+${activity.xp} XP</span></div>
        <div class="font-bold mt-4">${activity.label}</div>
        <div class="flex items-center justify-between gap-2 mt-2"><span class="text-[10px] text-white/35">Goal: ${activity.goal} words</span><span class="inline-flex items-center gap-1.5 text-[9px] uppercase font-black ${statusTone}"><span class="wl-adot" style="background:${accent}"></span>${entryStatusLabel(entry)}</span></div>
      </button>`;
    }).join('');
    document.querySelectorAll('[data-activity]').forEach(button => button.onclick = () => selectActivity(button.dataset.activity));
  }

  function renderChecklist(entry = {}) {
    const checks = [['capitals', 'I checked capitals'], ['punctuation', 'I checked punctuation'], ['evidence', 'I used facts or statistics'], ['sentences', 'I wrote complete sentences']];
    $('wl-checklist').innerHTML = checks.map(([key, label]) => `<label class="flex items-center gap-3 text-xs text-white/65 cursor-pointer"><input data-check="${key}" type="checkbox" ${entry.checklist?.[key] ? 'checked' : ''} class="accent-blue-500 w-4 h-4">${label}</label>`).join('');
    document.querySelectorAll('[data-check]').forEach(input => input.addEventListener('change', scheduleAutosave));
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
    $('wl-save-status').classList.toggle('hidden', locked);
  }

  function selectActivity(key) {
    state.activity = key;
    const activity = activities[key];
    const entry = currentEntry();
    $('wl-activity-label').textContent = `${activity.label} · ${entryStatusLabel(entry)}`;
    $('wl-prompt').textContent = activity.prompt.replace('your team', state.team);
    $('wl-title').value = entry.title || '';
    $('wl-content').value = entry.content || '';
    $('wl-xp-preview').textContent = `+${activity.xp} XP`;
    $('wl-starters').innerHTML = activity.starters.map(text => `<button class="wl-starter px-3 py-2 text-[11px] text-white/55">${esc(text)}</button>`).join('');
    [...$('wl-starters').children].forEach((button, index) => button.onclick = () => {
      const starter = activity.starters[index];
      $('wl-content').value += `${$('wl-content').value.trim() ? '\n\n' : ''}${starter} `;
      updateCount();
      scheduleAutosave();
      $('wl-content').focus();
    });
    renderChecklist(entry);
    // Snapshot AFTER the checklist renders so the saved state uses the same
    // normalized key set that checklist() produces — otherwise isDirty() is
    // permanently true (saved {capitals:true} vs live {capitals:true,punctuation:false,...}).
    lastSaved = { title:entry.title || '', content:entry.content || '', checklist:JSON.stringify(checklist()) };
    renderStatusFlow(entry);
    renderFeedback(entry);
    renderActivities();
    updateCount();
    setLocked(entry);
    setSaveStatus(entry.status === 'submitted' ? 'submitted' : 'clean');
    showMessage('', 'info');
  }

  function updateCount() {
    const count = words();
    const goal = activities[state.activity].goal;
    const pct = Math.min(100, count / goal * 100);
    $('wl-count').textContent = `${count} / ${goal} words`;
    const fill = $('wl-progress');
    fill.style.width = `${pct}%`;
    fill.classList.toggle('done', count >= goal);
  }

  function setSaveStatus(kind) {
    const el = $('wl-save-status');
    if (!el) return;
    const map = {
      clean:['', ''],
      dirty:['lucide:circle-dot', 'Unsaved changes'],
      saving:['lucide:loader-circle', 'Saving...'],
      saved:['lucide:check', 'Saved'],
      failed:['lucide:cloud-off', 'Save failed - retrying'],
      submitted:['lucide:lock', 'Submitted - locked']
    };
    const [icon, text] = map[kind] || ['', ''];
    el.innerHTML = icon ? `<iconify-icon icon="${icon}" class="${kind === 'saving' ? 'animate-spin' : ''}"></iconify-icon>${text}` : '';
    el.style.color = kind === 'saved' ? 'rgba(74,222,128,.9)' : kind === 'failed' ? 'rgba(248,113,113,.9)' : kind === 'saving' ? 'rgba(255,255,255,.6)' : kind === 'dirty' ? 'rgba(247,209,84,.9)' : 'rgba(255,255,255,.35)';
  }

  function isDirty() {
    return $('wl-title').value !== lastSaved.title || $('wl-content').value !== lastSaved.content || JSON.stringify(checklist()) !== lastSaved.checklist;
  }

  function scheduleAutosave() {
    if ($('wl-content').disabled) return;
    if (!isDirty()) return;
    setSaveStatus('dirty');
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosave, 1400);
  }

  async function autosave() {
    if ($('wl-content').disabled || !isDirty()) return;
    if (!$('wl-title').value.trim() && !$('wl-content').value.trim()) return;
    setSaveStatus('saving');
    const snapshot = { title:$('wl-title').value, content:$('wl-content').value, checklist:JSON.stringify(checklist()) };
    try {
      await api('/api/writing/save', { method:'POST', body:JSON.stringify({ activity:state.activity, title:snapshot.title, content:snapshot.content, checklist:checklist() }) });
      lastSaved = snapshot;
      const entry = state.entries.find(item => item.activity === state.activity);
      if (entry) { entry.title = snapshot.title; entry.content = snapshot.content; }
      setSaveStatus(isDirty() ? 'dirty' : 'saved');
    } catch (error) {
      setSaveStatus('failed');
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(autosave, 4000);
    }
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
    el.className = `mt-4 p-3 text-xs border rounded-xl ${styles[type] || styles.success}`;
  }

  function renderProfile(data) {
    state.profile = data;
    $('wl-xp').textContent = Number(data.writingXp || 0).toLocaleString();
    $('wl-submissions').textContent = data.submissions || 0;
    $('wl-returned').textContent = data.returned || 0;
    $('wl-history').innerHTML = state.entries.length ? state.entries.map(entry => `<button data-open="${entry.activity}" class="w-full text-left p-3 rounded-xl hover:bg-white/[.04] transition" style="border-left:3px solid ${statusAccent(entry)}">
      <div class="flex justify-between gap-2 items-center"><span class="text-xs font-bold">${esc(activities[entry.activity]?.label || entry.activity)}</span><span class="text-[9px] uppercase px-2 py-1 border rounded-full ${statusClasses(entry.status)}">${esc(entryStatusLabel(entry))}</span></div>
      <div class="text-[10px] text-white/35 mt-2 truncate">${esc(entry.title || 'Untitled draft')}</div>
      ${entry.status === 'revision' ? '<div class="text-[10px] text-amber-300 mt-2 flex items-center gap-1"><iconify-icon icon="lucide:message-square-warning"></iconify-icon>Teacher feedback is ready</div>' : ''}
      ${entry.status === 'draft' && entry.teacher_feedback ? '<div class="text-[10px] text-amber-300 mt-2">Revision in progress</div>' : ''}
      ${entry.status === 'complete' || entry.status === 'reviewed' ? '<div class="text-[10px] text-green-300 mt-2 flex items-center gap-1"><iconify-icon icon="lucide:check-circle"></iconify-icon>Finished</div>' : ''}
    </button>`).join('') : '<div class="p-6 text-center text-xs text-white/35">Your saved writing will appear here.</div>';
    document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => selectActivity(button.dataset.open));
    const me = state.username;
    $('wl-leaders').innerHTML = data.leaderboard?.length ? data.leaderboard.slice(0, 5).map((row, index) => {
      const medal = index < 3 ? `<span class="wl-medal medal-${index + 1}" style="color:#1a1206">${index + 1}</span>` : `<span class="w-[22px] text-center text-[11px] font-black text-white/30">${index + 1}</span>`;
      const you = row.username && row.username === me;
      return `<div class="wl-leader-row ${you ? 'wl-leader-you' : ''} grid grid-cols-[24px_1fr_auto] items-center gap-2 p-3 text-xs">${medal}<span class="truncate flex items-center gap-1.5">${esc(row.display_name)}${you ? '<span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/15">You</span>' : ''}</span><span class="font-black font-mono">${Number(row.writing_xp || 0).toLocaleString()} XP</span></div>`;
    }).join('') : '<div class="p-6 text-center text-xs text-white/35">No submissions yet.</div>';
  }

  async function save(submit = false) {
    const payload = { activity:state.activity, title:$('wl-title').value, content:$('wl-content').value, checklist:checklist() };
    try {
      const data = await api(submit ? '/api/writing/submit' : '/api/writing/save', { method:'POST', body:JSON.stringify(payload) });
      lastSaved = { title:payload.title, content:payload.content, checklist:JSON.stringify(payload.checklist) };
      showMessage(data.message);
      window.showEarnedBadges?.(data.awardedBadges);
      await load();
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  function openConfirm() {
    const activity = activities[state.activity];
    const count = words();
    const metGoal = count >= activity.goal;
    const checks = checklist();
    const checkedCount = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length || 4;
    const row = (ok, label, detail) => `<div class="flex items-center gap-3 p-3 rounded-xl border ${ok ? 'border-green-400/25 bg-green-500/5' : 'border-amber-400/25 bg-amber-500/5'}"><iconify-icon icon="lucide:${ok ? 'check-circle-2' : 'alert-circle'}" class="text-lg ${ok ? 'text-green-300' : 'text-amber-300'}"></iconify-icon><div class="min-w-0"><div class="text-xs font-bold">${label}</div><div class="text-[10px] text-white/45">${detail}</div></div></div>`;
    $('wl-confirm-body').innerHTML =
      row(metGoal, 'Word goal', `${count} of ${activity.goal} words${metGoal ? ' — goal met!' : ' — a bit more makes it stronger'}`) +
      row(checkedCount === totalChecks, "Reporter's checklist", `${checkedCount} of ${totalChecks} items checked`) +
      `<div class="flex items-center justify-between p-3 rounded-xl border border-white/12 bg-white/[.03] mt-1"><span class="text-xs font-bold flex items-center gap-2"><iconify-icon icon="lucide:zap" class="text-brand-400"></iconify-icon>You'll earn</span><span class="text-base font-black text-amber-300">+${activity.xp} XP</span></div>`;
    $('wl-confirm').classList.add('show');
  }
  function closeConfirm() { $('wl-confirm').classList.remove('show'); }

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
    state.username = me.user.username;
    state.entries = data.entries || [];
    $('wl-team').textContent = state.team;
    renderProfile(data);
    selectActivity(state.activity);
    window.refreshStudentWritingNotifications?.();
  }

  $('wl-content').addEventListener('input', () => { updateCount(); scheduleAutosave(); });
  $('wl-title').addEventListener('input', scheduleAutosave);
  $('wl-content').addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); if (!$('wl-content').disabled) save(false); }
  });
  function flushOnExit() {
    if ($('wl-content').disabled || !isDirty()) return;
    const title = $('wl-title').value, content = $('wl-content').value;
    if (!title.trim() && !content.trim()) return;
    try {
      const body = new Blob([JSON.stringify({ activity:state.activity, title, content, checklist:checklist() })], { type:'application/json' });
      navigator.sendBeacon('/api/writing/save', body);
      lastSaved = { title, content, checklist:JSON.stringify(checklist()) };
    } catch (error) {}
  }
  window.addEventListener('pagehide', flushOnExit);
  $('wl-save').onclick = () => save(false);
  $('wl-submit').onclick = openConfirm;
  $('wl-confirm-cancel').onclick = closeConfirm;
  $('wl-confirm').onclick = event => { if (event.target === $('wl-confirm')) closeConfirm(); };
  $('wl-confirm-go').onclick = () => { closeConfirm(); save(true); };
  $('wl-revise').onclick = revise;
  load().catch(error => showMessage(error.message, 'error'));
})();
