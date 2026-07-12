import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db, { getActiveShop, getShopStorageName } from '../db/db.js';
import * as EtsyService from '../services/EtsyService.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// Etsy taxonomy property value mappings for Wall Decor (node 1027)
const STYLE_MAPPING = {
  "Art deco": 2382,
  "Bohemian & eclectic": 2384,
  "Coastal & tropical": 2385,
  "Contemporary": 2387,
  "Country & farmhouse": 2388,
  "Gothic": 2409,
  "Lodge": 2391,
  "Mid-century": 2392,
  "Minimalist": 2393,
  "Rustic & primitive": 2395,
  "Victorian": 2399
};

const OCCASION_MAPPING = {
  "1st birthday": 2773,
  "Anniversary": 12,
  "Baby shower": 13,
  "Bachelor party": 14,
  "Bachelorette party": 15,
  "Back to school": 16,
  "Baptism": 17,
  "Bar & Bat Mitzvah": 18,
  "Birthday": 19,
  "Bridal shower": 20,
  "Confirmation": 21,
  "Divorce & breakup": 26,
  "Engagement": 22,
  "First Communion": 23,
  "Graduation": 24,
  "Grief & mourning": 25,
  "Housewarming": 27,
  "LGBTQ pride": 2774,
  "Moving": 50,
  "Pet loss": 28,
  "Prom": 29,
  "Quinceañera & Sweet 16": 30,
  "Retirement": 31,
  "Wedding": 32
};

const HOLIDAY_MAPPING = {
  "Christmas": 35,
  "Cinco de Mayo": 36,
  "Dia de los Muertos": 5126,
  "Diwali": 4562,
  "Easter": 37,
  "Eid": 4564,
  "Father's Day": 38,
  "Halloween": 39,
  "Hanukkah": 40,
  "Holi": 4563,
  "Independence Day": 41,
  "Kwanzaa": 42,
  "Lunar New Year": 34,
  "Mardi Gras": 5118,
  "Mother's Day": 43,
  "New Year's": 44,
  "Passover": 47,
  "Ramadan": 5128,
  "St Patrick's Day": 45,
  "Thanksgiving": 46,
  "Valentine's Day": 48,
  "Veterans Day": 49
};

const ROOM_MAPPING = {
  "Bar": 4424,
  "Bathroom": 2356,
  "Bedroom": 2354,
  "Craft": 2360,
  "Dorm": 3946,
  "Entryway": 2353,
  "Game room": 3947,
  "Garage": 2361,
  "Kids": 2357,
  "Kitchen & dining": 2350,
  "Laundry": 2359,
  "Living room": 2351,
  "Man cave": 4425,
  "Nursery": 2358,
  "Office": 2352,
  "Patio & outdoor": 2355,
  "Porch": 4426
};

const MATERIALS_MAPPING = {
  "Canvas": 74,
  "Cotton": 102,
  "Fabric": 118,
  "Paper": 196,
  "Wood": 286
};

// Utility to generate PKCE
function generateVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// 1. Get auth URL
router.get('/auth-url', (req, res, next) => {
  try {
    const { client_id } = EtsyService.getEtsyCredentials();
    const verifier = generateVerifier();
    const challenge = generateChallenge(verifier);
    
    // Save verifier in settings table to use on callback
    const stmt = db.prepare(
      "INSERT INTO settings (shop_id, key, value) VALUES ('global', ?, ?) ON CONFLICT(shop_id, key) DO UPDATE SET value = ?"
    );
    const verifierStr = JSON.stringify(verifier);
    stmt.run('etsy_code_verifier', verifierStr, verifierStr);
    
    const redirectUri = process.env.ETSY_REDIRECT_URI || 'http://localhost:3001/api/etsy/callback';
    const scope = 'listings_r listings_w shops_r shops_w';
    const state = 'usalk_auth';
    
    const authUrl = `https://www.etsy.com/oauth/connect?` + new URLSearchParams({
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scope,
      client_id: client_id,
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString();
    
    res.json({ url: authUrl });
  } catch (err) {
    next(err);
  }
});

// 2. OAuth Callback
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).send('Authorization code is missing.');
    }
    
    const verifierStmt = db.prepare("SELECT value FROM settings WHERE shop_id = 'global' AND key = 'etsy_code_verifier'");
    const verifierRow = verifierStmt.get();
    
    if (!verifierRow) {
      return res.status(400).send('Code verifier not found. Please try logging in again.');
    }
    
    const verifier = JSON.parse(verifierRow.value);
    const { client_id, client_secret } = EtsyService.getEtsyCredentials();
    
    const redirectUri = process.env.ETSY_REDIRECT_URI || 'http://localhost:3001/api/etsy/callback';
    
    // Exchange authorization code for access tokens
    const response = await axios.post('https://api.etsy.com/v3/public/oauth/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: client_id,
        client_secret: client_secret,
        redirect_uri: redirectUri,
        code: code.toString(),
        code_verifier: verifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const { access_token, refresh_token, expires_in } = response.data;
    
    let shopId = '';
    let shopName = 'Etsy Shop';
    
    try {
      const meRes = await axios.get('https://openapi.etsy.com/v3/application/users/me', {
        headers: {
          'x-api-key': `${client_id}:${client_secret}`,
          'Authorization': `Bearer ${access_token}`
        }
      });
      const userId = meRes.data.user_id;
      if (meRes.data.shop_id) {
        shopId = meRes.data.shop_id.toString();
      }
      
      // Get shops for user to fetch shop name
      try {
        const shopRes = await axios.get(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
          headers: {
            'x-api-key': `${client_id}:${client_secret}`,
            'Authorization': `Bearer ${access_token}`
          }
        });
        
        if (shopRes.data.shop_id) {
          shopId = shopRes.data.shop_id.toString();
          shopName = shopRes.data.shop_name || 'Etsy Shop';
        } else if (shopRes.data.results && shopRes.data.results.length > 0) {
          shopId = shopRes.data.results[0].shop_id.toString();
          shopName = shopRes.data.results[0].shop_name || 'Etsy Shop';
        } else if (shopRes.data.count === 0 || (shopRes.data.results && shopRes.data.results.length === 0)) {
          console.warn(`[OAuth Callback] User ${userId} has no shops associated with their account.`);
        }
      } catch (shopErr) {
        console.error("Failed to fetch shops for user during callback:", shopErr.response?.data || shopErr.message);
        // If /users/{userId}/shops 404s, it means there is no shop for this user
      }
    } catch (meErr) {
      console.error("Failed to fetch user me details during callback:", meErr.response?.data || meErr.message);
    }
    
    if (!shopId) {
      return res.status(400).send(`
        <html>
          <head>
            <meta charset="utf-8">
            <title>Etsy Bağlantı Hatası</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; text-align: center; background: #f8fafc; color: #334155; }
              .card { max-width: 550px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1); border-top: 5px solid #ef4444; }
              h2 { color: #dc2626; margin-top: 0; font-size: 24px; font-weight: 700; }
              p { font-size: 16px; line-height: 1.6; color: #475569; }
              .info-box { background: #fdf2f2; padding: 20px; border-radius: 12px; text-align: left; font-size: 14px; margin: 25px 0; border: 1px solid #fee2e2; }
              .info-title { font-weight: 600; color: #991b1b; margin-bottom: 8px; }
              .info-text { color: #7f1d1d; line-height: 1.5; }
              .button { background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 15px; transition: background 0.2s; text-decoration: none; display: inline-block; }
              .button:hover { background: #4338ca; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Etsy Mağaza Kimliği Bulunamadı</h2>
              <p>Bağlanmaya çalıştığınız Etsy hesabı için aktif bir satıcı mağazası (shop_id) bulunamadı.</p>
              
              <div class="info-box">
                <div class="info-title">Olası Nedenler & Çözümler:</div>
                <div class="info-text">
                  1. <strong>Satıcı Mağazası Yok:</strong> Giriş yaptığınız Etsy hesabı sadece alıcı (buyer) hesabı olabilir. Bu uygulamayı kullanabilmek için Etsy satıcı mağazanızın açık ve aktif olması gerekir.<br><br>
                  2. <strong>Mağaza Kurulumu Tamamlanmamış:</strong> Eğer yeni bir mağaza açtıysanız, Etsy üzerinde en az bir adet listeleme (taslak olarak da olabilir) yayınlayarak ilk mağaza açılış işlemlerini tamamladığınızdan emin olun.<br><br>
                  3. <strong>Yanlış Hesapla Giriş:</strong> Tarayıcınızda halihazırda açık olan başka bir bireysel/alıcı Etsy hesabı ile oturum açılmış olabilir. Etsy.com'a gidip satıcı hesabınızla giriş yaptıktan sonra tekrar deneyin.
                </div>
              </div>
              
              <button onclick="window.close()" class="button">Pencereyi Kapat</button>
            </div>
          </body>
        </html>
      `);
    }
    
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    
    db.exec('BEGIN');
    try {
      // Deactivate other shops
      db.prepare('UPDATE etsy_auth SET is_active = 0').run();
      
      // Save/update this shop
      const authStmt = db.prepare(
        `INSERT INTO etsy_auth (shop_id, shop_name, access_token, refresh_token, expires_at, is_active) 
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(shop_id) DO UPDATE SET 
           shop_name = EXCLUDED.shop_name,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at,
           is_active = 1`
      );
      authStmt.run(shopId, shopName, access_token, refresh_token, expiresAt);
      
      // Self-heal: If there were records with 'default_shop', rename them to the connected shop_id
      const connectedShopsCount = db.prepare('SELECT COUNT(*) as count FROM etsy_auth WHERE shop_id != ?').get(shopId).count;
      if (connectedShopsCount === 0) {
        console.log(`First shop connected. Renaming default_shop records to ${shopId}...`);
        db.prepare("UPDATE settings SET shop_id = ? WHERE shop_id = 'default_shop'").run(shopId);
        db.prepare("UPDATE templates SET shop_id = ? WHERE shop_id = 'default_shop'").run(shopId);
        db.prepare("UPDATE variation_profiles SET shop_id = ? WHERE shop_id = 'default_shop'").run(shopId);
        db.prepare("UPDATE products SET shop_id = ? WHERE shop_id = 'default_shop'").run(shopId);
      }
      
      // Seed default variation profiles for new shop
      import('../db/db.js').then(dbMod => {
        dbMod.seedDefaultProfilesForShop(shopId);
      });
      
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
    
    // Clear the cache
    EtsyService.clearEtsyCache();
    
    // Redirect back to frontend
    res.send(`
      <html>
        <body>
          <h2>Etsy Connected Successfully: ${shopName}!</h2>
          <p>You can close this window now.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Callback Error:", err.response?.data || err.message);
    next(err);
  }
});

// 3. Connection Status
router.get('/status', async (req, res) => {
  try {
    const activeShop = getActiveShop();
    const allShops = db.prepare('SELECT shop_id, shop_name, is_active FROM etsy_auth').all();
    
    if (activeShop.shop_id === 'default_shop' || !activeShop.access_token) {
      return res.json({ 
        connected: false,
        activeShop: null,
        shops: allShops
      });
    }
    
    const expiresAt = new Date(activeShop.expires_at);
    const now = new Date();
    const isExpired = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000; // expired or within 5 min
    
    if (isExpired) {
      if (!activeShop.refresh_token) {
        return res.json({ connected: false, reason: 'no_refresh_token', shops: allShops });
      }
      try {
        console.log('[Status] Active shop token expired, attempting auto-refresh...');
        await EtsyService.getValidToken();
        
        // Re-read updated details
        const updatedActive = getActiveShop();
        const updatedShops = db.prepare('SELECT shop_id, shop_name, is_active FROM etsy_auth').all();
        
        return res.json({
          connected: true,
          activeShop: {
            shop_id: updatedActive.shop_id,
            shop_name: updatedActive.shop_name
          },
          shops: updatedShops,
          expires_at: updatedActive.expires_at
        });
      } catch (refreshErr) {
        console.error('[Status] getValidToken failed:', refreshErr.message);
        return res.json({ connected: false, reason: 'refresh_failed', error: refreshErr.message, shops: allShops });
      }
    }
    
    res.json({
      connected: true,
      activeShop: {
        shop_id: activeShop.shop_id,
        shop_name: activeShop.shop_name
      },
      shops: allShops,
      expires_at: activeShop.expires_at
    });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// 4. Switch Active Shop
router.post('/switch', (req, res, next) => {
  try {
    const { shopId } = req.body;
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }
    
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE etsy_auth SET is_active = 0').run();
      const stmt = db.prepare('UPDATE etsy_auth SET is_active = 1 WHERE shop_id = ?');
      const info = stmt.run(shopId);
      
      if (info.changes === 0) {
        db.exec('ROLLBACK');
        return res.status(404).json({ error: 'Shop not found' });
      }
      
      db.exec('COMMIT');
      console.log(`Active shop switched to: ${shopId}`);
      EtsyService.clearEtsyCache();
      res.json({ success: true, activeShopId: shopId });
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    next(err);
  }
});

// Disconnect Etsy Account (disconnect specific or current active shop)
router.post('/disconnect', (req, res, next) => {
  try {
    const { shopId } = req.body;
    const activeShop = getActiveShop();
    const targetShopId = shopId || activeShop.shop_id;
    
    if (targetShopId !== 'default_shop') {
      db.prepare('DELETE FROM etsy_auth WHERE shop_id = ?').run(targetShopId);
      
      // If we deleted the active shop, make another one active if any remains
      const currentActive = getActiveShop();
      if (currentActive.shop_id === 'default_shop') {
        const remaining = db.prepare('SELECT shop_id FROM etsy_auth LIMIT 1').get();
        if (remaining) {
          db.prepare('UPDATE etsy_auth SET is_active = 1 WHERE shop_id = ?').run(remaining.shop_id);
        }
      }
    }
    
    EtsyService.clearEtsyCache();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Clear Cache
router.post('/clear-cache', (req, res, next) => {
  try {
    EtsyService.clearEtsyCache();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 4. Shop Sections
router.get('/shop-sections', async (req, res, next) => {
  try {
    const sections = await EtsyService.getShopSections();
    res.json(sections);
  } catch (err) {
    next(err);
  }
});

// Create Shop Section
router.post('/shop-sections', async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Bölüm başlığı gereklidir.' });
    }
    const section = await EtsyService.createShopSection(title);
    res.json(section);
  } catch (err) {
    next(err);
  }
});

// 5. Shipping Profiles
router.get('/shipping-profiles', async (req, res, next) => {
  try {
    const profiles = await EtsyService.getShippingProfiles();
    res.json(profiles);
  } catch (err) {
    next(err);
  }
});

// 6. Return Policies
router.get('/return-policies', async (req, res, next) => {
  try {
    const policies = await EtsyService.getReturnPolicies();
    res.json(policies);
  } catch (err) {
    next(err);
  }
});

// 8. Readiness States (Ready to ship / Processing profiles)
router.get('/readiness-states', async (req, res, next) => {
  try {
    const states = await EtsyService.getReadinessStates();
    res.json(states);
  } catch (err) {
    next(err);
  }
});

// 7. Upload Product to Etsy
router.post('/upload-listing', async (req, res, next) => {
  try {
    const { productId, shipping_profile_id: overrideShipping, return_policy_id: overrideReturn, shop_section_id: overrideSection, listing_state: overrideState } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }
    
    const activeShop = getActiveShop();
    
    // 1. Fetch product details
    const productStmt = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?');
    const product = productStmt.get(productId, activeShop.shop_id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // 2. Fetch global defaults from settings
    const settingsStmt = db.prepare('SELECT * FROM settings WHERE shop_id = ?');
    const settingsRows = settingsStmt.all(activeShop.shop_id);
    const settings = {};
    settingsRows.forEach(s => {
      settings[s.key] = JSON.parse(s.value);
    });
    
    const taxonomy_id = settings.default_taxonomy_id || 1027; // wall decor default
    const who_made = settings.default_who_made || 'i_did';
    const when_made = settings.default_when_made || 'made_to_order';
    
    // Prioritize request overrides, then fallback to global settings
    const shipping_profile_id = overrideShipping || settings.default_shipping_profile_id;
    const return_policy_id = overrideReturn || settings.default_return_policy_id;
    const state = overrideState || settings.default_listing_state || 'draft';
    const readiness_state_id = req.body.readiness_state_id || settings.default_readiness_state_id;
    
    // Prioritize product-specific section, then request override, then global settings
    const shop_section_id = product.shop_section_id || overrideSection || settings.default_shop_section_id;
    
    if (!shipping_profile_id) {
      return res.status(400).json({ error: 'Kargo şablonu (shipping profile) seçilmedi. Lütfen genel ayarlardan veya toplu yükleme sihirbazından bir kargo şablonu belirtin.' });
    }
    
    // 3. Mark product as uploading in DB
    const updateStatus = db.prepare('UPDATE products SET status = ? WHERE id = ? AND shop_id = ?');
    updateStatus.run('uploading', productId, activeShop.shop_id);
    
    // 4. Create listing on Etsy
    // Gather tags and attributes
    const tags = product.tags ? JSON.parse(product.tags) : [];
    
    // Clean listing price (use average from variation profile or default price)
    let fallbackPrice = settings.default_price || 35.00;
    let variationProfile = null;
    
    if (product.variation_profile_id) {
      const profileStmt = db.prepare('SELECT * FROM variation_profiles WHERE id = ? AND shop_id = ?');
      const profileRow = profileStmt.get(product.variation_profile_id, activeShop.shop_id);
      if (profileRow) {
        variationProfile = {
          ...profileRow,
          combinations: JSON.parse(profileRow.combinations)
        };
        // Find minimum price from combinations
        if (variationProfile.combinations.length > 0) {
          const prices = variationProfile.combinations.map(c => Number(c.price)).filter(p => !isNaN(p));
          if (prices.length > 0) {
            fallbackPrice = Math.min(...prices);
          }
        }
      }
    }
    
    const boilerplate = settings.description_boilerplate || '';
    const rawDescription = product.description || 'Stunning printed wall art.';
    const finalDescription = boilerplate 
      ? `${rawDescription}\n\n${boilerplate}`
      : rawDescription;

    const listingData = {
      title: product.title ? product.title.substring(0, 140) : 'Untitled Art',
      description: finalDescription,
      price: fallbackPrice,
      quantity: 100,
      who_made,
      when_made,
      taxonomy_id: Number(taxonomy_id),
      state,
      type: 'physical',
      should_auto_renew: settings.auto_renew !== undefined ? settings.auto_renew : true
    };

    if (shipping_profile_id) listingData.shipping_profile_id = Number(shipping_profile_id);
    if (return_policy_id) listingData.return_policy_id = Number(return_policy_id);

    // Add Materials if enabled (default to true and ['Canvas', 'Paper', 'Cotton', 'Wood', 'Fabric'] if not saved in settings)
    const materialsEnabled = settings.attribute_materials_enabled !== undefined ? settings.attribute_materials_enabled : true;
    const materialsList = settings.attribute_materials !== undefined ? settings.attribute_materials : ['Canvas', 'Paper', 'Cotton', 'Wood', 'Fabric'];

    if (materialsEnabled && materialsList && materialsList.length > 0) {
      listingData.materials = materialsList
        .map(m => m.replace(/[^\p{L}\p{N}\p{Zs}]/gu, '').trim())
        .filter(m => m.length > 0)
        .slice(0, 13);
    }

    // Add Width & Height if enabled
    if (settings.attribute_width_enabled && settings.attribute_width) {
      listingData.item_width = Number(settings.attribute_width);
      listingData.item_dimensions_unit = settings.attribute_width_unit === 'Inches' ? 'in' : 'cm';
    }
    if (settings.attribute_height_enabled && settings.attribute_height) {
      listingData.item_height = Number(settings.attribute_height);
      listingData.item_dimensions_unit = settings.attribute_height_unit === 'Inches' ? 'in' : 'cm';
    }

    if (!readiness_state_id) {
      return res.status(400).json({ error: 'Fiziksel ürünler için hazırlık profili (readiness state) seçilmelidir. Lütfen genel ayarlardan veya kargo tabından varsayılan bir hazırlık profili belirtin.' });
    }
    listingData.readiness_state_id = Number(readiness_state_id);
    
    if (shop_section_id) {
      listingData.shop_section_id = shop_section_id;
    }
    if (tags.length > 0) {
      listingData.tags = tags
        .map(t => t.trim().substring(0, 20))
        .filter(t => t.length > 0)
        .slice(0, 13);
    }
    
    console.log(`Creating draft listing on Etsy for product ${productId}...`);
    const createdListing = await EtsyService.createListing(listingData);
    const listing_id = createdListing.listing_id;
    
    // Update taxonomy properties
    try {
      // 1. Home Style
      if (settings.attribute_home_style_enabled && settings.attribute_home_style) {
        const valId = STYLE_MAPPING[settings.attribute_home_style];
        if (valId) {
          console.log(`Setting Home Style attribute to ${settings.attribute_home_style} (ID: ${valId})...`);
          await EtsyService.updateListingProperty(listing_id, 145330288652, {
            value_ids: [valId],
            values: [settings.attribute_home_style]
          });
        }
      }

      // 2. Occasion
      if (settings.attribute_occasion_enabled && settings.attribute_occasion) {
        const valId = OCCASION_MAPPING[settings.attribute_occasion];
        if (valId) {
          console.log(`Setting Occasion attribute to ${settings.attribute_occasion} (ID: ${valId})...`);
          await EtsyService.updateListingProperty(listing_id, 46803063641, {
            value_ids: [valId],
            values: [settings.attribute_occasion]
          });
        }
      }

      // 3. Holiday
      if (settings.attribute_holiday_enabled && settings.attribute_holiday) {
        const valId = HOLIDAY_MAPPING[settings.attribute_holiday];
        if (valId) {
          console.log(`Setting Holiday attribute to ${settings.attribute_holiday} (ID: ${valId})...`);
          await EtsyService.updateListingProperty(listing_id, 46803063659, {
            value_ids: [valId],
            values: [settings.attribute_holiday]
          });
        }
      }

      // 4. Room
      if (settings.attribute_room_enabled && settings.attribute_rooms && settings.attribute_rooms.length > 0) {
        const valIds = settings.attribute_rooms
          .map(r => ROOM_MAPPING[r])
          .filter(id => id !== undefined);
        const values = settings.attribute_rooms
          .filter(r => ROOM_MAPPING[r] !== undefined);
          
        if (valIds.length > 0) {
          console.log(`Setting Room attributes to ${values.join(', ')}...`);
          await EtsyService.updateListingProperty(listing_id, 145330288592, {
            value_ids: valIds,
            values: values
          });
        }
      }

      // 5. Materials (ID: 148789511893)
      if (settings.attribute_materials_enabled && settings.attribute_materials && settings.attribute_materials.length > 0) {
        const valIds = settings.attribute_materials
          .map(m => MATERIALS_MAPPING[m])
          .filter(id => id !== undefined);
        const values = settings.attribute_materials
          .filter(m => MATERIALS_MAPPING[m] !== undefined);
          
        if (valIds.length > 0) {
          console.log(`Setting Materials attributes to ${values.join(', ')}...`);
          await EtsyService.updateListingProperty(listing_id, 148789511893, {
            value_ids: valIds,
            values: values
          });
        }
      }
    } catch (attrErr) {
      console.warn("Failed to set taxonomy properties for listing:", attrErr.response?.data || attrErr.message);
    }
    
    // 5. Upload generated mockups
    const shopId = product ? product.shop_id : activeShop.shop_id;
    const shopName = getShopStorageName(shopId);
    let mockupsDir = join(__dirname, '../..', 'storage', shopName, 'mockups', productId);
    if (!fs.existsSync(mockupsDir)) {
      mockupsDir = join(__dirname, '../..', 'storage/mockups', productId);
    }
    
    let uploadedMockups = false;
    if (fs.existsSync(mockupsDir)) {
      const files = fs.readdirSync(mockupsDir).filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg') || f.toLowerCase().endsWith('.png'));
      if (files.length > 0) {
        console.log(`Uploading ${files.length} mockup images to Etsy for listing ${listing_id}...`);
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = join(mockupsDir, file);
          await EtsyService.uploadListingImage(listing_id, filePath, i + 1, product.title);
        }
        uploadedMockups = true;
      }
    }
    
    if (!uploadedMockups) {
      console.log(`No mockup folder or images found. Uploading original image for listing ${listing_id}...`);
      const originalPath = join(__dirname, '../..', product.image_path);
      await EtsyService.uploadListingImage(listing_id, originalPath, 1, product.title);
    }
    
    // 6. Setup variations inventory (if variation profile is set)
    if (variationProfile && variationProfile.combinations && variationProfile.combinations.length > 0) {
      console.log(`Configuring variations for listing ${listing_id}...`);
      
      const hasFrames = variationProfile.frames && variationProfile.frames.length > 0;
      const validCombs = variationProfile.combinations.filter(c => 
        c.size && !isNaN(Number(c.price)) && (hasFrames ? c.frame : true)
      );
      
      if (validCombs.length > 0) {
        const productsList = validCombs.map((comb, index) => {
          const property_values = [
            {
              property_id: 513, // Custom1 (Dimensions)
              property_name: "Dimensions",
              value_ids: [],
              values: [comb.size]
            }
          ];
          
          if (hasFrames && comb.frame) {
            property_values.push({
              property_id: 514, // Custom2 (Frame)
              property_name: "Frame",
              value_ids: [],
              values: [comb.frame]
            });
          }
          
          // Generate SKU (max 32 characters for Etsy)
          const cleanSize = comb.size.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
          const cleanFrame = comb.frame ? comb.frame.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) : 'NONE';
          const prodPrefix = productId.substring(0, 6).toUpperCase();
          const sku = `ART-${prodPrefix}-${cleanSize}-${cleanFrame}`.toUpperCase();
          
          return {
            sku,
            property_values,
            offerings: [
              {
                price: Number(comb.price),
                quantity: 100,
                is_enabled: true,
                readiness_state_id: listingData.type === 'physical' ? Number(readiness_state_id) : null
              }
            ]
          };
        });
        
        const price_on_property = [513];
        const sku_on_property = [513];
        if (hasFrames) {
          price_on_property.push(514);
          sku_on_property.push(514);
        }
        
        const inventoryData = {
          products: productsList,
          price_on_property,
          quantity_on_property: [],
          sku_on_property
        };
        
        try {
          await EtsyService.updateListingInventory(listing_id, inventoryData);
          console.log(`Successfully uploaded ${productsList.length} variation combinations to Etsy for listing ${listing_id}!`);
        } catch (invErr) {
          console.error(`Failed to upload variations to Etsy for listing ${listing_id}:`, invErr.response?.data || invErr.message);
        }
      }
    }
    // 7. Update status to live in DB
    const updateSuccess = db.prepare(
      'UPDATE products SET status = ?, etsy_listing_id = ? WHERE id = ? AND shop_id = ?'
    );
    updateSuccess.run('live', listing_id.toString(), productId, activeShop.shop_id);
    
    res.json({
      success: true,
      listing_id,
      url: `https://www.etsy.com/listing/${listing_id}`
    });
  } catch (err) {
    console.error("Etsy Upload Error:", err.response?.data || err.message);
    
    // Revert status to error in DB
    if (req.body.productId) {
      const activeShop = getActiveShop();
      const updateError = db.prepare('UPDATE products SET status = ? WHERE id = ? AND shop_id = ?');
      updateError.run('error', req.body.productId, activeShop.shop_id);
    }
    
    next(err);
  }
});

const listingsCache = {
  data: {}
};

async function getFullListingsForShopState(shop_id, state, access_token, client_id, client_secret) {
  const cacheKey = `${shop_id}_${state || 'active'}`;
  const now = Date.now();
  if (listingsCache.data[cacheKey] && (now - listingsCache.data[cacheKey].timestamp < 3 * 60 * 1000)) {
    return listingsCache.data[cacheKey].listings;
  }

  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`;
  const headers = {
    'x-api-key': `${client_id}:${client_secret}`,
    'Authorization': `Bearer ${access_token}`
  };

  const firstRes = await axios.get(url, {
    params: { state: state || 'active', limit: 100, offset: 0, includes: 'images' },
    headers
  });

  const totalCount = firstRes.data.count || 0;
  const allListings = [...(firstRes.data.results || [])];

  if (totalCount > 100) {
    const promises = [];
    for (let offset = 100; offset < totalCount; offset += 100) {
      promises.push(
        axios.get(url, {
          params: { state: state || 'active', limit: 100, offset, includes: 'images' },
          headers
        })
      );
    }
    const pageResponses = await Promise.all(promises);
    pageResponses.forEach(r => {
      if (r.data?.results) {
        allListings.push(...r.data.results);
      }
    });
  }

  listingsCache.data[cacheKey] = {
    timestamp: now,
    listings: allListings
  };

  return allListings;
}

// Get listings from Etsy for the active shop
router.get('/listings', async (req, res, next) => {
  try {
    const { state, limit, offset, shop_section_ids } = req.query;
    const { access_token, client_id, client_secret, shop_id } = await EtsyService.getValidToken();
    const limitNum = Number(limit) || 50;
    const offsetNum = Number(offset) || 0;

    if (shop_section_ids) {
      const allListings = await getFullListingsForShopState(shop_id, state, access_token, client_id, client_secret);
      const filtered = allListings.filter(l => l.shop_section_id && l.shop_section_id.toString() === shop_section_ids.toString());
      return res.json({
        count: filtered.length,
        results: filtered.slice(offsetNum, offsetNum + limitNum)
      });
    }

    const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`;
    const response = await axios.get(url, {
      params: {
        state: state || 'active',
        limit: limitNum,
        offset: offsetNum,
        includes: 'images'
      },
      headers: {
        'x-api-key': `${client_id}:${client_secret}`,
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    res.json(response.data);
  } catch (err) {
    console.error("Failed to fetch listings from Etsy:", err.response?.data || err.message);
    next(err);
  }
});

// Get listing details and local mockups
router.get('/listings/:listingId/details', async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const activeShop = getActiveShop();
    
    // Find local product by etsy_listing_id
    const stmt = db.prepare('SELECT * FROM products WHERE etsy_listing_id = ? OR etsy_listing_id = ? OR etsy_listing_id = ?');
    const product = stmt.get(listingId, listingId + '.0', Number(listingId).toString());
    
    let mockups = [];
    if (product) {
      const shopId = product.shop_id || activeShop.shop_id;
      const shopName = getShopStorageName(shopId);
      let mockupsDir = join(__dirname, '../..', 'storage', shopName, 'mockups', product.id);
      if (!fs.existsSync(mockupsDir)) {
        mockupsDir = join(__dirname, '../..', 'storage/mockups', product.id);
      }
      
      if (fs.existsSync(mockupsDir)) {
        const files = fs.readdirSync(mockupsDir).filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg') || f.toLowerCase().endsWith('.png'));
        const hasShopDir = fs.existsSync(join(__dirname, '../..', 'storage', shopName, 'mockups', product.id));
        mockups = files.map(file => ({
          filename: file,
          url: hasShopDir 
            ? `http://localhost:3001/storage/${shopName}/mockups/${product.id}/${file}`
            : `http://localhost:3001/storage/mockups/${product.id}/${file}`
        }));
      }
    }
    
    res.json({
      productId: product ? product.id : null,
      localProduct: product || null,
      mockups: mockups
    });
  } catch (err) {
    next(err);
  }
});

// Batch update materials for multiple listings on Etsy
router.post('/listings/batch-materials', async (req, res, next) => {
  try {
    const { listingIds, materials } = req.body;
    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'listingIds dizisi gereklidir.' });
    }
    if (!materials || !Array.isArray(materials)) {
      return res.status(400).json({ error: 'materials dizisi gereklidir.' });
    }

    const activeShop = getActiveShop();

    const cleanMaterials = materials
      .map(m => m.replace(/[^\p{L}\p{N}\p{Zs}]/gu, '').trim())
      .filter(m => m.length > 0)
      .slice(0, 13);

    console.log(`Batch updating materials to [${cleanMaterials.join(', ')}] for ${listingIds.length} listings...`);

    const results = [];
    for (const listingId of listingIds) {
      try {
        await EtsyService.updateListing(listingId, { materials: cleanMaterials });
        results.push({ listingId, success: true });
      } catch (err) {
        console.error(`Failed to update materials for listing ${listingId}:`, err.response?.data || err.message);
        results.push({ listingId, success: false, error: err.response?.data?.error || err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

// Update a single listing on Etsy
router.post('/listings/:listingId/update', async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const { title, description, tags, materials, shop_section_id } = req.body;
    
    const activeShop = getActiveShop();
    const checkProduct = db.prepare('SELECT id, title, tags, description, shop_section_id FROM products WHERE etsy_listing_id = ? OR etsy_listing_id = ? OR etsy_listing_id = ?');
    const product = checkProduct.get(listingId, listingId + '.0', Number(listingId).toString());

    const updateData = {};
    if (title !== undefined) updateData.title = title.substring(0, 140);
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined && Array.isArray(tags)) {
      updateData.tags = tags.map(t => t.trim().substring(0, 20)).filter(t => t.length > 0).slice(0, 13);
    }
    if (materials !== undefined && Array.isArray(materials)) {
      updateData.materials = materials.map(m => m.replace(/[^\p{L}\p{N}\p{Zs}]/gu, '').trim()).filter(m => m.length > 0).slice(0, 13);
    }
    if (shop_section_id !== undefined) {
      updateData.shop_section_id = shop_section_id || null;
    }

    console.log(`Updating listing ${listingId} on Etsy...`, updateData);
    const updated = await EtsyService.updateListing(listingId, updateData);
    
    // If there is a local product, also update it in SQLite!
    if (product) {
      const updateStmt = db.prepare(
        'UPDATE products SET title = ?, tags = ?, description = ?, shop_section_id = ? WHERE id = ? AND shop_id = ?'
      );
      updateStmt.run(
        title !== undefined ? title : product.title, 
        tags !== undefined ? JSON.stringify(tags) : product.tags, 
        description !== undefined ? description : product.description, 
        shop_section_id !== undefined ? (shop_section_id || null) : product.shop_section_id,
        product.id,
        activeShop.shop_id
      );
    }
    
    res.json({ success: true, updated });
  } catch (err) {
    console.error("Etsy Update Error:", err.response?.data || err.message);
    next(err);
  }
});

// Batch update variation profile for multiple listings on Etsy and update SQLite
router.post('/listings/batch-variation-profile', async (req, res, next) => {
  try {
    const { listingIds, variation_profile_id } = req.body;
    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      return res.status(400).json({ error: 'listingIds dizisi gereklidir.' });
    }
    if (!variation_profile_id) {
      return res.status(400).json({ error: 'variation_profile_id gereklidir.' });
    }

    const activeShop = getActiveShop();
    
    // Fetch variation profile from DB
    const profileStmt = db.prepare('SELECT * FROM variation_profiles WHERE id = ? AND shop_id = ?');
    let profileRow = profileStmt.get(variation_profile_id, activeShop.shop_id);
    if (!profileRow) {
      // Fallback check default shop
      profileRow = profileStmt.get(variation_profile_id, 'default_shop');
    }
    if (!profileRow) {
      return res.status(404).json({ error: 'Seçilen varyasyon profili bulunamadı.' });
    }

    const variationProfile = {
      ...profileRow,
      sizes: profileRow.sizes ? JSON.parse(profileRow.sizes) : [],
      frames: profileRow.frames ? JSON.parse(profileRow.frames) : [],
      combinations: profileRow.combinations ? JSON.parse(profileRow.combinations) : []
    };

    const hasFrames = variationProfile.frames && variationProfile.frames.length > 0;
    const validCombs = variationProfile.combinations.filter(c => 
      c.size && !isNaN(Number(c.price)) && (hasFrames ? c.frame : true)
    );

    if (validCombs.length === 0) {
      return res.status(400).json({ error: 'Seçilen profil geçerli varyasyon kombinasyonları içermiyor.' });
    }

    // Retrieve readiness state ID
    let readiness_state_id = null;
    const settingsStmt = db.prepare('SELECT * FROM settings WHERE shop_id = ?');
    const settingsRows = settingsStmt.all(activeShop.shop_id);
    const settings = {};
    settingsRows.forEach(s => {
      try { settings[s.key] = JSON.parse(s.value); } catch (e) { settings[s.key] = s.value; }
    });

    if (settings.default_readiness_state_id) {
      readiness_state_id = Number(settings.default_readiness_state_id);
    } else {
      try {
        const states = await EtsyService.getReadinessStates();
        if (states && states.length > 0) {
          readiness_state_id = Number(states[0].readiness_state_id);
        }
      } catch (rErr) {
        console.error("Failed to fetch default readiness states:", rErr.message);
      }
    }

    // 1. Update local DB for all items
    const updateStmt = db.prepare('UPDATE products SET variation_profile_id = ? WHERE (id = ? OR etsy_listing_id = ?) AND shop_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO products (id, shop_id, etsy_listing_id, variation_profile_id, status)
      VALUES (?, ?, ?, ?, 'live')
    `);
    const checkStmt = db.prepare('SELECT id FROM products WHERE (id = ? OR etsy_listing_id = ?) AND shop_id = ?');

    const { v4: uuidv4 } = await import('uuid');

    for (const id of listingIds) {
      const idStr = id.toString();
      const existing = checkStmt.get(idStr, idStr, activeShop.shop_id);
      if (existing) {
        updateStmt.run(variation_profile_id, idStr, idStr, activeShop.shop_id);
      } else {
        insertStmt.run(uuidv4(), activeShop.shop_id, idStr, variation_profile_id);
      }
    }

    // 2. Push variation inventory to Etsy for each listing
    console.log(`Pushing variation profile ${variation_profile_id} to ${listingIds.length} Etsy listings (readiness_state_id: ${readiness_state_id})...`);
    const results = [];

    for (const listingId of listingIds) {
      const listingIdStr = listingId.toString();
      const productsList = validCombs.map((comb) => {
        const property_values = [
          {
            property_id: 513, // Custom1 (Dimensions)
            property_name: "Dimensions",
            value_ids: [],
            values: [comb.size]
          }
        ];
        
        if (hasFrames && comb.frame) {
          property_values.push({
            property_id: 514, // Custom2 (Frame)
            property_name: "Frame",
            value_ids: [],
            values: [comb.frame]
          });
        }
        
        const cleanSize = comb.size.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
        const cleanFrame = comb.frame ? comb.frame.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) : 'NONE';
        const prodPrefix = listingIdStr.substring(0, 6).toUpperCase();
        const sku = `ART-${prodPrefix}-${cleanSize}-${cleanFrame}`.toUpperCase();
        
        const offeringObj = {
          price: Number(comb.price),
          quantity: 100,
          is_enabled: true
        };
        if (readiness_state_id) {
          offeringObj.readiness_state_id = readiness_state_id;
        }

        return {
          sku,
          property_values,
          offerings: [offeringObj]
        };
      });
      
      const price_on_property = [513];
      const sku_on_property = [513];
      if (hasFrames) {
        price_on_property.push(514);
        sku_on_property.push(514);
      }
      
      const inventoryData = {
        products: productsList,
        price_on_property,
        quantity_on_property: [],
        sku_on_property
      };

      try {
        await EtsyService.updateListingInventory(listingIdStr, inventoryData);
        console.log(`Successfully updated variations on Etsy for listing ${listingIdStr}!`);
        results.push({ listingId: listingIdStr, success: true });
      } catch (invErr) {
        const errMsg = invErr.response?.data?.error || invErr.response?.data || invErr.message;
        console.error(`Failed to update variations on Etsy for listing ${listingIdStr}:`, errMsg);
        results.push({ listingId: listingIdStr, success: false, error: errMsg });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error("Batch variation profile error:", err);
    next(err);
  }
});

export default router;
