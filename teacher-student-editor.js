(() => {
  const tbody = document.getElementById('student-list');
  if (!tbody) return;
  const escapeValue = value => String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[character]));

  const inputClass = 'mt-1 w-full min-w-[145px] border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none bg-white/5 text-white placeholder:text-white/30 focus:border-cyan-300/60';

  function enhanceRows() {
    tbody.querySelectorAll('tr').forEach(row => {
      if (row.dataset.identityEditorInstalled === 'true' || row.children.length < 4) return;
      const resetButton = row.querySelector('[onclick^="resetPin("]');
      const match = resetButton?.getAttribute('onclick')?.match(/^resetPin\((\d+)/);
      if (!match) return;

      const identityCell = row.children[0];
      const displayName = identityCell.querySelector('.text-sm')?.textContent.trim() || '';
      const username = identityCell.querySelector('.text-\\[10px\\]')?.textContent.trim() || '';
      identityCell.innerHTML = `
        <div class="space-y-2">
          <label class="block text-[9px] uppercase tracking-[0.12em] text-white/35">Display name
            <input data-student-display value="${escapeValue(displayName)}" maxlength="80" class="${inputClass}" />
          </label>
          <label class="block text-[9px] uppercase tracking-[0.12em] text-white/35">Username
            <input data-student-username value="${escapeValue(username)}" maxlength="32" class="${inputClass}" />
          </label>
        </div>`;

      const actions = row.children[3];
      const actionGroup = actions.querySelector('div');
      if (!actionGroup) return;
      actionGroup.insertAdjacentHTML('beforeend', '<button type="button" data-save-student-identity class="px-2 py-1 text-[10px] rounded bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20" title="Save name and username"><iconify-icon icon="lucide:save"></iconify-icon><span class="sr-only">Save name and username</span></button>');
      actions.insertAdjacentHTML('beforeend', '<span data-student-identity-status class="block mt-2 text-[10px] text-white/40"></span>');

      row.querySelector('[data-save-student-identity]').addEventListener('click', async () => {
        const button = row.querySelector('[data-save-student-identity]');
        const status = row.querySelector('[data-student-identity-status]');
        const payload = {
          displayName: row.querySelector('[data-student-display]').value,
          username: row.querySelector('[data-student-username]').value
        };
        button.disabled = true;
        status.textContent = 'Saving...';
        try {
          const response = await fetch(`/api/teacher/students/${match[1]}`, {
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Unable to save student.');
          row.querySelector('[data-student-display]').value = data.student.display_name;
          row.querySelector('[data-student-username]').value = data.student.username;
          status.textContent = 'Saved';
          status.className = 'block mt-2 text-[10px] text-emerald-300';
        } catch (error) {
          status.textContent = error.message;
          status.className = 'block mt-2 text-[10px] text-rose-300';
        } finally {
          button.disabled = false;
        }
      });
      row.dataset.identityEditorInstalled = 'true';
    });
  }

  new MutationObserver(enhanceRows).observe(tbody, { childList:true, subtree:true });
  enhanceRows();
})();
