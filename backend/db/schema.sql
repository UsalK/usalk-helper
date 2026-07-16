-- Mockup templates
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  shop_id TEXT DEFAULT 'default_shop',
  name TEXT,
  type TEXT CHECK(type IN ('flat', 'perspective', 'static')),
  config TEXT,         -- JSON string (placement, frame, shadow, corners)
  background_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Variation profiles (Ratio-specific)
CREATE TABLE IF NOT EXISTS variation_profiles (
  id TEXT,               -- e.g. 'ratio_2_3', 'ratio_3_2', etc.
  shop_id TEXT DEFAULT 'default_shop',
  name TEXT,             -- e.g. '2:3 Oranı'
  ratio TEXT,            -- e.g. '2:3'
  sizes TEXT,            -- JSON string array: ["8x12", "12x18", ...]
  frames TEXT,           -- JSON string array: ["Roll", "Black Frame", ...]
  combinations TEXT,     -- JSON string array: [{size, frame, price}]
  template_ids TEXT,     -- JSON string array of template IDs
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id, id)
);

-- Products (draft)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  shop_id TEXT DEFAULT 'default_shop',
  image_path TEXT,
  title TEXT,
  tags TEXT,           -- JSON string
  description TEXT,
  ai_attributes TEXT,  -- JSON string: visual_style, occasion, holiday, room
  variation_profile_id TEXT,
  template_ids TEXT,   -- JSON string
  etsy_listing_id TEXT, -- filled after upload
  shop_section_id TEXT, -- Etsy shop section ID
  digital_file_path TEXT, -- path to high-res digital file
  status TEXT CHECK(status IN ('draft','uploading','live','error')) DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Global default settings
CREATE TABLE IF NOT EXISTS settings (
  shop_id TEXT DEFAULT 'default_shop',
  key TEXT,
  value TEXT,          -- JSON string
  PRIMARY KEY (shop_id, key)
);

-- Etsy auth
CREATE TABLE IF NOT EXISTS etsy_auth (
  shop_id TEXT PRIMARY KEY,
  shop_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,      -- Store ISO date string
  is_active INTEGER DEFAULT 0
);

-- AI usage logging table
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  shop_id TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Shopify auth configurations
CREATE TABLE IF NOT EXISTS shopify_auth (
  shop_url TEXT PRIMARY KEY,
  shop_name TEXT,
  access_token TEXT,
  theme_path TEXT,
  is_active INTEGER DEFAULT 0
);

