import 'dotenv/config';
import { evaluateListingAI } from '../services/KimiService.js';
import * as EtsyService from '../services/EtsyService.js';
import db from '../db/db.js';
import axios from 'axios';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testSyncAndAI() {
  try {
    const auth = await EtsyService.getValidToken();
    console.log("Starting test sync for shop:", auth.shop_id);

    const url = `https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/listings/active?limit=5`;
    const response = await axios.get(url, {
      headers: {
        'x-api-key': `${auth.client_id}:${auth.client_secret}`,
        'Authorization': `Bearer ${auth.access_token}`
      }
    });

    const listings = response.data.results || [];
    console.log(`Fetched ${listings.length} listings for test.`);

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
        price_amount = excluded.price_amount,
        last_synced_at = CURRENT_TIMESTAMP
    `);

    listings.forEach(l => {
      const priceVal = l.price ? (l.price.amount / l.price.divisor) : 0;
      upsertStmt.run(
        String(l.listing_id),
        auth.shop_id,
        l.title || '',
        l.state || 'active',
        l.views || 0,
        l.num_favorers || 0,
        0,
        0,
        priceVal,
        'USD',
        l.quantity || 0,
        l.creation_timestamp || 0,
        l.original_creation_timestamp || l.creation_timestamp || 0,
        l.url || '',
        '',
        2500,
        2500,
        JSON.stringify(l.tags || []),
        '',
        'Test Section'
      );
    });

    console.log("Cached listings in DB successfully!");

    // Test AI Evaluation on 1 listing
    const firstListing = listings[0];
    const listingObj = {
      listing_id: String(firstListing.listing_id),
      title: firstListing.title,
      section_title: 'Test Section',
      age_days: 30,
      views: firstListing.views,
      num_favorers: firstListing.num_favorers,
      sales_count: 0,
      total_revenue: 0,
      price_amount: firstListing.price ? (firstListing.price.amount / firstListing.price.divisor) : 80,
      quantity: firstListing.quantity,
      tags: firstListing.tags || [],
      image_width: 2500,
      image_height: 2500,
      is_high_res: true
    };

    const csvPath = join(__dirname, '../../storage/optimization_memory.csv');
    const memoryText = fs.readFileSync(csvPath, 'utf8');

    console.log("\nTesting evaluateListingAI call...");
    const res = await evaluateListingAI(listingObj, memoryText);
    console.log("AI Result:", JSON.stringify(res, null, 2));

    // Append to CSV
    const csvLine = `"${listingObj.listing_id}","${listingObj.title.replace(/,/g, ' ')}","Test Section","${(listingObj.tags || []).slice(0, 5).join(';')}","${res.ai_short_note}","${res.action}","${new Date().toISOString()}"\n`;
    fs.appendFileSync(csvPath, csvLine, 'utf8');

    console.log("Memory CSV content after AI evaluation:\n", fs.readFileSync(csvPath, 'utf8'));

  } catch (err) {
    console.error("Test Error:", err);
  }
}

testSyncAndAI();
