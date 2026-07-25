import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import axios from 'axios';

async function checkCapabilities() {
  try {
    const auth = await getValidToken();
    console.log('Shop ID:', auth.shop_id);

    // Test Receipts (Orders/Sales)
    try {
      const receiptsRes = await axios.get(`https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/receipts?limit=10`, {
        headers: {
          'x-api-key': `${auth.client_id}:${auth.client_secret}`,
          'Authorization': `Bearer ${auth.access_token}`
        }
      });
      console.log('Receipts Count/Total:', receiptsRes.data.count);
      if (receiptsRes.data.results && receiptsRes.data.results.length > 0) {
        console.log('Sample Receipt Keys:', Object.keys(receiptsRes.data.results[0]));
      }
    } catch (e) {
      console.log('Receipts fetch status/err:', e.response?.data || e.message);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkCapabilities();
