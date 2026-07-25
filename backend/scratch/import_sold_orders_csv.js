import db from '../db/db.js';
import fs from 'fs';

function processSoldOrdersCSV() {
  const csvPath = 'C:\\Users\\usalk\\Downloads\\EtsySoldOrders2026.csv';
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found:", csvPath);
    return;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // All DB products
  const dbProducts = db.prepare("SELECT id, etsy_listing_id FROM products WHERE etsy_listing_id IS NOT NULL AND etsy_listing_id != ''").all();

  
  // Map product prefix (first 6 chars of ID uppercase) -> listing_id
  const prefixToListingMap = {};
  dbProducts.forEach(p => {
    if (p.id) {
      const prefix = p.id.substring(0, 6).toUpperCase();
      // Clean float string e.g. "4522345510.0" -> "4522345510"
      const cleanListingId = String(p.etsy_listing_id).replace(/\.0$/, '').trim();
      prefixToListingMap[prefix] = cleanListingId;
    }
  });

  console.log("Mapped DB product prefixes count:", Object.keys(prefixToListingMap).length);

  // Sales per listing map: listing_id -> { sales_count, total_revenue }
  const listingSales = {};

  let matchedOrders = 0;
  let totalOrderNetSum = 0;
  let totalItemsCount = 0;

  // Process rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Split CSV respecting quotes
    const fields = [];
    let insideQuote = false;
    let currentField = '';
    
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim());

    if (fields.length < 20) continue;

    const orderId = fields[1].replace(/"/g, '');
    const numItems = parseInt(fields[6].replace(/"/g, '')) || 1;
    totalItemsCount += numItems;

    
    // Order Value or Order Total minus discount
    let orderValueStr = fields[16].replace(/"/g, '').replace(/,/g, '');
    let discountStr = fields[19].replace(/"/g, '').replace(/,/g, '');
    let orderValue = parseFloat(orderValueStr) || 0;
    let discount = parseFloat(discountStr) || 0;
    let netRev = Math.max(0, orderValue - discount);

    const sku = fields[fields.length - 1]?.replace(/"/g, '').trim().toUpperCase() || '';

    // Extract prefix from SKU if format ART-XXXXXX-...
    let matchedListingId = null;
    if (sku.startsWith('ART-')) {
      const skuParts = sku.split('-');
      if (skuParts.length >= 2) {
        const prefix = skuParts[1];
        if (prefixToListingMap[prefix]) {
          matchedListingId = prefixToListingMap[prefix];
        }
      }
    }

    totalOrderNetSum += netRev;

    if (matchedListingId) {
      matchedOrders++;
      if (!listingSales[matchedListingId]) {
        listingSales[matchedListingId] = { sales_count: 0, total_revenue: 0 };
      }
      listingSales[matchedListingId].sales_count += numItems;
      listingSales[matchedListingId].total_revenue += netRev;

      console.log(`Matched Order #${orderId} (SKU: ${sku}) -> Listing #${matchedListingId}: ${numItems} item(s), $${netRev.toFixed(2)}`);
    } else {
      console.log(`Unmatched Order #${orderId} (SKU: "${sku}", Value: $${netRev.toFixed(2)})`);
    }
  }

  // Save CSV Totals to Settings DB
  const activeShop = db.prepare('SELECT shop_id FROM etsy_auth WHERE is_active = 1').get() || { shop_id: 'default_shop' };
  const setStmt = db.prepare('INSERT INTO settings (shop_id, key, value) VALUES (?, ?, ?) ON CONFLICT(shop_id, key) DO UPDATE SET value = excluded.value');
  setStmt.run(activeShop.shop_id, 'imported_sales_count', JSON.stringify(totalItemsCount));
  setStmt.run(activeShop.shop_id, 'imported_total_revenue', JSON.stringify(totalOrderNetSum));

  console.log(`\nMatched ${matchedOrders} of ${lines.length - 1} orders.`);
  console.log(`TOTAL CSV ITEMS SOLD: ${totalItemsCount}`);
  console.log(`TOTAL CSV NET REVENUE: $${totalOrderNetSum.toFixed(2)} USD`);



  // Update etsy_analytics_cache table with real sales data from CSV
  const updateStmt = db.prepare(`
    UPDATE etsy_analytics_cache
    SET sales_count = ?, total_revenue = ?
    WHERE listing_id = ?
  `);

  db.exec('BEGIN');
  let updatedCount = 0;
  for (const [listingId, stats] of Object.entries(listingSales)) {
    updateStmt.run(stats.sales_count, stats.total_revenue, String(listingId));
    updatedCount++;
  }
  db.exec('COMMIT');

  console.log(`Updated ${updatedCount} listings in SQLite cache DB with real sold order metrics!`);
}

processSoldOrdersCSV();
