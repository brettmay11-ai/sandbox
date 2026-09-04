(() => {
  function initialize() {
    const tbody = document.getElementById('student-list');
    if (!tbody) return;
    const inputClass = 'mt-2 w-full border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none bg-white/5 text-white placeholder:text-white/30 focus:border-cyan-300/60';
    let activeModal = null;

    function closeModal() { activeModal?.remove(); activeModal = null; }

    function openModal(studentId, displayName, username) {
      closeModal();
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4';
      modal.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="edit-student-title" class="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
        <div class="flex items-start justify-between gap-4"><div><p class="text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Student account</p><h2 id="edit-student-title" class="mt-1 text-xl font-semibold text-white">Edit student details</h2></div><button type="button" data-close-edit class="h-8 w-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white" title="Close"><iconify-icon icon="lucide:x"></iconify-icon><span class="sr-only">Close</span></button></div>
        <div class="mt-6 space-y-4"><label class="block text-xs text-white/55">Display name<input data-edit-display maxlength="80" class="${inputClass}" /></label><label class="block text-xs text-white/55">Username<input data-edit-username maxlength="32" class="${inputClass}" /></label></div>
        <p data-edit-status class="mt-3 min-h-5 text-xs text-white/45"></p><div class="mt-5 flex justify-end gap-2"><button type="button" data-close-edit class="rounded-lg bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">Cancel</button><button type="button" data-save-edit class="rounded-lg bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/25">Save changes</button></div>
      </div>`;
      document.body.appendChild(modal);
      activeModal = modal;
      const displayInput = modal.querySelector('[data-edit-display]');
      const usernameInput = modal.querySelector('[data-edit-username]');
      const status = modal.querySelector('[data-edit-status]');
      displayInput.value = displayName; usernameInput.value = username;
      modal.querySelectorAll('[data-close-edit]').forEach(button => button.addEventListener('click', closeModal));
      modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
      modal.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
      modal.querySelector('[data-save-edit]').addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true; status.textContent = 'Saving...';
        try {
          const response = await fetch(`/api/teacher/students/${studentId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({displayName:displayInput.value, username:usernameInput.value}) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Unable to save student.');
          status.textContent = 'Saved'; status.className = 'mt-3 min-h-5 text-xs text-emerald-300';
          const nameLabel = document.querySelector(`[data-student-name="${studentId}"]`);
          const usernameLabel = document.querySelector(`[data-student-username="${studentId}"]`);
          if (nameLabel?.firstChild) nameLabel.firstChild.nodeValue = data.student.display_name;
          if (usernameLabel) usernameLabel.textContent = data.student.username;
          setTimeout(closeModal, 450);
        } catch (error) { status.textContent = error.message; status.className = 'mt-3 min-h-5 text-xs text-rose-300'; button.disabled = false; }
      });
      displayInput.focus();
    }

    function enhanceRows() {
      tbody.querySelectorAll('tr').forEach(row => {
        if (row.dataset.identityEditorInstalled === 'true' || row.children.length < 4) return;
        const resetButton = row.querySelector('[onclick^="resetPin("]');
        const match = resetButton?.getAttribute('onclick')?.match(/^resetPin\((\d+)/);
        if (!match) return;
        const identityCell = row.children[0];
        const name = identityCell.querySelector('.text-sm');
        const username = identityCell.querySelector('.text-\\[10px\\]');
        if (!name || !username) return;
        name.dataset.studentName = match[1]; username.dataset.studentUsername = match[1];
        const editButton = document.createElement('button');
        editButton.type = 'button'; editButton.className = 'ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-cyan-200'; editButton.title = 'Edit student name and username';
        editButton.innerHTML = '<iconify-icon icon="lucide:pen-line"></iconify-icon><span class="sr-only">Edit student name and username</span>';
        editButton.addEventListener('click', () => openModal(match[1], name.textContent.trim(), username.textContent.trim()));
        name.appendChild(editButton); row.dataset.identityEditorInstalled = 'true';
      });
    }
    new MutationObserver(enhanceRows).observe(tbody, { childList:true, subtree:true }); enhanceRows();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize); else initialize();
})();
