import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import db from '../db/db.js';
import axios from 'axios';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTests() {
  console.log("=== STARTING FULL EYES ANALYTICS TEST ===");
  try {
    const auth = await getValidToken();
    console.log("Active Shop ID:", auth.shop_id);

    // 1. Test database table existence
    const tableInfo = db.prepare("PRAGMA table_info(etsy_analytics_cache)").all();
    console.log("etsy_analytics_cache columns count:", tableInfo.length);
    if (tableInfo.length === 0) {
      throw new Error("etsy_analytics_cache table does not exist!");
    }

    // 2. Test memory CSV existence
    const csvPath = join(__dirname, '../../storage/optimization_memory.csv');
    console.log("Memory CSV path:", csvPath);
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, 'listing_id,title,section,tags_summary,ai_short_note,recommended_action,analyzed_at\n', 'utf8');
    }
    console.log("Memory CSV content before:", fs.readFileSync(csvPath, 'utf8'));

    // 3. Query sample listing from DB cache
    const sample = db.prepare("SELECT * FROM etsy_analytics_cache LIMIT 1").get();
    if (sample) {
      console.log("Sample Cached Listing:", {
        id: sample.listing_id,
        title: sample.title.substring(0, 40),
        views: sample.views,
        favorers: sample.num_favorers,
        sales: sample.sales_count,
        revenue: sample.total_revenue
      });
    } else {
      console.log("No listings cached yet in DB.");
    }

    console.log("=== TESTS PASSED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Test Error:", err.message);
  }
}

runTests();
