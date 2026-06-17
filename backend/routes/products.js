import express from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db, { getActiveShop } from '../db/db.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Configure multer for product uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const activeShop = getActiveShop();
    const destDir = join(__dirname, '../..', 'storage/uploads', activeShop.shop_id);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `product-${uniqueSuffix}.${ext}`);
  }
});
const upload = multer({ storage });

// Configure multer for digital file uploads (max 20MB)
const digitalStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const activeShop = getActiveShop();
    const productId = req.params.id;
    const destDir = join(__dirname, '../..', 'storage/digital_files', activeShop.shop_id, productId);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, cleanName);
  }
});
const uploadDigital = multer({ 
  storage: digitalStorage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB limit
});

// Get all products
router.get('/', (req, res, next) => {
  try {
    const activeShop = getActiveShop();
    const stmt = db.prepare('SELECT * FROM products WHERE shop_id = ? ORDER BY created_at DESC');
    const products = stmt.all(activeShop.shop_id);
    
    const parsed = products.map(p => {
      let mockupsDir = join(__dirname, '../..', 'storage/mockups', p.shop_id || activeShop.shop_id, p.id);
      if (!fs.existsSync(mockupsDir)) {
        mockupsDir = join(__dirname, '../..', 'storage/mockups', p.id);
      }
      let mockupCount = 0;
      if (fs.existsSync(mockupsDir)) {
        mockupCount = fs.readdirSync(mockupsDir).filter(f => {
          const lower = f.toLowerCase();
          return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
        }).length;
      }
      
      return {
        ...p,
        tags: p.tags ? JSON.parse(p.tags) : [],
        ai_attributes: p.ai_attributes ? JSON.parse(p.ai_attributes) : null,
        template_ids: p.template_ids ? JSON.parse(p.template_ids) : [],
        mockup_count: mockupCount
      };
    });
    
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// Upload multiple products
router.post('/upload', upload.array('images'), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const activeShop = getActiveShop();
    const stmt = db.prepare(
      'INSERT INTO products (id, shop_id, image_path, title, tags, description, ai_attributes, template_ids, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    
    const newProducts = [];
    
    db.exec('BEGIN');
    try {
      for (const file of req.files) {
        const id = uuidv4();
        const imagePath = `storage/uploads/${activeShop.shop_id}/${file.filename}`;
        
        // Base title is filename without extension
        const title = file.originalname.replace(/\.[^/.]+$/, "").substring(0, 140);
        
        stmt.run(
          id,
          activeShop.shop_id,
          imagePath,
          title,
          JSON.stringify([]),
          '',
          JSON.stringify({
            visual_style: [],
            occasion: [],
            holiday: [],
            room: []
          }),
          JSON.stringify([]),
          'draft'
        );
        
        newProducts.push({
          id,
          shop_id: activeShop.shop_id,
          image_path: imagePath,
          title,
          tags: [],
          description: '',
          ai_attributes: {
            visual_style: [],
            occasion: [],
            holiday: [],
            room: []
          },
          template_ids: [],
          status: 'draft'
        });
      }
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
    
    res.json(newProducts);
  } catch (err) {
    next(err);
  }
});

// Update product
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, tags, description, ai_attributes, variation_profile_id, template_ids, status, etsy_listing_id, shop_section_id } = req.body;
    const activeShop = getActiveShop();
    
    const checkStmt = db.prepare('SELECT id FROM products WHERE id = ? AND shop_id = ?');
    const productExists = checkStmt.get(id, activeShop.shop_id);
    if (!productExists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const updateStmt = db.prepare(
      `UPDATE products 
       SET title = ?, 
           tags = ?, 
           description = ?, 
           ai_attributes = ?, 
           variation_profile_id = ?, 
           template_ids = ?, 
           status = ?, 
           etsy_listing_id = ?,
           shop_section_id = ?
       WHERE id = ? AND shop_id = ?`
     );
    
    updateStmt.run(
      title !== undefined ? title : '',
      tags ? JSON.stringify(tags) : JSON.stringify([]),
      description !== undefined ? description : '',
      ai_attributes ? JSON.stringify(ai_attributes) : JSON.stringify({}),
      variation_profile_id || null,
      template_ids ? JSON.stringify(template_ids) : JSON.stringify([]),
      status || 'draft',
      etsy_listing_id || null,
      shop_section_id || null,
      id,
      activeShop.shop_id
    );
    
    res.json({ id, success: true });
  } catch (err) {
    next(err);
  }
});

// Delete product
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const activeShop = getActiveShop();
    
    const getStmt = db.prepare('SELECT image_path FROM products WHERE id = ? AND shop_id = ?');
    const product = getStmt.get(id, activeShop.shop_id);
    
    if (product) {
      if (product.image_path) {
        const fullPath = join(__dirname, '../..', product.image_path);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
      
      // Delete generated mockups directory if it exists
      const shopMockupsDir = join(__dirname, '../..', 'storage/mockups', activeShop.shop_id, id);
      if (fs.existsSync(shopMockupsDir)) {
        fs.rmSync(shopMockupsDir, { recursive: true, force: true });
      }
      const oldMockupsDir = join(__dirname, '../..', 'storage/mockups', id);
      if (fs.existsSync(oldMockupsDir)) {
        fs.rmSync(oldMockupsDir, { recursive: true, force: true });
      }
      
      // Delete digital files directory if it exists
      const digitalDir = join(__dirname, '../..', 'storage/digital_files', activeShop.shop_id, id);
      if (fs.existsSync(digitalDir)) {
        fs.rmSync(digitalDir, { recursive: true, force: true });
      }
      
      const deleteStmt = db.prepare('DELETE FROM products WHERE id = ? AND shop_id = ?');
      deleteStmt.run(id, activeShop.shop_id);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (err) {
    next(err);
  }
});

// Upload digital file for a product (max 20MB)
router.post('/:id/digital-file', (req, res, next) => {
  return res.status(403).json({ error: 'Dijital ürün desteği geçici olarak devre dışı bırakılmıştır.' });
});

export default router;
