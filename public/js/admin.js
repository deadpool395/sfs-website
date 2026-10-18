(() => {
  // Mobile sidebar toggle
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-side-nav]');
  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Confirm before destructive actions
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // File pickers: show chosen file names + total size, warn if over free space
  document.querySelectorAll('.dropzone').forEach((zone) => {
    const input = zone.querySelector('input[type=file]');
    const label = zone.querySelector('.picked');
    const free = Number(zone.dataset.free || 0);
    const fmt = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
    input.addEventListener('change', () => {
      const files = [...input.files];
      if (!files.length) {
        label.textContent = '';
        return;
      }
      const total = files.reduce((a, f) => a + f.size, 0);
      label.textContent = files.length === 1 ? `${files[0].name} (${fmt(total)})` : `${files.length} files selected (${fmt(total)} before compression)`;
      // Photos shrink a lot after compression, so only PDFs are checked strictly.
      const isPdf = input.accept.includes('pdf');
      if (free && isPdf && total > free) {
        label.textContent += ' — not enough storage space!';
      }
    });
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, () => zone.classList.add('drag')));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('drag')));
  });

  // Disable submit buttons while uploading so admins don't double-submit
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (e.defaultPrevented) return;
      const btn = form.querySelector('button[type=submit][data-busy]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = btn.dataset.busy;
      }
    });
  });
})();
