const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

const ACTIVE_NOTICES = `visible AND published_at <= now() AND (expires_at IS NULL OR expires_at > now())`;

// Latest notifications for the header bell, cached briefly.
let bellCache = null;
let bellAt = 0;
async function bellNotifications() {
  if (bellCache && Date.now() - bellAt < 30000) return bellCache;
  const { rows } = await pool.query(
    `SELECT id, title, body, media_id, link_url, link_label, pinned, published_at
     FROM notifications WHERE ${ACTIVE_NOTICES}
     ORDER BY pinned DESC, published_at DESC LIMIT 8`
  );
  bellCache = rows;
  bellAt = Date.now();
  return rows;
}
router.invalidateBell = () => {
  bellCache = null;
};

router.use(async (req, res, next) => {
  if (req.path.startsWith('/media/')) return next();
  try {
    res.locals.bell = await bellNotifications();
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res) => {
  const [videos, slides, notices, principal, gallery] = await Promise.all([
    pool.query('SELECT * FROM hero_videos WHERE visible ORDER BY sort, id'),
    pool.query('SELECT * FROM slides WHERE visible AND media_id IS NOT NULL ORDER BY sort, id'),
    pool.query(`SELECT * FROM notifications WHERE ${ACTIVE_NOTICES} ORDER BY pinned DESC, published_at DESC LIMIT 4`),
    pool.query('SELECT * FROM principals WHERE is_current ORDER BY sort, id LIMIT 1'),
    pool.query('SELECT * FROM gallery_images WHERE visible AND media_id IS NOT NULL ORDER BY created_at DESC LIMIT 8'),
  ]);
  const background = videos.rows.find((v) => v.is_background) || null;
  res.render('pages/home', {
    title: null,
    background,
    videos: videos.rows.filter((v) => !v.is_background),
    slides: slides.rows,
    notices: notices.rows,
    principal: principal.rows[0] || null,
    gallery: gallery.rows,
  });
});

router.get('/gallery', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, media_id, caption, album FROM gallery_images WHERE visible AND media_id IS NOT NULL ORDER BY sort, created_at DESC'
  );
  const albums = [...new Set(rows.map((r) => r.album))];
  res.render('pages/gallery', { title: 'Gallery', images: rows, albums });
});

router.get('/notifications', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE ${ACTIVE_NOTICES} ORDER BY pinned DESC, published_at DESC LIMIT 100`
  );
  res.render('pages/notifications', { title: 'Notifications', notices: rows });
});

router.get('/academic-calendar', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, title, academic_year, media_id, is_current FROM calendars WHERE media_id IS NOT NULL ORDER BY is_current DESC, created_at DESC'
  );
  const selected = rows.find((c) => String(c.id) === String(req.query.id)) || rows[0] || null;
  res.render('pages/calendar', { title: 'Academic Calendar', calendars: rows, selected });
});

router.get('/principals', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM principals ORDER BY is_current DESC, sort, id');
  res.render('pages/principals', {
    title: "Principal's Corner",
    current: rows.filter((p) => p.is_current),
    past: rows.filter((p) => !p.is_current),
  });
});

router.get('/teachers', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM staff WHERE visible ORDER BY sort, name');
  const departments = [...new Set(rows.map((r) => r.department))];
  res.render('pages/teachers', { title: "Teachers' Corner", staff: rows, departments });
});

router.get('/contact', (req, res) => {
  res.render('pages/contact', { title: 'Contact Us', contact: res.locals.site.settings.contact || {} });
});

// Uploaded files are stored in Postgres; ids are immutable so cache forever.
router.get('/media/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return next();
  if (req.get('if-none-match') === `"${id}${req.query.size || ''}"`) return res.status(304).end();
  const wantThumb = req.query.size === 'thumb';
  const { rows } = await pool.query(
    `SELECT mime, kind, original_name, ${wantThumb ? 'coalesce(thumb, data)' : 'data'} AS body FROM media WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return next();
  const m = rows[0];
  res.set({
    'Content-Type': m.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${id}${req.query.size || ''}"`,
  });
  if (m.kind === 'pdf') {
    const name = (m.original_name || 'document.pdf').replace(/[^\w.\- ]/g, '_');
    res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${name}"`);
  }
  res.send(m.body);
});

module.exports = router;
