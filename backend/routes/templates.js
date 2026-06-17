import express from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db, { getActiveShop } from '../db/db.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Configure multer for template backgrounds
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(__dirname, '../..', 'storage/templates'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `template-${uniqueSuffix}.${ext}`);
  }
});
const upload = multer({ storage });

// Get all templates
router.get('/', (req, res, next) => {
  try {
    const activeShop = getActiveShop();
    const stmt = db.prepare('SELECT * FROM templates WHERE shop_id = ? ORDER BY created_at DESC');
    const templates = stmt.all(activeShop.shop_id);
    
    // Parse config JSON strings
    const parsed = templates.map(t => ({
      ...t,
      config: JSON.parse(t.config)
    }));
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// Create new template
router.post('/', upload.single('background'), (req, res, next) => {
  try {
    const { name, type, config } = req.body;
    const id = uuidv4();
    const activeShop = getActiveShop();
    const background_path = req.file ? `storage/templates/${req.file.filename}` : '';
    
    const stmt = db.prepare(
      'INSERT INTO templates (id, shop_id, name, type, config, background_path) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(id, activeShop.shop_id, name, type, config, background_path);
    
    res.json({ id, shop_id: activeShop.shop_id, name, type, config: JSON.parse(config), background_path });
  } catch (err) {
    next(err);
  }
});

// Delete template
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const activeShop = getActiveShop();
    
    // Get background path to delete the file
    const getStmt = db.prepare('SELECT background_path FROM templates WHERE id = ? AND shop_id = ?');
    const template = getStmt.get(id, activeShop.shop_id);
    
    if (template && template.background_path) {
      const fullPath = join(__dirname, '../..', template.background_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    
    const stmt = db.prepare('DELETE FROM templates WHERE id = ? AND shop_id = ?');
    stmt.run(id, activeShop.shop_id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Get all templates from other shops
router.get('/other-shops', (req, res, next) => {
  try {
    const activeShop = getActiveShop();
    const stmt = db.prepare('SELECT templates.*, etsy_auth.shop_name FROM templates LEFT JOIN etsy_auth ON templates.shop_id = etsy_auth.shop_id WHERE templates.shop_id != ? OR templates.shop_id IS NULL ORDER BY templates.created_at DESC');
    const templates = stmt.all(activeShop.shop_id);
    const parsed = templates.map(t => ({
      ...t,
      config: JSON.parse(t.config),
      shop_name: t.shop_name || 'Global / Varsayılan'
    }));
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// Copy template from another shop to the active shop
router.post('/copy', (req, res, next) => {
  try {
    const { templateId } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }
    const activeShop = getActiveShop();
    
    const getStmt = db.prepare('SELECT * FROM templates WHERE id = ?');
    const sourceTemplate = getStmt.get(templateId);
    if (!sourceTemplate) {
      return res.status(404).json({ error: 'Source template not found' });
    }
    
    let newBackgroundPath = '';
    if (sourceTemplate.background_path) {
      const srcFullPath = join(__dirname, '../..', sourceTemplate.background_path);
      if (fs.existsSync(srcFullPath)) {
        const ext = sourceTemplate.background_path.split('.').pop();
        const newFilename = `template-copy-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
        newBackgroundPath = `storage/templates/${newFilename}`;
        const destFullPath = join(__dirname, '../..', newBackgroundPath);
        fs.copyFileSync(srcFullPath, destFullPath);
      }
    }
    
    const newId = uuidv4();
    const insertStmt = db.prepare(
      'INSERT INTO templates (id, shop_id, name, type, config, background_path) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertStmt.run(newId, activeShop.shop_id, `${sourceTemplate.name} (Kopya)`, sourceTemplate.type, sourceTemplate.config, newBackgroundPath);
    
    res.json({
      id: newId,
      shop_id: activeShop.shop_id,
      name: `${sourceTemplate.name} (Kopya)`,
      type: sourceTemplate.type,
      config: JSON.parse(sourceTemplate.config),
      background_path: newBackgroundPath
    });
  } catch (err) {
    next(err);
  }
});

export default router;
