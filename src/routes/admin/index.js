const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const pool = require('../../db/pool');
const storage = require('../../lib/storage');
const media = require('../../lib/media');
const settings = require('../../lib/settings');
const publicRouter = require('../public');
const { UploadError, safeUrl, bool, str, int } = require('../../lib/util');
const { requireAdmin, csrfProtection } = require('../../middleware/auth');
const crud = require('./crud');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 30 },
});

const flash = (req, type, message) => {
  req.session.flash = { type, message };
};

// ---------- Auth ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin sign in', error: null });
});

router.post('/login', loginLimiter, csrfProtection, async (req, res, next) => {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE username = $1', [str(req.body.username).toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).render('admin/login', { title: 'Admin sign in', error: 'Incorrect username or password.' });
  }
  const returnTo = req.session.returnTo || '/admin';
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.adminId = user.id;
    req.session.adminName = user.username;
    res.redirect(returnTo.startsWith('/admin') ? returnTo : '/admin');
  });
});

router.post('/logout', csrfProtection, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---------- Everything below needs a signed-in admin ----------
router.use(requireAdmin);
router.use((req, res, next) => (req.method === 'POST' ? upload.any()(req, res, next) : next()));
router.use(csrfProtection);
router.use(async (req, res, next) => {
  res.locals.adminName = req.session.adminName;
  res.locals.storage = await storage.getUsage();
  res.locals.storagePcts = { warn: storage.WARN_PCT, critical: storage.CRITICAL_PCT, block: storage.BLOCK_PCT };
  next();
});
// Any admin change can affect cached site data.
router.use((req, res, next) => {
  if (req.method === 'POST') {
    settings.invalidate();
    publicRouter.invalidateBell();
  }
  next();
});

// ---------- Dashboard & storage ----------
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*) FROM gallery_images)::int AS gallery,
    (SELECT count(*) FROM notifications WHERE visible)::int AS notifications,
    (SELECT count(*) FROM staff WHERE visible)::int AS staff,
    (SELECT count(*) FROM slides)::int AS slides,
    (SELECT count(*) FROM hero_videos)::int AS videos,
    (SELECT count(*) FROM calendars)::int AS calendars,
    (SELECT count(*) FROM principals)::int AS principals`);
  res.render('admin/dashboard', { title: 'Dashboard', counts: rows[0], storage: await storage.getUsage({ fresh: true }) });
});

router.get('/storage', async (req, res) => {
  const usage = await storage.getUsage({ fresh: true });
  res.render('admin/storage', { title: 'Storage', usage, breakdown: await storage.getBreakdown(), limitMb: Math.round(usage.limitBytes / 1048576) });
});

router.post('/storage/limit', async (req, res) => {
  const mb = int(req.body.limit_mb, 0);
  if (mb < 100) {
    flash(req, 'error', 'Storage limit must be at least 100 MB.');
  } else {
    await settings.setSetting('storage', { limit_mb: mb });
    storage.invalidate();
    flash(req, 'success', `Storage limit set to ${mb} MB.`);
  }
  res.redirect('/admin/storage');
});

router.post('/storage/cleanup', async (req, res) => {
  const n = await storage.deleteOrphans();
  flash(req, 'success', n ? `Removed ${n} unused file${n === 1 ? '' : 's'}.` : 'No unused files found.');
  res.redirect('/admin/storage');
});

// ---------- Site settings ----------
router.get('/settings', async (req, res) => {
  res.render('admin/settings', { title: 'Site settings', s: res.locals.site.settings });
});

router.post('/settings', async (req, res) => {
  const b = req.body;
  const schoolName = str(b.school_name);
  if (!schoolName) {
    flash(req, 'error', 'School name is required.');
    return res.redirect('/admin/settings');
  }
  await settings.setSetting('school_name', schoolName);
  await settings.setSetting('tagline', str(b.tagline));
  await settings.setSetting('hero', { heading: str(b.hero_heading), subheading: str(b.hero_subheading) });
  await settings.setSetting('principal_message', { heading: str(b.pm_heading), body: str(b.pm_body) });
  flash(req, 'success', 'Site settings saved.');
  res.redirect('/admin/settings');
});

router.get('/hiring', (req, res) => {
  res.render('admin/hiring', { title: 'Hiring banner', h: res.locals.site.settings.hiring || {} });
});

router.post('/hiring', async (req, res) => {
  const link = str(req.body.link_url);
  if (link && !safeUrl(link)) {
    flash(req, 'error', 'The link is not valid.');
    return res.redirect('/admin/hiring');
  }
  await settings.setSetting('hiring', {
    visible: bool(req.body.visible),
    text: str(req.body.text),
    link_url: safeUrl(link) || '',
    link_label: str(req.body.link_label) || 'Learn more',
  });
  flash(req, 'success', 'Hiring banner saved.');
  res.redirect('/admin/hiring');
});

router.get('/contact', (req, res) => {
  res.render('admin/contact', { title: 'Contact page', c: res.locals.site.settings.contact || {} });
});

router.post('/contact', async (req, res) => {
  const b = req.body;
  // Accept either a bare Google Maps embed URL or the full <iframe> snippet.
  const mapSrc = (str(b.map_embed).match(/src="([^"]+)"/) || [])[1] || str(b.map_embed);
  const mapOk = !mapSrc || /^https:\/\/(www\.)?google\.com\/maps\/embed/.test(mapSrc) || /^https:\/\/maps\.google\.com\//.test(mapSrc);
  await settings.setSetting('contact', {
    address: str(b.address),
    phones: str(b.phones),
    emails: str(b.emails),
    hours: str(b.hours),
    map_embed: mapOk ? mapSrc : '',
    facebook: safeUrl(b.facebook) || '',
    instagram: safeUrl(b.instagram) || '',
    youtube: safeUrl(b.youtube) || '',
  });
  flash(req, mapOk ? 'success' : 'error', mapOk ? 'Contact details saved.' : 'Saved, but the map link was ignored — paste the Google Maps "Embed a map" code.');
  res.redirect('/admin/contact');
});

router.get('/links', async (req, res) => {
  res.render('admin/links', { title: 'Buttons & links', links: res.locals.site.quickLinkList });
});

router.post('/links', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM quick_links');
  for (const { id } of rows) {
    const url = safeUrl(req.body[`url_${id}`]);
    if (!url) {
      flash(req, 'error', 'Every button needs a valid link (https://… or /page).');
      return res.redirect('/admin/links');
    }
    await pool.query('UPDATE quick_links SET label = $1, url = $2, visible = $3 WHERE id = $4', [
      str(req.body[`label_${id}`]) || 'Link',
      url,
      bool(req.body[`visible_${id}`]),
      id,
    ]);
  }
  flash(req, 'success', 'Buttons saved.');
  res.redirect('/admin/links');
});

router.get('/password', (req, res) => res.render('admin/password', { title: 'Change password' }));

router.post('/password', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE id = $1', [req.session.adminId]);
  const ok = rows[0] && (await bcrypt.compare(String(req.body.current || ''), rows[0].password_hash));
  const next = String(req.body.password || '');
  if (!ok) flash(req, 'error', 'Current password is incorrect.');
  else if (next.length < 8) flash(req, 'error', 'New password must be at least 8 characters.');
  else if (next !== req.body.confirm) flash(req, 'error', 'New passwords do not match.');
  else {
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 12), req.session.adminId]);
    flash(req, 'success', 'Password changed.');
  }
  res.redirect('/admin/password');
});

// ---------- Content modules ----------
router.post('/gallery/bulk', async (req, res) => {
  const files = (req.files || []).filter((f) => f.fieldname === 'photos' && f.size > 0);
  const album = str(req.body.album) || 'General';
  if (!files.length) {
    flash(req, 'error', 'Choose at least one photo to upload.');
    return res.redirect('/admin/gallery');
  }
  const saved = [];
  const errors = [];
  for (const file of files) {
    try {
      const m = await media.saveImage(file);
      await pool.query('INSERT INTO gallery_images (media_id, album, caption) VALUES ($1, $2, $3)', [m.id, album, '']);
      saved.push(m);
    } catch (err) {
      if (!(err instanceof UploadError)) throw err;
      errors.push(err.message);
      if (err.message.startsWith('Not enough storage')) break;
    }
  }
  const msg = saved.length ? media.savingsMessage(saved) : '';
  flash(req, errors.length ? 'error' : 'success', [msg, ...errors].filter(Boolean).join(' '));
  res.redirect('/admin/gallery');
});

const modules = [
  crud({
    path: 'videos', table: 'hero_videos', title: 'YouTube videos', singular: 'Video', order: 'sort, id',
    help: 'Mark one video as “background” to play silently behind the home page banner. Others appear as video cards that open in a player.',
    list: { thumb: 'youtube', primary: 'title', secondary: 'caption', badges: ['is_background'] },
    fields: [
      { name: 'youtube_id', label: 'YouTube link', type: 'youtube', required: true, help: 'Paste any YouTube link, e.g. https://youtu.be/abc123xyz00' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'caption', label: 'Caption', type: 'textarea' },
      { name: 'is_background', label: 'Use as home page background video', type: 'checkbox' },
      { name: 'visible', label: 'Visible on website', type: 'checkbox', default: true },
      { name: 'sort', label: 'Display order', type: 'number', default: 0 },
    ],
    afterSave: async (row) => {
      if (row?.is_background) await pool.query('UPDATE hero_videos SET is_background = false WHERE id <> $1', [row.id]);
    },
  }),
  crud({
    path: 'slides', table: 'slides', title: 'Photo slideshow', singular: 'Slide', order: 'sort, id',
    help: 'Slides rotate in the home page photo carousel. Landscape photos (16:9) look best.',
    list: { thumb: 'image', primary: 'title', secondary: 'caption' },
    fields: [
      { name: 'image', label: 'Photo', type: 'image', required: true },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'caption', label: 'Caption', type: 'textarea' },
      { name: 'link_url', label: 'Link (optional)', type: 'url' },
      { name: 'visible', label: 'Visible on website', type: 'checkbox', default: true },
      { name: 'sort', label: 'Display order', type: 'number', default: 0 },
    ],
  }),
  crud({
    path: 'gallery', table: 'gallery_images', title: 'Gallery', singular: 'Photo', order: 'sort, created_at DESC',
    help: 'Photos are automatically resized and compressed to WebP when uploaded.',
    bulkUpload: true,
    list: { thumb: 'image', primary: 'caption', secondary: 'album' },
    fields: [
      { name: 'image', label: 'Photo', type: 'image', required: true },
      { name: 'caption', label: 'Caption', type: 'text' },
      { name: 'album', label: 'Album', type: 'text', default: 'General' },
      { name: 'visible', label: 'Visible on website', type: 'checkbox', default: true },
      { name: 'sort', label: 'Display order', type: 'number', default: 0 },
    ],
  }),
  crud({
    path: 'notifications', table: 'notifications', title: 'Notifications', singular: 'Notification', order: 'pinned DESC, published_at DESC',
    help: 'Pinned notifications stay at the top. Set an expiry date to hide a notice automatically.',
    list: { thumb: 'image', primary: 'title', secondary: 'body', badges: ['pinned'], date: 'published_at' },
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'body', label: 'Message', type: 'textarea' },
      { name: 'image', label: 'Image (optional)', type: 'image' },
      { name: 'link_url', label: 'Link (optional)', type: 'url' },
      { name: 'link_label', label: 'Link text', type: 'text', default: 'Read more' },
      { name: 'pinned', label: 'Pin to top', type: 'checkbox' },
      { name: 'visible', label: 'Visible on website', type: 'checkbox', default: true },
      { name: 'published_at', label: 'Publish date', type: 'datetime', required: true },
      { name: 'expires_at', label: 'Expires (optional)', type: 'datetime' },
    ],
  }),
  crud({
    path: 'calendars', table: 'calendars', title: 'Academic calendars', singular: 'Calendar', order: 'is_current DESC, created_at DESC',
    help: 'Upload the academic calendar as a PDF. Visitors read it as a page-turning book. The “current” calendar opens first.',
    toggleField: 'is_current',
    list: { thumb: 'pdf', primary: 'title', secondary: 'academic_year', badges: ['is_current'] },
    fields: [
      { name: 'pdf', label: 'Calendar PDF', type: 'pdf', required: true },
      { name: 'title', label: 'Title', type: 'text', required: true, default: 'Academic Calendar' },
      { name: 'academic_year', label: 'Academic year', type: 'text', help: 'e.g. 2026–27' },
      { name: 'is_current', label: 'Current calendar (shown first)', type: 'checkbox', default: true },
    ],
    afterSave: async (row) => {
      if (row?.is_current) await pool.query('UPDATE calendars SET is_current = false WHERE id <> $1', [row.id]);
    },
  }),
  crud({
    path: 'principals', table: 'principals', title: 'Leadership', singular: 'Profile', order: 'is_current DESC, sort, id',
    help: 'Manager, principal and vice principals. The current manager’s message appears on the home page, and current profiles marked “show in home page leadership section” appear at the end of the home page in display order (lowest first). Square photos work best.',
    list: {
      thumb: 'image', primary: 'name', secondary: 'designation',
      label: { field: 'role', values: { manager: 'Manager', principal: 'Principal', vice_principal: 'Vice Principal' } },
      badges: ['is_current', 'show_on_home'], showSort: true,
    },
    fields: [
      { name: 'image', label: 'Photo', type: 'image', imageOpts: { maxWidth: 900, thumbWidth: 360 } },
      {
        name: 'role', label: 'Role', type: 'select',
        options: [
          { value: 'principal', label: 'Principal' },
          { value: 'vice_principal', label: 'Vice Principal' },
          { value: 'manager', label: 'Manager' },
        ],
      },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'designation', label: 'Designation', type: 'text', default: 'Principal', help: 'e.g. Principal, Vice Principal (Higher Secondary), School Manager' },
      { name: 'tenure_from', label: 'Served from (year)', type: 'text' },
      { name: 'tenure_to', label: 'Served until (blank = present)', type: 'text' },
      { name: 'message', label: 'Message for the home page', type: 'textarea', help: 'Shown in the home page “From the Manager’s desk” / principal message sections.' },
      { name: 'bio', label: 'Biography', type: 'textarea' },
      { name: 'is_current', label: 'Currently serving', type: 'checkbox', default: true },
      { name: 'visible', label: 'Show on website', type: 'checkbox', default: true },
      { name: 'show_on_home', label: 'Show in home page leadership section', type: 'checkbox', default: true },
      { name: 'sort', label: 'Display order', type: 'number', default: 0, help: 'Lower numbers appear first.' },
    ],
  }),
  crud({
    path: 'staff', table: 'staff', title: "Teachers' Corner", singular: 'Staff member', order: 'sort, name',
    help: 'Staff are grouped by department on the website.',
    list: { thumb: 'image', primary: 'name', secondary: 'designation', tertiary: 'department' },
    fields: [
      { name: 'image', label: 'Photo', type: 'image', imageOpts: { maxWidth: 800, thumbWidth: 320 } },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'designation', label: 'Designation', type: 'text', help: 'e.g. HSST English' },
      { name: 'department', label: 'Department', type: 'text', default: 'General' },
      { name: 'qualification', label: 'Qualification', type: 'text' },
      { name: 'visible', label: 'Visible on website', type: 'checkbox', default: true },
      { name: 'sort', label: 'Display order', type: 'number', default: 0 },
    ],
  }),
];

for (const m of modules) router.use(`/${m.cfg.path}`, m);

module.exports = router;
