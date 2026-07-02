(() => {
  const main = document.querySelector('main');
  if (!main) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const labels = { postgame:'Postgame Reporter', prediction:'Make Your Prediction', journal:'Season Journal' };
  const feedbackStarters = [
    'Great evidence. Next, explain why that detail matters.',
    'Add one more football statistic to support your idea.',
    'Check capitals and punctuation, then resubmit.',
    'Make the opening sentence stronger so the reader knows your main idea.',
    'Add a clear ending sentence that wraps up your thinking.'
  ];
  const statusCopy = {
    submitted:{ label:'Waiting for feedback', classes:'text-red-200 border-red-400/30 bg-red-500/10' },
    revision:{ label:'Returned for revision', classes:'text-amber-200 border-amber-400/35 bg-amber-500/10' },
    complete:{ label:'Complete', classes:'text-green-200 border-green-400/35 bg-green-500/10' },
    reviewed:{ label:'Complete', classes:'text-green-200 border-green-400/35 bg-green-500/10' }
  };

  const section = document.createElement('section');
  section.className = 'panel rounded-xl mt-6 overflow-hidden';
  section.dataset.teacherPage = 'writing';
  section.innerHTML = `<div class="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h2 class="font-semibold">Writing Review Queue</h2>
      <p class="text-xs text-white/35 mt-1">Return writing for revision or mark it complete.</p>
    </div>
    <div class="flex items-center gap-2">
      <div id="tw-summary" class="text-[10px] uppercase text-white/35 font-bold"></div>
      <button id="tw-refresh" title="Refresh writing" class="w-9 h-9 rounded-lg bg-white/5"><iconify-icon icon="lucide:refresh-cw"></iconify-icon></button>
    </div>
  </div><div id="tw-list"></div>`;
  main.appendChild(section);

  function statusPill(status) {
    const item = statusCopy[status] || statusCopy.submitted;
    return `<span class="px-2 py-1 border ${item.classes}">${item.label}</span>`;
  }

  async function sendReview(id, status, button) {
    button.disabled = true;
    const original = button.innerHTML;
    try {
      const feedback = document.getElementById(`tw-feedback-${id}`).value;
      await api(`/api/teacher/writing/${id}`, { method:'PATCH', body:JSON.stringify({ feedback, status }) });
      button.className = `mt-2 w-full ${status === 'complete' ? 'bg-green-600' : 'bg-amber-500 text-black'} rounded-lg py-2.5 text-xs font-black`;
      button.innerHTML = `<span class="inline-flex items-center gap-2"><iconify-icon icon="lucide:check"></iconify-icon>${status === 'complete' ? 'Marked Complete' : 'Returned for Revision'}</span>`;
      window.refreshTeacherNotifications?.();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await load();
    } catch (error) {
      button.innerHTML = original;
      button.disabled = false;
      alert(error.message);
    }
  }

  function renderRows(rows) {
    const pending = rows.filter(row => row.status === 'submitted').length;
    const returned = rows.filter(row => row.status === 'revision').length;
    const complete = rows.filter(row => row.status === 'complete' || row.status === 'reviewed').length;
    document.getElementById('tw-summary').textContent = `${pending} waiting · ${returned} revising · ${complete} complete`;
    document.getElementById('tw-list').innerHTML = rows.length ? rows.map(row => {
      const dimmed = row.status === 'complete' || row.status === 'reviewed';
      const checked = key => row.checklist?.[key] ? 'text-green-300' : 'text-white/25';
      return `<article class="grid lg:grid-cols-[1fr_340px] border-b border-white/10 ${dimmed ? 'opacity-70' : ''}">
        <div class="p-5">
          <div class="flex flex-wrap gap-2 text-[10px] uppercase font-bold">
            <span class="text-blue-300">${esc(labels[row.activity] || row.activity)}</span>
            <span class="text-white/35">${esc(row.display_name)} · ${esc(row.selected_team || 'Unassigned')}</span>
            ${statusPill(row.status)}
          </div>
          <h3 class="font-bold mt-3">${esc(row.title || 'Untitled')}</h3>
          <div class="mt-3 flex flex-wrap gap-2 text-[10px] uppercase font-bold">
            <span class="${checked('capitals')}">Capitals</span>
            <span class="${checked('punctuation')}">Punctuation</span>
            <span class="${checked('evidence')}">Evidence</span>
            <span class="${checked('sentences')}">Complete sentences</span>
          </div>
          <p class="mt-3 text-sm leading-6 text-white/65 whitespace-pre-wrap">${esc(row.content)}</p>
          ${row.teacher_feedback ? `<div class="mt-4 p-3 border border-white/10 bg-white/[.03] text-xs text-white/55"><span class="font-bold text-white/70">Last feedback:</span><div class="mt-1 whitespace-pre-wrap">${esc(row.teacher_feedback)}</div></div>` : ''}
        </div>
        <div class="p-5 border-t lg:border-t-0 lg:border-l border-white/10">
          <label class="text-[10px] uppercase text-white/35 font-bold">Teacher Feedback<textarea id="tw-feedback-${row.id}" class="mt-3 w-full min-h-[150px] bg-white/5 border border-white/10 rounded-lg p-3 text-xs outline-none focus:border-blue-400" placeholder="Add encouragement and one clear next step...">${esc(row.teacher_feedback || '')}</textarea></label>
          <div class="mt-3 flex flex-wrap gap-2">${feedbackStarters.map(text => `<button data-feedback-chip="${row.id}" data-feedback-text="${esc(text)}" class="px-2.5 py-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] text-white/60">${esc(text.split('.')[0])}</button>`).join('')}</div>
          <button data-review-revision="${row.id}" class="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-black rounded-lg py-2.5 text-xs font-black">Return for Revision</button>
          <button data-review-complete="${row.id}" class="mt-2 w-full bg-green-700 hover:bg-green-600 rounded-lg py-2.5 text-xs font-semibold">Mark Complete</button>
        </div>
      </article>`;
    }).join('') : '<div class="p-10 text-center text-sm text-white/35">No writing submissions yet.</div>';

    document.querySelectorAll('[data-feedback-chip]').forEach(button => {
      button.onclick = () => {
        const textarea = document.getElementById(`tw-feedback-${button.dataset.feedbackChip}`);
        const starter = button.dataset.feedbackText;
        textarea.value = `${textarea.value.trim()}${textarea.value.trim() ? '\n' : ''}${starter}`;
        textarea.focus();
      };
    });
    document.querySelectorAll('[data-review-revision]').forEach(button => button.onclick = () => sendReview(button.dataset.reviewRevision, 'revision', button));
    document.querySelectorAll('[data-review-complete]').forEach(button => button.onclick = () => sendReview(button.dataset.reviewComplete, 'complete', button));
    window.refreshTeacherNotifications?.();
  }

  async function load() {
    const data = await api('/api/teacher/writing');
    const rows = data.submissions || [];
    const ordered = [
      ...rows.filter(row => row.status === 'submitted'),
      ...rows.filter(row => row.status === 'revision'),
      ...rows.filter(row => row.status === 'complete' || row.status === 'reviewed')
    ];
    renderRows(ordered);
  }

  document.getElementById('tw-refresh').onclick = load;
  load().catch(error => {
    document.getElementById('tw-list').innerHTML = `<div class="p-8 text-red-300 text-sm">${esc(error.message)}</div>`;
  });
})();
