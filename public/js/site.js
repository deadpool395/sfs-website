(() => {
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch { return null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
    },
  };

  // ---------- Drawers (menu + notifications) ----------
  const scrim = document.querySelector('[data-scrim]');
  let openDrawer = null;
  let lastFocus = null;

  function open(drawer) {
    if (openDrawer) close();
    lastFocus = document.activeElement;
    openDrawer = drawer;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
    document.body.style.overflow = 'hidden';
    drawer.querySelector('[data-close]')?.focus();
  }
  function close() {
    if (!openDrawer) return;
    openDrawer.classList.remove('open');
    openDrawer.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('open');
    document.body.style.overflow = '';
    openDrawer = null;
    lastFocus?.focus();
  }

  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const drawer = document.getElementById(btn.dataset.open);
      if (drawer) open(drawer);
      if (btn.dataset.open === 'bell-drawer') markNotificationsSeen();
    });
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  scrim?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // ---------- Notification bell unread count ----------
  const SEEN_KEY = 'sfs.notices.seen';
  const bellBtn = document.querySelector('[data-open="bell-drawer"]');
  const badge = bellBtn?.querySelector('.bell-count');
  const seen = Number(store.get(SEEN_KEY) || 0);
  const items = [...document.querySelectorAll('#bell-drawer [data-published]')];
  const unread = items.filter((el) => Number(el.dataset.published) > seen);
  unread.forEach((el) => el.classList.add('unread'));
  if (badge && unread.length) {
    badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
    badge.hidden = false;
    bellBtn.setAttribute('aria-label', `Notifications, ${unread.length} new`);
  }
  function markNotificationsSeen() {
    const latest = Number(bellBtn?.dataset.latest || 0);
    if (latest) store.set(SEEN_KEY, String(latest));
    if (badge) badge.hidden = true;
  }

  // ---------- Hiring banner dismiss ----------
  const hiring = document.querySelector('[data-hiring]');
  if (hiring) {
    const key = `sfs.hiring.dismissed.${hiring.dataset.hiring}`;
    if (store.get(key)) hiring.hidden = true;
    hiring.querySelector('[data-dismiss-hiring]')?.addEventListener('click', () => {
      hiring.hidden = true;
      store.set(key, '1');
    });
  }

  // ---------- Reveal on scroll ----------
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  // ---------- Shared modal helpers ----------
  window.SFS = {
    openModal(modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      modal.querySelector('[data-modal-close]')?.focus();
    },
    closeModal(modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    },
  };
})();
