import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import db, { getActiveShop, getShopStorageName } from '../db/db.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

router.post('/save', (req, res, next) => {
  try {
    const { productId, templateId, ratio, image } = req.body;
    
    if (!productId || !templateId || !ratio || !image) {
      return res.status(400).json({ error: 'Missing parameters. productId, templateId, ratio, and image are required.' });
    }
    
    // Create product mockups folder if it doesn't exist
    const activeShop = getActiveShop();
    const shopName = getShopStorageName(activeShop.shop_id);
    const productMockupDir = join(__dirname, '../..', 'storage', shopName, 'mockups', productId);
    if (!fs.existsSync(productMockupDir)) {
      fs.mkdirSync(productMockupDir, { recursive: true });
    }
    
    // Clean base64 string
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    const cleanRatio = ratio.replace(':', '-');
    const filePath = join(productMockupDir, `${templateId}_${cleanRatio}.jpg`);
    fs.writeFileSync(filePath, buffer);
    
    res.json({ success: true, path: `storage/${shopName}/mockups/${productId}/${templateId}_${cleanRatio}.jpg` });
  } catch (err) {
    next(err);
  }
});

// List all mockups generated for a product
router.get('/list/:productId', (req, res, next) => {
  try {
    const { productId } = req.params;
    const activeShop = getActiveShop();
    const product = db.prepare('SELECT shop_id FROM products WHERE id = ?').get(productId);
    const shopId = product ? product.shop_id : activeShop.shop_id;
    const shopName = getShopStorageName(shopId);
    let productMockupDir = join(__dirname, '../..', 'storage', shopName, 'mockups', productId);
    
    if (!fs.existsSync(productMockupDir)) {
      productMockupDir = join(__dirname, '../..', 'storage/mockups', productId);
    }
    
    if (!fs.existsSync(productMockupDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(productMockupDir).filter(f => {
      const lower = f.toLowerCase();
      return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
    });
    
    const mockups = files.map(file => {
      const hasShopDir = fs.existsSync(join(__dirname, '../..', 'storage', shopName, 'mockups', productId, file));
      const relativePath = hasShopDir
        ? `${shopName}/mockups/${productId}/${file}`
        : `mockups/${productId}/${file}`;
      return {
        filename: file,
        url: `http://localhost:3001/storage/${relativePath}`
      };
    });
    
    res.json(mockups);
  } catch (err) {
    next(err);
  }
});

// Delete a mockup file
router.delete('/delete/:productId/:filename', (req, res, next) => {
  try {
    const { productId, filename } = req.params;
    const activeShop = getActiveShop();
    const product = db.prepare('SELECT shop_id FROM products WHERE id = ?').get(productId);
    const shopId = product ? product.shop_id : activeShop.shop_id;
    const shopName = getShopStorageName(shopId);
    let filePath = join(__dirname, '../..', 'storage', shopName, 'mockups', productId, filename);
    if (!fs.existsSync(filePath)) {
      filePath = join(__dirname, '../..', 'storage/mockups', productId, filename);
    }
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Mockup file not found' });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
