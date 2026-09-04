/* Classroom progress analytics and all-category rankings. */
(() => {
  const main = document.querySelector('main');
  if (!main) return;

  let students = [];
  let category = 'total_xp';
  const categories = {
    total_xp: ['Math Season XP', 'XP'],
    weekly_xp: ['Weekly Math XP', 'XP'],
    writing_xp: ['Writing XP', 'XP'],
    writing_submissions: ['Writing Submissions', ''],
    touchdowns: ['Touchdowns', 'TD'],
    accuracy: ['Accuracy', '%'],
    correct_answers: ['Correct Answers', ''],
    best_streak: ['Best Streak', '']
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  async function api(url) {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load analytics.');
    return data;
  }

  const panel = document.createElement('section');
  panel.className = 'panel rounded-xl overflow-hidden mb-5';
  panel.innerHTML = `<div class="p-5 border-b border-white/10 flex flex-col md:flex-row md:items-end justify-between gap-3"><div><h2 class="font-semibold flex items-center gap-2"><iconify-icon icon="lucide:chart-no-axes-combined" class="text-blue-400"></iconify-icon>Student Progress and Rankings</h2><p class="text-xs text-white/35 mt-1">Track math, writing, XP, and class rankings.</p></div><div class="flex gap-2"><select id="analytics-category" class="border border-white/10 rounded-lg px-3 py-2 text-xs outline-none">${Object.entries(categories).map(([key, value]) => `<option value="${key}">${value[0]}</option>`).join('')}</select><button id="analytics-refresh" title="Refresh analytics" class="w-9 h-9 rounded-lg bg-white/5"><iconify-icon icon="lucide:refresh-cw"></iconify-icon></button></div></div><div id="analytics-summary" class="grid grid-cols-2 lg:grid-cols-7 border-b border-white/10"></div><div class="grid xl:grid-cols-[.72fr_1.28fr]"><div class="border-b xl:border-b-0 xl:border-r border-white/10"><div class="p-4 border-b border-white/10"><h3 id="ranking-title" class="text-sm font-bold">Math Season XP Rankings</h3></div><div id="analytics-ranking"></div></div><div class="overflow-x-auto"><table class="w-full text-left"><thead><tr class="text-[9px] uppercase text-white/35 border-b border-white/10"><th class="p-3">Student</th><th class="p-3">Math XP</th><th class="p-3">Weekly XP</th><th class="p-3">Writing XP</th><th class="p-3">Writing</th><th class="p-3">TD</th><th class="p-3">Accuracy</th><th class="p-3">Answers</th><th class="p-3">Best Streak</th><th class="p-3">Actions</th></tr></thead><tbody id="analytics-table"></tbody></table></div></div>`;
  main.insertBefore(panel, main.lastElementChild);

  function display(student, key) {
    const value = Number(student[key] || 0);
    if (key === 'accuracy') return `${value}%`;
    return `${value.toLocaleString()}${categories[key][1] ? ` ${categories[key][1]}` : ''}`;
  }

  function ranked() {
    const sorted = students.filter(student => student.active).sort((a, b) => Number(b[category] || 0) - Number(a[category] || 0) || a.display_name.localeCompare(b.display_name));
    let previous = null;
    let rank = 0;
    return sorted.map((student, index) => {
      const value = Number(student[category] || 0);
      if (value !== previous) rank = index + 1;
      previous = value;
      return { ...student, rank };
    });
  }

  function render() {
    document.getElementById('ranking-title').textContent = `${categories[category][0]} Rankings`;
    document.getElementById('analytics-ranking').innerHTML = ranked().map(student => `<div class="grid grid-cols-[34px_1fr_auto] items-center gap-2 px-4 py-3 border-b border-white/5 ${student.rank === 1 ? 'bg-yellow-400/[.04]' : ''}"><span class="text-xs font-black text-white/30">#${student.rank}</span><span class="min-w-0"><span class="block text-xs font-semibold truncate">${esc(student.display_name)}</span><span class="block text-[9px] text-white/30">${esc(student.selected_team || 'Unassigned')}</span></span><span class="text-xs font-black">${display(student, category)}</span></div>`).join('') || '<div class="p-8 text-center text-xs text-white/35">No active students yet.</div>';
    document.getElementById('analytics-table').innerHTML = students.map(student => `<tr class="border-b border-white/5 ${student.active ? '' : 'opacity-40'}"><td class="p-3"><div class="text-xs font-semibold">${esc(student.display_name)}</div><div class="text-[9px] text-white/30">${esc(student.selected_team || 'Unassigned')}</div></td><td class="p-3 text-xs font-mono">${student.total_xp}</td><td class="p-3 text-xs font-mono">${student.weekly_xp}</td><td class="p-3 text-xs font-mono">${student.writing_xp}</td><td class="p-3 text-xs font-mono">${student.writing_submissions}</td><td class="p-3 text-xs font-mono">${student.touchdowns}</td><td class="p-3 text-xs font-mono">${student.accuracy}%</td><td class="p-3 text-xs font-mono">${student.questions_answered}</td><td class="p-3 text-xs font-mono">${student.best_streak}</td><td class="p-3"><button type="button" data-xp-adjust="${student.id}" title="Adjust XP for ${esc(student.display_name)}" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-400/15 text-white/60 hover:text-blue-300"><iconify-icon icon="lucide:sliders-horizontal"></iconify-icon></button></td></tr>`).join('');
    document.querySelectorAll('[data-xp-adjust]').forEach(button => button.addEventListener('click', () => openXpModal(students.find(student => String(student.id) === button.dataset.xpAdjust))));
  }

  function closeXpModal() {
    document.getElementById('teacher-xp-modal')?.remove();
    document.removeEventListener('keydown', onEscape);
  }

  function onEscape(event) { if (event.key === 'Escape') closeXpModal(); }

  function openXpModal(student) {
    if (!student) return;
    closeXpModal();
    const modal = document.createElement('div');
    modal.id = 'teacher-xp-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70';
    modal.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="teacher-xp-title" class="w-full max-w-md rounded-2xl border border-white/10 bg-[#101722] shadow-2xl overflow-hidden"><div class="p-5 border-b border-white/10 flex items-start justify-between gap-4"><div><div class="text-[10px] uppercase tracking-[.18em] text-blue-300/70 font-bold">XP management</div><h3 id="teacher-xp-title" class="text-lg font-black mt-1">${esc(student.display_name)}</h3><p class="text-xs text-white/45 mt-1">Current XP: <strong class="text-white">${Number(student.total_xp || 0).toLocaleString()}</strong></p></div><button type="button" data-xp-close title="Close" class="w-8 h-8 rounded-lg bg-white/5 text-white/60"><iconify-icon icon="lucide:x"></iconify-icon></button></div><form id="teacher-xp-form" class="p-5 space-y-4"><label class="block text-xs text-white/60">XP to deduct<input id="teacher-xp-amount" type="number" min="1" max="100000" step="1" required class="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-blue-400" placeholder="Example: 25"></label><p id="teacher-xp-error" class="hidden text-xs text-red-300"></p><div class="flex flex-col-reverse sm:flex-row sm:justify-between gap-2"><button type="button" data-xp-reset class="rounded-lg border border-red-400/30 px-4 py-2.5 text-xs font-bold text-red-200 hover:bg-red-400/10">Reset XP to 0</button><div class="flex gap-2 sm:ml-auto"><button type="button" data-xp-close class="rounded-lg bg-white/5 px-4 py-2.5 text-xs font-bold">Cancel</button><button type="submit" class="rounded-lg bg-blue-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-400">Deduct XP</button></div></div></form></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-xp-close]')) closeXpModal(); });
    modal.querySelector('[data-xp-reset]').addEventListener('click', () => adjustXp(student, 'reset'));
    modal.querySelector('#teacher-xp-form').addEventListener('submit', event => { event.preventDefault(); adjustXp(student, 'deduct'); });
    document.addEventListener('keydown', onEscape);
    modal.querySelector('#teacher-xp-amount').focus();
  }

  async function adjustXp(student, action) {
    const amountInput = document.getElementById('teacher-xp-amount');
    const error = document.getElementById('teacher-xp-error');
    const amount = Number(amountInput?.value);
    if (action === 'deduct' && (!Number.isSafeInteger(amount) || amount < 1)) {
      error.textContent = 'Enter a whole XP amount greater than 0.';
      error.classList.remove('hidden');
      return;
    }
    if (action === 'reset' && !window.confirm(`Reset ${student.display_name}'s XP to 0?`)) return;
    const buttons = document.querySelectorAll('#teacher-xp-modal button');
    buttons.forEach(button => { button.disabled = true; button.classList.add('opacity-50'); });
    try {
      const response = await fetch(`/api/teacher/students/${student.id}/xp`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action, amount:action === 'reset' ? 0 : amount }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update XP.');
      const target = students.find(item => String(item.id) === String(student.id));
      if (target) { target.total_xp = data.totalXp; target.weekly_xp = data.weeklyXp; }
      closeXpModal();
      render();
    } catch (requestError) {
      error.textContent = requestError.message;
      error.classList.remove('hidden');
      buttons.forEach(button => { button.disabled = false; button.classList.remove('opacity-50'); });
    }
  }

  async function load() {
    const data = await api('/api/teacher/analytics');
    students = data.students;
    const cards = [
      ['Active Students', data.summary.activeStudents],
      ['Math XP', data.summary.totalXp.toLocaleString()],
      ['Weekly XP', data.summary.weeklyXp.toLocaleString()],
      ['Writing XP', data.summary.writingXp.toLocaleString()],
      ['Writing Submitted', data.summary.writingSubmissions],
      ['Average Accuracy', `${data.summary.averageAccuracy}%`],
      ['Questions Answered', data.summary.totalAnswers]
    ];
    document.getElementById('analytics-summary').innerHTML = cards.map(([label, value], index) => `<div class="p-4 ${index < cards.length - 1 ? 'border-r' : ''} border-white/10"><div class="text-[9px] uppercase text-white/30 font-bold">${label}</div><div class="text-xl font-black mt-1">${value}</div></div>`).join('');
    render();
  }

  document.getElementById('analytics-category').addEventListener('change', event => { category = event.target.value; render(); });
  document.getElementById('analytics-refresh').addEventListener('click', load);
  load().catch(error => { document.getElementById('analytics-ranking').textContent = error.message; });
})();
