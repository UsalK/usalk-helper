import express from 'express';
import fs from 'fs';
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
    
    if (!product.image_path) {
      return res.status(400).json({ error: 'Ürünün görsel yolu veritabanında tanımlı değil.' });
    }
    
    const imagePath = join(__dirname, '../..', product.image_path);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: `Ürün görsel dosyası disk üzerinde bulunamadı (${product.image_path}).` });
    }
    
    const platform = product.shop_id.includes('.myshopify.com') ? 'shopify' : 'etsy';
    
    // Call Kimi service for physical wall art SEO
    const seoData = await generateSEO(imagePath, targetMarket, shopStyle, product.shop_id, platform);
    
    // Extract info
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
      },
      _meta: seoData._meta || null
    });
  } catch (err) {
    console.error("SEO Generation Error:", err);
    next(err);
  }
});

export default router;
