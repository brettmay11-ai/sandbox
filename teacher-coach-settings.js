/* Teacher controls, question trends, and safety review for the Team Research Coach. */
(() => {
  const main = document.querySelector('main');
  if (!main) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const pretty = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  async function api(url, options = {}) {
    const response = await fetch(url, { headers:{ 'Content-Type':'application/json' }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  const panel = document.createElement('section');
  panel.className = 'panel rounded-xl p-5 mb-5';
  panel.innerHTML = `
    <div class="grid lg:grid-cols-2 gap-6 mb-6">
      <div>
        <h2 class="font-semibold flex items-center gap-2"><iconify-icon icon="lucide:graduation-cap" class="text-blue-400"></iconify-icon>Team Research Coach</h2>
        <p class="text-xs text-white/35 mt-1 mb-4">Give the coach a weekly classroom focus.</p>
        <form id="coach-focus-form" class="flex gap-2">
          <input id="coach-focus" maxlength="500" class="flex-1 border border-white/10 rounded-lg px-3 py-2.5 outline-none" placeholder="Example: Compare stadium capacity and city population">
          <button class="px-4 py-2 bg-blue-700 rounded-lg text-xs font-bold">Save Focus</button>
        </form>
      </div>
      <div>
        <h3 class="text-xs uppercase font-bold text-white/45 mb-3">Common Questions, Last 30 Days</h3>
        <div id="coach-question-trends" class="space-y-2 text-xs text-white/55">Loading question trends...</div>
      </div>
    </div>
    <div class="border border-white/10 rounded-xl overflow-hidden">
      <div class="p-4 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold flex items-center gap-2"><iconify-icon icon="lucide:shield-alert" class="text-amber-300"></iconify-icon>Safety Flags</h3>
          <p class="text-xs text-white/35 mt-1">Flagged coach messages are saved here for teacher review. No email alerts are sent.</p>
        </div>
        <div id="coach-safety-count" class="hidden min-w-8 h-8 px-2 rounded-lg bg-red-500 text-white text-xs font-black items-center justify-center"></div>
      </div>
      <div id="coach-safety-flags" class="divide-y divide-white/10 text-xs text-white/60">Loading safety flags...</div>
    </div>`;
  main.insertBefore(panel, main.children[2] || null);

  function severityClass(severity) {
    return severity === 'high' ? 'bg-red-500/15 text-red-300 border-red-500/25' : severity === 'medium' ? 'bg-amber-500/15 text-amber-200 border-amber-500/25' : 'bg-blue-500/15 text-blue-200 border-blue-500/25';
  }

  function renderQuestions(data) {
    document.getElementById('coach-question-trends').innerHTML = data.questions.length
      ? data.questions.map(item => `<div class="flex justify-between gap-3 border-b border-white/5 pb-2"><span>${esc(item.question)}</span><span class="text-white/30">${item.count} asked</span></div>`).join('')
      : '<span class="text-white/30">No student questions yet.</span>';
  }

  function renderSafetyFlags(data) {
    const count = data.unreadCount || 0;
    const badge = document.getElementById('coach-safety-count');
    badge.textContent = count;
    badge.classList.toggle('hidden', !count);
    badge.classList.toggle('flex', Boolean(count));
    const target = document.getElementById('coach-safety-flags');
    target.innerHTML = data.flags.length ? data.flags.map(flag => `
      <div class="p-4 ${flag.reviewed_at ? 'opacity-55' : ''}">
        <div class="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="px-2 py-1 rounded border ${severityClass(flag.severity)} text-[10px] font-black uppercase">${esc(flag.severity)}</span>
              <span class="px-2 py-1 rounded border border-white/10 bg-white/5 text-[10px] uppercase text-white/45">${esc(pretty(flag.category))}</span>
              <span class="text-white/30">${esc(flag.display_name || flag.username || 'Unknown student')}</span>
              <span class="text-white/20">${new Date(flag.created_at).toLocaleString()}</span>
            </div>
            <div class="text-white/75 leading-5 break-words">${esc(flag.message)}</div>
            <div class="text-white/30 mt-2">Page: ${esc(flag.page)}${flag.selected_team ? ` / Team: ${esc(flag.selected_team)}` : ''}</div>
          </div>
          ${flag.reviewed_at ? `<div class="text-[10px] text-green-300 shrink-0">Reviewed ${new Date(flag.reviewed_at).toLocaleDateString()}</div>` : `<button data-review-flag="${flag.id}" class="shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold">Mark Reviewed</button>`}
        </div>
      </div>`).join('') : '<div class="p-5 text-white/35">No safety flags yet.</div>';
    target.querySelectorAll('[data-review-flag]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        const updated = await api(`/api/coach/safety-flags/${button.dataset.reviewFlag}/review`, { method:'PATCH', body:'{}' });
        renderSafetyFlags(updated);
        window.refreshTeacherNotifications?.();
      });
    });
  }

  async function refreshCoachPanels() {
    const [context, questions, flags] = await Promise.all([api('/api/coach/context'), api('/api/coach/questions'), api('/api/coach/safety-flags')]);
    document.getElementById('coach-focus').value = context.focus?.prompt || '';
    renderQuestions(questions);
    renderSafetyFlags(flags);
  }

  refreshCoachPanels().catch(error => {
    document.getElementById('coach-question-trends').textContent = error.message;
    document.getElementById('coach-safety-flags').textContent = error.message;
  });

  document.getElementById('coach-focus-form').addEventListener('submit', async event => {
    event.preventDefault();
    await api('/api/coach/focus', { method:'PATCH', body:JSON.stringify({ prompt:document.getElementById('coach-focus').value }) });
    alert('Coach focus saved.');
  });
})();
