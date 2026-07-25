import 'dotenv/config';
import { getValidToken } from '../services/EtsyService.js';
import axios from 'axios';

async function testStats() {
  try {
    const auth = await getValidToken();
    
    // Get Shop details
    const shopRes = await axios.get(`https://openapi.etsy.com/v3/application/shops/${auth.shop_id}`, {
      headers: {
        'x-api-key': `${auth.client_id}:${auth.client_secret}`,
        'Authorization': `Bearer ${auth.access_token}`
      }
    });
    
    const shop = shopRes.data;
    
    // Get Active Listings (all or top pages)
    let allListings = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const listingsRes = await axios.get(`https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/listings/active?limit=${limit}&offset=${offset}`, {
        headers: {
          'x-api-key': `${auth.client_id}:${auth.client_secret}`,
          'Authorization': `Bearer ${auth.access_token}`
        }
      });
      const results = listingsRes.data.results || [];
      allListings.push(...results);
      if (allListings.length >= listingsRes.data.count || results.length === 0) break;
      offset += limit;
    }
    
    const totalViews = allListings.reduce((sum, l) => sum + (l.views || 0), 0);
    const totalFavorites = allListings.reduce((sum, l) => sum + (l.num_favorers || 0), 0);
    
    // Sort by views
    const topViewed = [...allListings].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    // Sort by favorers
    const topFavorited = [...allListings].sort((a, b) => (b.num_favorers || 0) - (a.num_favorers || 0)).slice(0, 5);

    console.log(JSON.stringify({
      shop_name: shop.shop_name,
      listing_active_count: shop.listing_active_count,
      transaction_sell_count: shop.transaction_sell_count,
      shop_favorers: shop.num_favorers,
      review_count: shop.review_count,
      review_average: shop.review_average,
      total_active_listings_fetched: allListings.length,
      total_views: totalViews,
      total_favorites: totalFavorites,
      top_viewed: topViewed.map(l => ({ title: l.title, views: l.views, favorites: l.num_favorers, price: l.price.amount / l.price.divisor + ' ' + l.price.currency_code, id: l.listing_id })),
      top_favorited: topFavorited.map(l => ({ title: l.title, views: l.views, favorites: l.num_favorers, price: l.price.amount / l.price.divisor + ' ' + l.price.currency_code, id: l.listing_id }))
    }, null, 2));

  } catch (err) {
    console.error('Error fetching stats:', err.response?.data || err.message);
  }
}

testStats();
