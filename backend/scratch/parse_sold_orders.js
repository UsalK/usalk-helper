import db from '../db/db.js';
import fs from 'fs';
import { parse } from 'path';

function checkSkuMatch() {
  const csvPath = 'C:\\Users\\usalk\\Downloads\\EtsySoldOrders2026.csv';
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  console.log('Total CSV lines:', lines.length);
  
  // Products in DB
  const dbProducts = db.prepare('SELECT id, title, etsy_listing_id FROM products WHERE etsy_listing_id IS NOT NULL').all();
  console.log('DB products with etsy_listing_id:', dbProducts.length);
  
  const cacheListings = db.prepare('SELECT listing_id, title FROM etsy_analytics_cache').all();
  console.log('Cache listings count:', cacheListings.length);
  
  // Parse CSV
  let ordersCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    ordersCount++;
    const parts = line.split(',');
    const orderId = parts[1];
    const sku = parts[parts.length - 1]?.replace(/"/g, '').trim();
    if (sku) {
      console.log(`Order #${orderId} has SKU:`, sku);
    }
  }
  console.log('Total Orders in CSV:', ordersCount);
}

checkSkuMatch();
