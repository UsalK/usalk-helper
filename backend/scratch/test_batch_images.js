import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import axios from 'axios';

async function testBatchImages() {
  try {
    const auth = await getValidToken();
    const ids = '4504346627,4501477194,4502037632';

    const url = `https://openapi.etsy.com/v3/application/listings/batch?listing_ids=${ids}&includes=images`;
    const res = await axios.get(url, {
      headers: {
        'x-api-key': `${auth.client_id}:${auth.client_secret}`,
        'Authorization': `Bearer ${auth.access_token}`
      }
    });

    const results = res.data.results || [];
    results.forEach(r => {
      console.log(`\nListing #${r.listing_id}:`);
      console.log('Images count:', r.images?.length);
      if (r.images?.length > 0) {
        const mainImg = r.images[0];
        console.log('url_75x75:', mainImg.url_75x75);
        console.log('url_170x135:', mainImg.url_170x135);
        console.log('url_570xN:', mainImg.url_570xN);
        console.log('full_width x full_height:', mainImg.full_width, 'x', mainImg.full_height);
      }
    });

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testBatchImages();
