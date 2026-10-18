class UploadError extends Error {}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Accepts full YouTube URLs (watch, youtu.be, shorts, embed, live) or a bare 11-char id.
function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Only allow http(s), mailto, tel and site-relative links from admin input.
function safeUrl(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}

const bool = (v) => v === 'on' || v === 'true' || v === '1' || v === true;
const str = (v) => String(v ?? '').trim();
const int = (v, d = 0) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

module.exports = { UploadError, formatBytes, parseYouTubeId, safeUrl, bool, str, int };
