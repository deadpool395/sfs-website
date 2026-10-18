const pool = require('../db/pool');
const { UploadError, formatBytes } = require('./util');

// Owner tables that reference website.media, used for the per-category breakdown.
const CATEGORIES = [
  { table: 'gallery_images', label: 'Gallery photos' },
  { table: 'slides', label: 'Slideshow' },
  { table: 'notifications', label: 'Notifications' },
  { table: 'calendars', label: 'Academic calendars (PDF)' },
  { table: 'principals', label: 'Leadership' },
  { table: 'staff', label: 'Teachers & staff' },
];

const WARN_PCT = 70;
const CRITICAL_PCT = 90;
const BLOCK_PCT = 95;

const unreferenced = CATEGORIES.map(
  (c) => `NOT EXISTS (SELECT 1 FROM ${c.table} t WHERE t.media_id = m.id)`
).join(' AND ');

let cache = null;
let cachedAt = 0;
const TTL_MS = 60 * 1000;

async function getLimitBytes() {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'storage'");
  const mb = Number(rows[0]?.value?.limit_mb) || Number(process.env.DB_STORAGE_LIMIT_MB) || 1024;
  return mb * 1024 * 1024;
}

async function getUsage({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;

  const [db, site, limitBytes] = await Promise.all([
    pool.query('SELECT pg_database_size(current_database())::bigint AS bytes'),
    pool.query(`SELECT coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'website' AND c.relkind IN ('r', 'm')`),
    getLimitBytes(),
  ]);

  // The database is shared with sfsapp, so "used" is the whole database size.
  const usedBytes = Number(db.rows[0].bytes);
  const websiteBytes = Number(site.rows[0].bytes);
  const otherBytes = Math.max(0, usedBytes - websiteBytes);
  const freeBytes = Math.max(0, limitBytes - usedBytes);
  const pct = Math.min(100, (usedBytes / limitBytes) * 100);
  const level = pct >= CRITICAL_PCT ? 'critical' : pct >= WARN_PCT ? 'warning' : 'ok';

  cache = { usedBytes, websiteBytes, otherBytes, freeBytes, limitBytes, pct, level };
  cachedAt = Date.now();
  return cache;
}

async function getBreakdown() {
  const categories = await Promise.all(
    CATEGORIES.map(async (c) => {
      const { rows } = await pool.query(
        `SELECT count(m.id)::int AS files, coalesce(sum(m.bytes), 0)::bigint AS bytes,
                coalesce(sum(m.original_bytes), 0)::bigint AS original
         FROM ${c.table} t JOIN media m ON m.id = t.media_id`
      );
      return { ...c, files: rows[0].files, bytes: Number(rows[0].bytes), original: Number(rows[0].original) };
    })
  );
  const [orphans, largest] = await Promise.all([
    pool.query(`SELECT count(*)::int AS files, coalesce(sum(bytes), 0)::bigint AS bytes FROM media m WHERE ${unreferenced}`),
    pool.query(
      `SELECT m.id, m.kind, m.bytes, m.original_bytes, m.original_name, m.created_at,
         CASE ${CATEGORIES.map((c) => `WHEN EXISTS (SELECT 1 FROM ${c.table} t WHERE t.media_id = m.id) THEN '${c.label}'`).join(' ')}
              ELSE 'Unused' END AS category
       FROM media m ORDER BY m.bytes DESC LIMIT 10`
    ),
  ]);
  return {
    categories,
    orphans: { files: orphans.rows[0].files, bytes: Number(orphans.rows[0].bytes) },
    largest: largest.rows,
  };
}

async function deleteOrphans() {
  const { rowCount } = await pool.query(`DELETE FROM media m WHERE ${unreferenced}`);
  invalidate();
  return rowCount;
}

// Refuse uploads that would push the database past BLOCK_PCT of its limit.
async function assertRoom(incomingBytes) {
  const u = await getUsage({ fresh: true });
  const ceiling = u.limitBytes * (BLOCK_PCT / 100);
  if (u.usedBytes + incomingBytes > ceiling) {
    const free = Math.max(0, ceiling - u.usedBytes);
    throw new UploadError(
      `Not enough storage: ${formatBytes(free)} free, file needs ${formatBytes(incomingBytes)}. ` +
        'Delete old photos or PDFs on the Storage page, or raise the storage limit.'
    );
  }
}

function invalidate() {
  cache = null;
}

module.exports = { getUsage, getBreakdown, deleteOrphans, assertRoom, invalidate, WARN_PCT, CRITICAL_PCT, BLOCK_PCT };
