import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import axios from 'axios';

async function testListingIncludes() {
  try {
    const auth = await getValidToken();
    console.log('Testing Etsy listings with includes=images...');

    const url = `https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/listings/active?limit=5&includes=images`;
    const res = await axios.get(url, {
      headers: {
        'x-api-key': `${auth.client_id}:${auth.client_secret}`,
        'Authorization': `Bearer ${auth.access_token}`
      }
    });

    const results = res.data.results || [];
    console.log('Results count:', results.length);
    if (results.length > 0) {
      console.log('Sample listing keys:', Object.keys(results[0]));
      console.log('Sample listing images:', JSON.stringify(results[0].images, null, 2));
      console.log('Sample transaction_sell_count:', results[0].transaction_sell_count);
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testListingIncludes();
