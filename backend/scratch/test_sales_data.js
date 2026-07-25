import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import axios from 'axios';

async function testSales() {
  try {
    const auth = await getValidToken();
    console.log("Checking sales for shop:", auth.shop_id);

    // Test 1: Fetch listing details for known sold listings (e.g. 4504346627 or 4510266938)
    const testIds = [4504346627, 4510266938];
    for (const id of testIds) {
      try {
        const res = await axios.get(`https://openapi.etsy.com/v3/application/listings/${id}`, {
          headers: {
            'x-api-key': `${auth.client_id}:${auth.client_secret}`,
            'Authorization': `Bearer ${auth.access_token}`
          }
        });
        console.log(`Listing #${id}:`, {
          title: res.data.title?.substring(0, 30),
          views: res.data.views,
          favorers: res.data.num_favorers,
          quantity: res.data.quantity,
          transaction_sell_count: res.data.transaction_sell_count
        });
      } catch (e) {
        console.log(`Error for ${id}:`, e.message);
      }
    }

  } catch (err) {
    console.error("Error:", err.message);
  }
}

testSales();
