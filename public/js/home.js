(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData;

  // ---------- Muted background video behind the hero ----------
  const heroMedia = document.querySelector('[data-hero-video]');
  if (heroMedia && !reduceMotion && !saveData) {
    const id = heroMedia.dataset.heroVideo;
    const params = new URLSearchParams({
      autoplay: '1', mute: '1', loop: '1', playlist: id, controls: '0',
      playsinline: '1', modestbranding: '1', rel: '0', disablekb: '1', iv_load_policy: '3',
    });
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
    iframe.title = 'Background video';
    iframe.tabIndex = -1;
    iframe.allow = 'autoplay; encrypted-media';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    // Fade in once YouTube's own loading UI has passed.
    iframe.addEventListener('load', () => setTimeout(() => iframe.classList.add('ready'), 1800));
    heroMedia.appendChild(iframe);
  }

  // ---------- Video lightbox ----------
  const modal = document.getElementById('video-modal');
  const frame = modal?.querySelector('.modal-frame');
  document.querySelectorAll('[data-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.video;
      frame.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      iframe.title = btn.dataset.title || 'Video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.appendChild(iframe);
      window.SFS.openModal(modal);
    });
  });
  function closeVideo() {
    window.SFS.closeModal(modal);
    setTimeout(() => (frame.innerHTML = ''), 300);
  }
  modal?.querySelector('[data-modal-close]').addEventListener('click', closeVideo);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeVideo();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) closeVideo();
  });

  // ---------- Photo carousel ----------
  const carousel = document.querySelector('[data-carousel]');
  if (carousel && window.Swiper) {
    // eslint-disable-next-line no-new
    new window.Swiper(carousel, {
      loop: carousel.querySelectorAll('.swiper-slide').length > 1,
      effect: 'fade',
      fadeEffect: { crossFade: true },
      speed: 900,
      autoplay: reduceMotion ? false : { delay: 5500, disableOnInteraction: false, pauseOnMouseEnter: true },
      pagination: { el: carousel.querySelector('.swiper-pagination'), clickable: true },
      navigation: { nextEl: carousel.querySelector('.swiper-button-next'), prevEl: carousel.querySelector('.swiper-button-prev') },
      keyboard: { enabled: true },
      a11y: { enabled: true },
    });
  }
})();
