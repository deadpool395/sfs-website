const pool = require('../db/pool');

// Site-wide settings + quick links are read on every page, so keep a short cache
// and clear it whenever the admin saves something.
let cache = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000;

async function loadSite() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const [settings, links] = await Promise.all([
    pool.query('SELECT key, value FROM settings'),
    pool.query('SELECT * FROM quick_links ORDER BY sort, id'),
  ]);
  const s = {};
  for (const row of settings.rows) s[row.key] = row.value;
  const quickLinks = {};
  for (const l of links.rows) quickLinks[l.key] = l;
  cache = { settings: s, quickLinks, quickLinkList: links.rows };
  cachedAt = Date.now();
  return cache;
}

async function getSetting(key) {
  const site = await loadSite();
  return site.settings[key];
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
  invalidate();
}

function invalidate() {
  cache = null;
}

module.exports = { loadSite, getSetting, setSetting, invalidate };
