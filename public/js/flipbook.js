import * as pdfjsLib from '/vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

const stage = document.querySelector('[data-book]');
const bookEl = document.getElementById('flipbook');
const loading = stage.querySelector('[data-book-loading]');
const progress = stage.querySelector('[data-book-progress]');
const controls = stage.querySelector('[data-book-controls]');
const pageLabel = stage.querySelector('[data-book-page]');
const soundBtn = stage.querySelector('[data-book-sound]');

// ---------- Page-turn sound (synthesised paper swish, no audio file needed) ----------
let audioCtx = null;
let soundOn = true;
try {
  soundOn = localStorage.getItem('sfs.book.sound') !== 'off';
} catch { /* storage unavailable */ }

function setSoundUi() {
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.setAttribute('aria-label', soundOn ? 'Mute page-turn sound' : 'Turn on page-turn sound');
  soundBtn.innerHTML = soundOn
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/></svg>';
}

function playFlipSound() {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const duration = 0.42;
    const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * duration), audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise reads as paper rather than hiss.
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 3.2;
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const band = audioCtx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(900, now);
    band.frequency.exponentialRampToValueAtTime(3200, now + duration * 0.55);
    band.frequency.exponentialRampToValueAtTime(1400, now + duration);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.55, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // A soft "thump" as the page lands.
    const thump = audioCtx.createOscillator();
    const thumpGain = audioCtx.createGain();
    thump.frequency.setValueAtTime(140, now + 0.3);
    thump.frequency.exponentialRampToValueAtTime(60, now + 0.42);
    thumpGain.gain.setValueAtTime(0.0001, now + 0.3);
    thumpGain.gain.exponentialRampToValueAtTime(0.12, now + 0.32);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    src.connect(band).connect(gain).connect(audioCtx.destination);
    thump.connect(thumpGain).connect(audioCtx.destination);
    src.start(now);
    thump.start(now + 0.3);
    thump.stop(now + 0.46);
  } catch { /* audio unsupported */ }
}

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  try {
    localStorage.setItem('sfs.book.sound', soundOn ? 'on' : 'off');
  } catch { /* storage unavailable */ }
  setSoundUi();
  if (soundOn) playFlipSound();
});
setSoundUi();

// ---------- Render PDF pages to images ----------
async function renderPages(url) {
  const pdf = await pdfjsLib.getDocument({ url, isEvalSupported: false }).promise;
  const pages = [];
  const targetWidth = Math.min(1400, Math.round(Math.min(window.innerWidth, 700) * (window.devicePixelRatio || 1) * 1.1));
  let ratio = 1.414;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    if (i === 1) ratio = base.height / base.width;
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(canvas.toDataURL('image/jpeg', 0.86));
    page.cleanup();
    progress.style.transform = `scaleX(${i / pdf.numPages})`;
  }
  return { pages, ratio };
}

function buildBook({ pages, ratio }) {
  bookEl.innerHTML = '';
  pages.forEach((src, i) => {
    const div = document.createElement('div');
    div.className = 'page';
    // Cover and back cover are stiff like a real book.
    if (i === 0 || i === pages.length - 1) div.dataset.density = 'hard';
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Page ${i + 1}`;
    div.appendChild(img);
    bookEl.appendChild(div);
  });

  bookEl.hidden = false;
  loading.hidden = true;
  controls.hidden = false;

  // Keep a whole spread visible on screen: limit page height to the viewport.
  const maxHeight = Math.max(380, window.innerHeight - 190);
  const maxWidth = Math.round(maxHeight / ratio);
  const width = Math.min(550, maxWidth);
  const flip = new window.St.PageFlip(bookEl, {
    width,
    height: Math.round(width * ratio),
    size: 'stretch',
    minWidth: 240,
    maxWidth,
    minHeight: Math.round(240 * ratio),
    maxHeight,
    showCover: true,
    usePortrait: true,
    maxShadowOpacity: 0.55,
    flippingTime: 900,
    mobileScrollSupport: false,
    swipeDistance: 20,
  });
  flip.loadFromHTML(bookEl.querySelectorAll('.page'));

  const total = pages.length;
  const updateLabel = () => {
    const i = flip.getCurrentPageIndex();
    const portrait = flip.getOrientation() === 'portrait';
    const right = i + 1 < total && !portrait && i > 0 ? `–${i + 2}` : '';
    pageLabel.textContent = `Page ${i + 1}${right} of ${total}`;
  };

  let lastSound = 0;
  flip.on('changeState', (e) => {
    if ((e.data === 'flipping' || e.data === 'user_fold') && Date.now() - lastSound > 450) {
      lastSound = Date.now();
      playFlipSound();
    }
  });
  flip.on('flip', updateLabel);
  flip.on('changeOrientation', updateLabel);
  updateLabel();

  stage.querySelector('[data-book-prev]').addEventListener('click', () => flip.flipPrev());
  stage.querySelector('[data-book-next]').addEventListener('click', () => flip.flipNext());
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') flip.flipNext();
    if (e.key === 'ArrowLeft') flip.flipPrev();
  });

  const fsBtn = stage.querySelector('[data-book-fullscreen]');
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  });
}

renderPages(stage.dataset.pdf)
  .then(buildBook)
  .catch((err) => {
    console.error(err);
    loading.innerHTML = '<p>Sorry, the calendar could not be displayed. Please use the link below to open the PDF.</p>';
  });
