const sharp = require('sharp');
const pool = require('../db/pool');
const storage = require('./storage');
const { UploadError, formatBytes } = require('./util');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff'];

// Compress any uploaded photo to WebP: a full-size copy (max 1920px) and a thumbnail.
async function compressImage(buffer, { maxWidth = 1920, thumbWidth = 480, quality = 80 } = {}) {
  const base = sharp(buffer, { failOn: 'none' }).rotate(); // honour EXIF orientation
  const full = await base
    .clone()
    .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: thumbWidth, height: thumbWidth, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer();
  return { data: full.data, thumb, width: full.info.width, height: full.info.height };
}

async function saveImage(file, opts) {
  if (!IMAGE_TYPES.includes(file.mimetype)) {
    throw new UploadError(`"${file.originalname}" is not a supported image (use JPG, PNG, WebP, GIF or AVIF).`);
  }
  let img;
  try {
    img = await compressImage(file.buffer, opts);
  } catch {
    throw new UploadError(`"${file.originalname}" could not be read as an image.`);
  }
  const total = img.data.length + img.thumb.length;
  await storage.assertRoom(total);
  const { rows } = await pool.query(
    `INSERT INTO media (kind, mime, data, thumb, width, height, bytes, original_bytes, original_name)
     VALUES ('image', 'image/webp', $1, $2, $3, $4, $5, $6, $7) RETURNING id, bytes, original_bytes`,
    [img.data, img.thumb, img.width, img.height, total, file.size, file.originalname]
  );
  storage.invalidate();
  return rows[0];
}

async function savePdf(file) {
  if (file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    throw new UploadError(`"${file.originalname}" is not a PDF file.`);
  }
  await storage.assertRoom(file.size);
  const { rows } = await pool.query(
    `INSERT INTO media (kind, mime, data, bytes, original_bytes, original_name)
     VALUES ('pdf', 'application/pdf', $1, $2, $2, $3) RETURNING id, bytes, original_bytes`,
    [file.buffer, file.size, file.originalname]
  );
  storage.invalidate();
  return rows[0];
}

async function deleteMedia(id) {
  if (!id) return;
  await pool.query('DELETE FROM media WHERE id = $1', [id]);
  storage.invalidate();
}

// Human-readable summary shown to the admin after an upload.
function savingsMessage(saved) {
  const list = Array.isArray(saved) ? saved : [saved];
  const orig = list.reduce((a, m) => a + (m.original_bytes || 0), 0);
  const stored = list.reduce((a, m) => a + m.bytes, 0);
  const pct = orig > 0 ? Math.max(0, Math.round((1 - stored / orig) * 100)) : 0;
  const what = list.length > 1 ? `${list.length} files` : 'File';
  return `${what} uploaded. Original ${formatBytes(orig)} → stored ${formatBytes(stored)}${pct > 0 ? ` (saved ${pct}%)` : ''}.`;
}

module.exports = { saveImage, savePdf, deleteMedia, savingsMessage, IMAGE_TYPES };
