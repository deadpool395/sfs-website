require('dotenv').config();
// Admin-entered dates/times are Indian local time.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const compression = require('compression');

const pool = require('./src/db/pool');
const migrate = require('./src/db/migrate');
const { loadSite } = require('./src/lib/settings');
const { formatBytes } = require('./src/lib/util');
const { csrfLocals } = require('./src/middleware/auth');
const viewHelpers = require('./src/lib/view-helpers');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://i.ytimg.com', 'https://img.youtube.com'],
        frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://www.google.com', 'https://maps.google.com'],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // YouTube embeds refuse to play (error 153) without a referrer.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());

// Static assets, plus the few browser libraries we serve straight from node_modules.
const nm = (p) => path.join(__dirname, 'node_modules', p);
const staticOpts = { maxAge: isProd ? '7d' : 0 };
app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/vendor/swiper', express.static(nm('swiper'), staticOpts));
app.use('/vendor/page-flip', express.static(nm('page-flip/dist/js'), staticOpts));
app.use('/vendor/pdfjs', express.static(nm('pdfjs-dist/build'), staticOpts));

app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use(
  session({
    store: new PgSession({ pool, schemaName: 'website', tableName: 'session' }),
    name: 'sfs.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 1000 * 60 * 60 * 8 },
  })
);

// express-session writes response headers before its async store save finishes, so a
// client can follow a redirect before the session (login, flash message) is persisted.
// Save explicitly first.
app.use((req, res, next) => {
  const redirect = res.redirect.bind(res);
  res.redirect = (...args) => {
    if (!req.session) return redirect(...args);
    req.session.save((err) => (err ? next(err) : redirect(...args)));
  };
  next();
});

// Values every template can use.
app.use(async (req, res, next) => {
  try {
    const site = await loadSite();
    res.locals.site = site;
    res.locals.schoolName = site.settings.school_name || 'St. Francis School';
    res.locals.currentPath = req.path;
    res.locals.formatBytes = formatBytes;
    Object.assign(res.locals, viewHelpers);
    res.locals.flash = req.session?.flash || null;
    if (req.session?.flash) delete req.session.flash;
    next();
  } catch (err) {
    next(err);
  }
});
app.use(csrfLocals);

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/public'));

app.use((req, res) => res.status(404).render('pages/error', { title: 'Page not found', code: 404, message: "The page you're looking for doesn't exist or has moved." }));

app.use((err, req, res, _next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
    return res.status(403).render('pages/error', { title: 'Session expired', code: 403, message: 'Your form session expired. Please go back, refresh the page and try again.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).render('pages/error', { title: 'File too large', code: 413, message: 'That file is too large. Images may be up to 25 MB and PDFs up to 40 MB.' });
  }
  console.error(err);
  res.status(500).render('pages/error', { title: 'Something went wrong', code: 500, message: 'An unexpected error occurred. Please try again shortly.' });
});

const port = Number(process.env.PORT) || 3000;
migrate()
  .then(() => app.listen(port, () => console.log(`Website running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
