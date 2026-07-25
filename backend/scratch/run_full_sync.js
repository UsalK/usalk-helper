import 'dotenv/config';
import * as EtsyService from '../services/EtsyService.js';
import db from '../db/db.js';
import axios from 'axios';

async function fullSync() {
  console.log("=== EXECUTING FULL ANALYTICS SYNC WITH IMAGES & RESOLUTIONS ===");
  try {
    const auth = await EtsyService.getValidToken();
    const shopId = auth.shop_id;

    let sectionsMap = {};
    try {
      const sections = await EtsyService.getShopSections();
      if (Array.isArray(sections)) {
        sections.forEach(s => { sectionsMap[s.shop_section_id] = s.title; });
      }
    } catch (e) {}

    let allListings = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}`;
      const res = await axios.get(url, {
        headers: {
          'x-api-key': `${auth.client_id}:${auth.client_secret}`,
          'Authorization': `Bearer ${auth.access_token}`
        }
      });
      const results = res.data.results || [];
      allListings.push(...results);
      if (allListings.length >= res.data.count || results.length === 0) break;
      offset += limit;
    }

    console.log(`Retrieved ${allListings.length} total listings. Fetching images in batch...`);

    const imageMap = {};
    const batchSize = 50;
    for (let i = 0; i < allListings.length; i += batchSize) {
      const batchListings = allListings.slice(i, i + batchSize);
      const batchIds = batchListings.map(l => l.listing_id).join(',');
      try {
        const batchUrl = `https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${batchIds}&includes=images`;
        const batchRes = await axios.get(batchUrl, {
          headers: {
            'x-api-key': `${auth.client_id}:${auth.client_secret}`,
            'Authorization': `Bearer ${auth.access_token}`
          }
        });
        const batchResults = batchRes.data.results || [];
        batchResults.forEach(item => {
          if (item.images && item.images.length > 0) {
            const firstImg = item.images[0];
            imageMap[item.listing_id] = {
              url: firstImg.url_570xN || firstImg.url_170x135 || '',
              width: firstImg.full_width || 0,
              height: firstImg.full_height || 0
            };
          }
        });
        console.log(`Processed batch ${Math.min(i + batchSize, allListings.length)}/${allListings.length}`);
      } catch (err) {
        console.warn(`Batch error:`, err.message);
      }
    }

    const upsertStmt = db.prepare(`
      INSERT INTO etsy_analytics_cache (
        listing_id, shop_id, title, state, views, num_favorers, sales_count, total_revenue,
        price_amount, currency_code, quantity, creation_timestamp, original_creation_timestamp,
        url, image_url, image_width, image_height, tags, shop_section_id, section_title, last_synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      ) ON CONFLICT(listing_id) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
        views = excluded.views,
        num_favorers = excluded.num_favorers,
        sales_count = excluded.sales_count,
        total_revenue = excluded.total_revenue,
        price_amount = excluded.price_amount,
        currency_code = excluded.currency_code,
        quantity = excluded.quantity,
        creation_timestamp = excluded.creation_timestamp,
        original_creation_timestamp = excluded.original_creation_timestamp,
        url = excluded.url,
        image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE etsy_analytics_cache.image_url END,
        image_width = CASE WHEN excluded.image_width > 0 THEN excluded.image_width ELSE etsy_analytics_cache.image_width END,
        image_height = CASE WHEN excluded.image_height > 0 THEN excluded.image_height ELSE etsy_analytics_cache.image_height END,
        tags = excluded.tags,
        shop_section_id = excluded.shop_section_id,
        section_title = excluded.section_title,
        last_synced_at = CURRENT_TIMESTAMP
    `);

    db.exec('BEGIN');
    allListings.forEach(l => {
      const priceVal = l.price ? (l.price.amount / l.price.divisor) : 0;
      const currency = l.price ? l.price.currency_code : 'USD';
      const sectionTitle = l.shop_section_id ? (sectionsMap[l.shop_section_id] || 'Seksiyon Yok') : 'Seksiyon Yok';
      const imgData = imageMap[l.listing_id] || { url: '', width: 0, height: 0 };

      const salesCount = l.transaction_sell_count || 0;
      const totalRevenue = salesCount * priceVal;


      upsertStmt.run(
        String(l.listing_id),
        shopId,
        l.title || '',
        l.state || 'active',
        l.views || 0,
        l.num_favorers || 0,
        salesCount,
        totalRevenue,
        priceVal,
        currency,
        l.quantity || 0,
        l.creation_timestamp || 0,
        l.original_creation_timestamp || l.creation_timestamp || 0,
        l.url || '',
        imgData.url,
        imgData.width,
        imgData.height,
        JSON.stringify(l.tags || []),
        l.shop_section_id ? String(l.shop_section_id) : '',
        sectionTitle
      );
    });
    db.exec('COMMIT');

    console.log("=== FULL SYNC COMPLETED SUCCESSFULLY ===");
    
    // Sample check
    const sample = db.prepare("SELECT listing_id, title, image_url, image_width, image_height, sales_count, total_revenue FROM etsy_analytics_cache WHERE image_url != '' LIMIT 3").all();
    console.log("Sample synced items:", JSON.stringify(sample, null, 2));

  } catch (err) {
    console.error("Full Sync Error:", err);
  }
}

fullSync();
