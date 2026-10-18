(() => {
  const grid = document.querySelector('[data-gallery]');
  if (!grid) return;
  const items = [...grid.querySelectorAll('.masonry-item')];

  // ---------- Album filter ----------
  const chips = document.querySelectorAll('[data-filter]');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      const f = chip.dataset.filter;
      items.forEach((it) => (it.hidden = f !== '*' && it.dataset.album !== f));
    });
  });

  // ---------- Lightbox ----------
  const modal = document.getElementById('lightbox');
  const img = modal.querySelector('.lightbox-img');
  const caption = modal.querySelector('.lightbox-caption');
  let index = 0;

  const visible = () => items.filter((it) => !it.hidden);
  function show(i) {
    const list = visible();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    const it = list[index];
    img.src = it.dataset.full;
    img.alt = it.dataset.caption || 'School photo';
    caption.textContent = it.dataset.caption || '';
  }

  items.forEach((it) =>
    it.addEventListener('click', () => {
      show(visible().indexOf(it));
      window.SFS.openModal(modal);
    })
  );
  const close = () => window.SFS.closeModal(modal);
  modal.querySelector('[data-modal-close]').addEventListener('click', close);
  modal.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
  modal.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // Swipe on touch screens
  let startX = null;
  modal.addEventListener('touchstart', (e) => (startX = e.touches[0].clientX), { passive: true });
  modal.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
})();
