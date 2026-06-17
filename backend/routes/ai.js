import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db, { getActiveShop } from '../db/db.js';
import { generateSEO } from '../services/KimiService.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

router.post('/generate', async (req, res, next) => {
  try {
    const { productId, targetMarket, shopStyle } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    
    // Get product from DB
    const getStmt = db.prepare('SELECT * FROM products WHERE id = ?');
    const product = getStmt.get(productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const imagePath = join(__dirname, '../..', product.image_path);
    
    // Determine if active shop has digital download enabled
    const activeShop = getActiveShop();
    const settingsStmt = db.prepare('SELECT value FROM settings WHERE shop_id = ? AND key = ?');
    const isDigitalRow = settingsStmt.get(activeShop.shop_id, 'default_is_digital');
    const isDigital = isDigitalRow ? JSON.parse(isDigitalRow.value) : false;

    // Call Kimi service with digital mode parameter
    const seoData = await generateSEO(imagePath, targetMarket, shopStyle, isDigital);
    
    // Extract info (prioritize long description if digital)
    const title = seoData.title || '';
    const tags = JSON.stringify(seoData.tags || []);
    const description = seoData.description || seoData.description_hook || '';
    const ai_attributes = JSON.stringify({
      visual_style: seoData.visual_style || [],
      occasion: seoData.occasion || [],
      holiday: seoData.holiday || [],
      room: seoData.room || []
    });
    
    // Update product in DB
    const updateStmt = db.prepare(
      'UPDATE products SET title = ?, tags = ?, description = ?, ai_attributes = ? WHERE id = ?'
    );
    updateStmt.run(title, tags, description, ai_attributes, productId);
    
    res.json({
      id: productId,
      title,
      tags: seoData.tags || [],
      description,
      ai_attributes: {
        visual_style: seoData.visual_style || [],
        occasion: seoData.occasion || [],
        holiday: seoData.holiday || [],
        room: seoData.room || []
      }
    });
  } catch (err) {
    console.error("SEO Generation Error:", err);
    next(err);
  }
});

export default router;
