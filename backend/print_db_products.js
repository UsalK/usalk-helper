import { DatabaseSync } from 'node:sqlite';

const dbPath = './db/database.db';
const db = new DatabaseSync(dbPath);

console.log("=== PRODUCTS IN DB ===");
try {
  const products = db.prepare('SELECT id, title, variation_profile_id, status, etsy_listing_id FROM products').all();
  console.log(JSON.stringify(products, null, 2));
} catch (e) {
  console.error("Error:", e.message);
}
