import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'database.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// Initialize schema
const schemaPath = join(__dirname, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// Database Migration: Check if shop_id exists in products table. If not, perform migration.
let needsMigration = false;
try {
  const tableInfo = db.prepare("PRAGMA table_info(products)").all();
  if (tableInfo.length > 0) {
    const hasShopId = tableInfo.some(col => col.name === 'shop_id');
    if (!hasShopId) {
      needsMigration = true;
    }
  } else {
    // Table doesn't exist, schema will initialize it
    needsMigration = false;
  }
} catch (err) {
  needsMigration = false;
}

if (needsMigration) {
  console.log("Running SQLite database migration for multi-shop support...");
  
  // Try to find the existing shop_id
  let migratedShopId = 'default_shop';
  try {
    const oldAuth = db.prepare("SELECT shop_id FROM etsy_auth WHERE id = 1").get();
    if (oldAuth && oldAuth.shop_id && oldAuth.shop_id.trim() !== '') {
      migratedShopId = oldAuth.shop_id.toString();
    }
  } catch (err) {
    console.warn("Could not query old active shop_id from etsy_auth:", err.message);
  }
  
  console.log(`Existing data will be associated with shop: '${migratedShopId}'`);
  
  try {
    db.exec('BEGIN');
    
    // Rename old tables
    db.exec('ALTER TABLE etsy_auth RENAME TO etsy_auth_old');
    db.exec('ALTER TABLE settings RENAME TO settings_old');
    db.exec('ALTER TABLE templates RENAME TO templates_old');
    db.exec('ALTER TABLE variation_profiles RENAME TO variation_profiles_old');
    db.exec('ALTER TABLE products RENAME TO products_old');
    
    // Create new tables
    db.exec(`
      CREATE TABLE etsy_auth (
        shop_id TEXT PRIMARY KEY,
        shop_name TEXT,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TEXT,
        is_active INTEGER DEFAULT 0
      );
      
      CREATE TABLE settings (
        shop_id TEXT,
        key TEXT,
        value TEXT,
        PRIMARY KEY (shop_id, key)
      );
      
      CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        shop_id TEXT DEFAULT 'default_shop',
        name TEXT,
        type TEXT CHECK(type IN ('flat', 'perspective', 'static')),
        config TEXT,
        background_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE variation_profiles (
        id TEXT,
        shop_id TEXT DEFAULT 'default_shop',
        name TEXT,
        ratio TEXT,
        sizes TEXT,
        frames TEXT,
        combinations TEXT,
        template_ids TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (shop_id, id)
      );
      
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        shop_id TEXT DEFAULT 'default_shop',
        image_path TEXT,
        title TEXT,
        tags TEXT,
        description TEXT,
        ai_attributes TEXT,
        variation_profile_id TEXT,
        template_ids TEXT,
        etsy_listing_id TEXT,
        shop_section_id TEXT,
        status TEXT CHECK(status IN ('draft','uploading','live','error')) DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Populate new tables with old data using the active shop ID
    db.exec(`
      INSERT INTO etsy_auth (shop_id, shop_name, access_token, refresh_token, expires_at, is_active)
      SELECT shop_id, 'Ana Magaza', access_token, refresh_token, expires_at, 1
      FROM etsy_auth_old WHERE shop_id IS NOT NULL AND shop_id != '';
    `);
    
    const insertSettings = db.prepare('INSERT INTO settings (shop_id, key, value) SELECT ?, key, value FROM settings_old');
    insertSettings.run(migratedShopId);
    
    const insertTemplates = db.prepare(`
      INSERT INTO templates (id, shop_id, name, type, config, background_path, created_at)
      SELECT id, ?, name, type, config, background_path, created_at FROM templates_old
    `);
    insertTemplates.run(migratedShopId);
    
    const insertProfiles = db.prepare(`
      INSERT INTO variation_profiles (id, shop_id, name, ratio, sizes, frames, combinations, template_ids, created_at)
      SELECT id, ?, name, ratio, sizes, frames, combinations, template_ids, created_at FROM variation_profiles_old
    `);
    insertProfiles.run(migratedShopId);
    
    const insertProducts = db.prepare(`
      INSERT INTO products (id, shop_id, image_path, title, tags, description, ai_attributes, variation_profile_id, template_ids, etsy_listing_id, shop_section_id, status, created_at)
      SELECT id, ?, image_path, title, tags, description, ai_attributes, variation_profile_id, template_ids, etsy_listing_id, shop_section_id, status, created_at FROM products_old
    `);
    insertProducts.run(migratedShopId);
    
    // Drop old tables
    db.exec('DROP TABLE etsy_auth_old');
    db.exec('DROP TABLE settings_old');
    db.exec('DROP TABLE templates_old');
    db.exec('DROP TABLE variation_profiles_old');
    db.exec('DROP TABLE products_old');
    
    db.exec('COMMIT');
    console.log("Database migrations completed successfully!");
  } catch (migErr) {
    db.exec('ROLLBACK');
    console.error("Critical database migration failed:", migErr);
  }
} else {
  // Initialize schema if not exist
  db.exec(schema);
}

// Ensure digital_file_path column exists in products table for digital downloads support
try {
  db.exec("ALTER TABLE products ADD COLUMN digital_file_path TEXT");
  console.log("[Schema Upgrade] Added digital_file_path column to products table.");
} catch (err) {
  // Column already exists, ignore
}

// Ensure ai_usage logging table exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      shop_id TEXT,
      model TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      cost REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (err) {
  console.error("Failed to ensure ai_usage table:", err);
}

// Ensure cost column exists in ai_usage
try {
  db.exec("ALTER TABLE ai_usage ADD COLUMN cost REAL DEFAULT 0.0");
} catch (err) {
  // Column already exists, ignore
}

// Global helper: Get current active shop
export function getActiveShop() {
  const row = db.prepare('SELECT * FROM etsy_auth WHERE is_active = 1').get();
  if (row) {
    return row;
  }
  return {
    shop_id: 'default_shop',
    shop_name: 'Bagli Magaza Yok',
    access_token: '',
    refresh_token: '',
    expires_at: ''
  };
}

// Global helper: Get storage-safe folder name for a shop ID
export function getShopStorageName(shopId) {
  const row = db.prepare('SELECT shop_name FROM etsy_auth WHERE shop_id = ?').get(shopId);
  const rawName = row ? row.shop_name : (shopId === 'default_shop' ? 'Bagli Magaza Yok' : 'Bagli Magaza Yok');
  return rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Global helper: Seed variation profiles for a specific shop
export function seedDefaultProfilesForShop(shopId) {
  const seedStmt = db.prepare(`
    INSERT INTO variation_profiles (id, shop_id, name, ratio, sizes, frames, combinations, template_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shop_id, id) DO NOTHING
  `);
  const defaults = [
    { id: 'ratio_2_3', name: '2:3 Oranı (Dikey)', ratio: '2:3' },
    { id: 'ratio_3_2', name: '3:2 Oranı (Yatay)', ratio: '3:2' },
    { id: 'ratio_1_1', name: '1:1 Oranı (Kare)', ratio: '1:1' },
    { id: 'ratio_12_7', name: '12:7 Oranı (Geniş)', ratio: '12:7' },
    { id: 'ratio_7_12', name: '7:12 Oranı (Uzun)', ratio: '7:12' },
    { id: 'ratio_12_5', name: '12:5 Oranı (Panoramik)', ratio: '12:5' },
    { id: 'ratio_1_2', name: '1:2 Oranı (Uzun Panoramik)', ratio: '1:2' }
  ];
  defaults.forEach(d => {
    seedStmt.run(
      d.id,
      shopId,
      d.name,
      d.ratio,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([])
    );
  });
}

// Global helper: Copy general settings template to a new shop
export function copySettingsTemplateToShop(fromShopId, toShopId) {
  try {
    const checkStmt = db.prepare('SELECT COUNT(*) as count FROM settings WHERE shop_id = ?');
    const checkRow = checkStmt.get(toShopId);
    if (checkRow && checkRow.count === 0) {
      const getSettings = db.prepare('SELECT key, value FROM settings WHERE shop_id = ?');
      const rows = getSettings.all(fromShopId);
      
      const insertStmt = db.prepare('INSERT INTO settings (shop_id, key, value) VALUES (?, ?, ?)');
      
      // Keys containing Etsy-specific unique identifiers that must NOT be copied
      const skipKeys = [
        'default_shipping_profile_id',
        'default_return_policy_id',
        'default_shop_section_id',
        'readiness_state_id'
      ];
      
      db.exec('BEGIN');
      try {
        rows.forEach(r => {
          if (!skipKeys.includes(r.key)) {
            insertStmt.run(toShopId, r.key, r.value);
          }
        });
        db.exec('COMMIT');
        console.log(`General settings templates copied from ${fromShopId} to ${toShopId}`);
      } catch (txErr) {
        db.exec('ROLLBACK');
        throw txErr;
      }
    }
  } catch (err) {
    console.error("Failed to copy settings template:", err);
  }
}

// Seed default shop profiles for all shops on launch
try {
  const allShops = db.prepare('SELECT shop_id FROM etsy_auth').all();
  allShops.forEach(s => seedDefaultProfilesForShop(s.shop_id));
  seedDefaultProfilesForShop('default_shop');
} catch (err) {
  const activeShop = getActiveShop();
  seedDefaultProfilesForShop(activeShop.shop_id);
}

export default db;
