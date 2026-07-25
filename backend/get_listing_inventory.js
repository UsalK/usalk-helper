import * as EtsyService from './services/EtsyService.js';
import axios from 'axios';
import 'dotenv/config';

async function test() {
  try {
    const { access_token, client_id, client_secret, shop_id } = await EtsyService.getValidToken();
    const listingId = "4538254029";
    
    console.log(`Fetching inventory for listing ${listingId}...`);
    const url = `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`;
    
    const res = await axios.get(url, {
      headers: {
        'x-api-key': `${client_id}:${client_secret}`,
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    console.log("=== ETSY INVENTORY RESPONSE ===");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("API CALL FAILED!");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Message:", err.message);
    }
  }
}

test();
