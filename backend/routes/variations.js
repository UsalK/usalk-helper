import express from 'express';
import db, { getActiveShop } from '../db/db.js';

const router = express.Router();

// Get all profiles
router.get('/', (req, res, next) => {
  try {
    const activeShop = getActiveShop();
    const stmt = db.prepare('SELECT * FROM variation_profiles WHERE shop_id = ? ORDER BY ratio ASC');
    const profiles = stmt.all(activeShop.shop_id);
    const parsed = profiles.map(p => ({
      ...p,
      sizes: p.sizes ? JSON.parse(p.sizes) : [],
      frames: p.frames ? JSON.parse(p.frames) : [],
      combinations: p.combinations ? JSON.parse(p.combinations) : [],
      template_ids: p.template_ids ? JSON.parse(p.template_ids) : []
    }));
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// Create or update profile
router.post('/', (req, res, next) => {
  try {
    const { id, name, ratio, sizes, frames, combinations, template_ids } = req.body;
    const activeShop = getActiveShop();
    const stmt = db.prepare(`
      INSERT INTO variation_profiles (id, shop_id, name, ratio, sizes, frames, combinations, template_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_id, id) DO UPDATE SET
        name = EXCLUDED.name,
        ratio = EXCLUDED.ratio,
        sizes = EXCLUDED.sizes,
        frames = EXCLUDED.frames,
        combinations = EXCLUDED.combinations,
        template_ids = EXCLUDED.template_ids
    `);
    stmt.run(
      id,
      activeShop.shop_id,
      name,
      ratio,
      JSON.stringify(sizes || []),
      JSON.stringify(frames || []),
      JSON.stringify(combinations || []),
      JSON.stringify(template_ids || [])
    );
    res.json({ id, shop_id: activeShop.shop_id, name, ratio, sizes, frames, combinations, template_ids });
  } catch (err) {
    next(err);
  }
});

// Update profile
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, ratio, sizes, frames, combinations, template_ids } = req.body;
    const activeShop = getActiveShop();
    const stmt = db.prepare(`
      UPDATE variation_profiles 
      SET name = ?, ratio = ?, sizes = ?, frames = ?, combinations = ?, template_ids = ?
      WHERE id = ? AND shop_id = ?
    `);
    stmt.run(
      name,
      ratio,
      JSON.stringify(sizes || []),
      JSON.stringify(frames || []),
      JSON.stringify(combinations || []),
      JSON.stringify(template_ids || []),
      id,
      activeShop.shop_id
    );
    res.json({ id, shop_id: activeShop.shop_id, name, ratio, sizes, frames, combinations, template_ids });
  } catch (err) {
    next(err);
  }
});

// Delete profile
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const activeShop = getActiveShop();
    const stmt = db.prepare('DELETE FROM variation_profiles WHERE id = ? AND shop_id = ?');
    stmt.run(id, activeShop.shop_id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
