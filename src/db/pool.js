require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Render internal URLs (no ".render.com" host) don't need SSL; external ones do.
const isExternal = /\.render\.com/.test(process.env.DATABASE_URL);

// Everything the website owns lives in the "website" schema so the sfsapp
// tables in "public" are never touched.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isExternal ? { rejectUnauthorized: false } : false,
  options: '-c search_path=website',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('Postgres pool error:', err.message));

module.exports = pool;
