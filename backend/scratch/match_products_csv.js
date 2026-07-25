import db from '../db/db.js';
import fs from 'fs';

function inspectProducts() {
  const dbProducts = db.prepare('SELECT id, title, etsy_listing_id, image_path FROM products WHERE etsy_listing_id IS NOT NULL LIMIT 10').all();
  console.log('Sample DB Products with etsy_listing_id:\n', dbProducts);

  const csvPath = 'C:\\Users\\usalk\\Downloads\\EtsySoldOrders2026.csv';
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Calculate total revenue and total orders from CSV
  let totalOrderNetSum = 0;
  let totalOrderValueSum = 0;
  let totalItemsCount = 0;
  
  lines.slice(1).forEach((line, idx) => {
    // Basic CSV line parse
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    // Parse order value / net / order total
    // Columns: 0: Sale Date, 1: Order ID, 6: Number of Items, 16: Order Value, 19: Discount Amount, 23: Order Total
    const parts = line.split(',');
    const orderId = parts[1];
    const items = parseInt(parts[6]) || 1;
    totalItemsCount += items;
  });

  console.log(`CSV Summary: ${lines.length - 1} orders, total items sold: ${totalItemsCount}`);
}

inspectProducts();
