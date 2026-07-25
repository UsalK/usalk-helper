import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import axios from 'axios';

async function testImageEndpoints() {
  try {
    const auth = await getValidToken();
    console.log('Shop ID:', auth.shop_id);

    // Test 1: includes=Images
    try {
      const res1 = await axios.get(`https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/listings/active?limit=3&includes=Images`, {
        headers: { 'x-api-key': `${auth.client_id}:${auth.client_secret}`, 'Authorization': `Bearer ${auth.access_token}` }
      });
      console.log('Includes Images:', res1.data.results?.[0]?.images ? 'YES' : 'NO');
    } catch(e) { console.log('Includes Images Err:', e.message); }

    // Test 2: getListingImages endpoint for 1 listing
    const listingId = 4504346627;
    try {
      const imgRes = await axios.get(`https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/listings/${listingId}/images`, {
        headers: { 'x-api-key': `${auth.client_id}:${auth.client_secret}`, 'Authorization': `Bearer ${auth.access_token}` }
      });
      console.log('Single Listing Images count:', imgRes.data.results?.length);
      if (imgRes.data.results?.length > 0) {
        console.log('Main image url_570xN:', imgRes.data.results[0].url_570xN);
        console.log('Main image url_fullxfull:', imgRes.data.results[0].url_fullxfull);
        console.log('Width x Height:', imgRes.data.results[0].full_width, 'x', imgRes.data.results[0].full_height);
      }
    } catch(e) { console.log('Single Listing Images Err:', e.message); }

    // Test 3: Batch image lookup via getListingsByShop images or batching
    try {
      const res3 = await axios.get(`https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${listingId}&includes=images`, {
        headers: { 'x-api-key': `${auth.client_id}:${auth.client_secret}`, 'Authorization': `Bearer ${auth.access_token}` }
      });
      console.log('Batch res:', res3.data);
    } catch(e) { console.log('Batch Err:', e.message); }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

testImageEndpoints();
