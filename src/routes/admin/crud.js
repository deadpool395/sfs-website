const express = require('express');
const pool = require('../../db/pool');
const media = require('../../lib/media');
const { UploadError, parseYouTubeId, safeUrl, bool, str, int } = require('../../lib/util');

// Builds list/create/edit/delete/toggle routes for a content table from a field config.
// Field types: text, textarea, url, number, checkbox, select, datetime, youtube, image, pdf.
function crud(cfg) {
  const router = express.Router();
  const base = `/admin/${cfg.path}`;
  const cols = cfg.fields.filter((f) => !['image', 'pdf'].includes(f.type)).map((f) => f.name);
  const fileField = cfg.fields.find((f) => ['image', 'pdf'].includes(f.type));

  const flash = (req, type, message) => {
    req.session.flash = { type, message };
  };

  async function parseBody(req, existing) {
    const values = {};
    for (const f of cfg.fields) {
      const raw = req.body[f.name];
      switch (f.type) {
        case 'checkbox':
          values[f.name] = bool(raw);
          break;
        case 'number':
          values[f.name] = int(raw, f.default ?? 0);
          break;
        case 'url': {
          const v = str(raw);
          const u = safeUrl(v);
          if (v && !u) throw new UploadError(`${f.label}: "${v}" is not a valid link.`);
          values[f.name] = u;
          break;
        }
        case 'youtube': {
          const id = parseYouTubeId(raw);
          if (!id) throw new UploadError('Please paste a valid YouTube link or video ID.');
          values[f.name] = id;
          break;
        }
        case 'datetime': {
          const v = str(raw);
          values[f.name] = v ? new Date(v) : f.required ? new Date() : null;
          break;
        }
        case 'select':
          values[f.name] = f.options.includes(raw) ? raw : f.options[0];
          break;
        case 'image':
        case 'pdf':
          break;
        default:
          values[f.name] = str(raw);
      }
      if (f.required && f.type !== 'image' && f.type !== 'pdf' && !values[f.name] && values[f.name] !== false) {
        throw new UploadError(`${f.label} is required.`);
      }
    }

    let saved = null;
    let oldMedia = null;
    if (fileField) {
      const file = (req.files || []).find((x) => x.fieldname === fileField.name && x.size > 0);
      if (file) {
        saved = fileField.type === 'pdf' ? await media.savePdf(file) : await media.saveImage(file, fileField.imageOpts);
        values.media_id = saved.id;
        oldMedia = existing?.media_id || null;
      } else if (bool(req.body.remove_file) && !fileField.required) {
        values.media_id = null;
        oldMedia = existing?.media_id || null;
      } else if (fileField.required && !existing?.media_id) {
        throw new UploadError(`${fileField.label} is required.`);
      }
    }
    return { values, saved, oldMedia };
  }

  async function afterSave(row) {
    if (cfg.afterSave) await cfg.afterSave(row);
  }

  router.get('/', async (req, res) => {
    const { rows } = await pool.query(`SELECT * FROM ${cfg.table} ORDER BY ${cfg.order}`);
    res.render('admin/list', { cfg, base, rows, title: cfg.title });
  });

  router.get('/new', (req, res) => {
    const item = {};
    for (const f of cfg.fields) if (f.default !== undefined) item[f.name] = f.default;
    res.render('admin/form', { cfg, base, item, isNew: true, title: `Add ${cfg.singular}` });
  });

  router.get('/:id/edit', async (req, res, next) => {
    const { rows } = await pool.query(`SELECT * FROM ${cfg.table} WHERE id = $1`, [int(req.params.id)]);
    if (!rows[0]) return next();
    res.render('admin/form', { cfg, base, item: rows[0], isNew: false, title: `Edit ${cfg.singular}` });
  });

  router.post('/', async (req, res) => {
    try {
      const { values, saved } = await parseBody(req, null);
      const keys = Object.keys(values);
      const { rows } = await pool.query(
        `INSERT INTO ${cfg.table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        keys.map((k) => values[k])
      );
      await afterSave(rows[0]);
      flash(req, 'success', saved ? `${cfg.singular} added. ${media.savingsMessage(saved)}` : `${cfg.singular} added.`);
      res.redirect(base);
    } catch (err) {
      if (!(err instanceof UploadError)) throw err;
      flash(req, 'error', err.message);
      res.redirect(`${base}/new`);
    }
  });

  router.post('/:id', async (req, res, next) => {
    const id = int(req.params.id);
    const { rows: found } = await pool.query(`SELECT * FROM ${cfg.table} WHERE id = $1`, [id]);
    if (!found[0]) return next();
    try {
      const { values, saved, oldMedia } = await parseBody(req, found[0]);
      const keys = Object.keys(values);
      const { rows } = await pool.query(
        `UPDATE ${cfg.table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
        [...keys.map((k) => values[k]), id]
      );
      if (oldMedia) await media.deleteMedia(oldMedia);
      await afterSave(rows[0]);
      flash(req, 'success', saved ? `Saved. ${media.savingsMessage(saved)}` : 'Changes saved.');
      res.redirect(base);
    } catch (err) {
      if (!(err instanceof UploadError)) throw err;
      flash(req, 'error', err.message);
      res.redirect(`${base}/${id}/edit`);
    }
  });

  router.post('/:id/toggle', async (req, res) => {
    const field = cfg.toggleField || 'visible';
    await pool.query(`UPDATE ${cfg.table} SET ${field} = NOT ${field} WHERE id = $1`, [int(req.params.id)]);
    await afterSave(null);
    res.redirect(base);
  });

  router.post('/:id/delete', async (req, res) => {
    const { rows } = await pool.query(`DELETE FROM ${cfg.table} WHERE id = $1 RETURNING *`, [int(req.params.id)]);
    if (rows[0]?.media_id) await media.deleteMedia(rows[0].media_id);
    await afterSave(null);
    flash(req, 'success', `${cfg.singular} deleted${rows[0]?.media_id ? ' and its file removed from storage' : ''}.`);
    res.redirect(base);
  });

  router.cfg = cfg;
  router.cols = cols;
  return router;
}

module.exports = crud;
