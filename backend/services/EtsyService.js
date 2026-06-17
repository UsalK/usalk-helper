import db, { getActiveShop } from '../db/db.js';
import axios from 'axios';
import fs from 'fs';
import { basename } from 'path';

// In-memory caching for metadata to avoid 429 rate limit
const cache = {
  sections: null,
  shippingProfiles: null,
  returnPolicies: null,
  readinessStates: null,
  timestamps: {
    sections: 0,
    shippingProfiles: 0,
    returnPolicies: 0,
    readinessStates: 0
  }
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

function getCachedData(key) {
  const now = Date.now();
  if (cache[key] && (now - cache.timestamps[key] < CACHE_DURATION)) {
    console.log(`[Cache] Returning cached data for: ${key}`);
    return cache[key];
  }
  return null;
}

function setCachedData(key, data) {
  cache[key] = data;
  cache.timestamps[key] = Date.now();
  console.log(`[Cache] Saved data for: ${key}`);
}

export function clearEtsyCache() {
  cache.sections = null;
  cache.shippingProfiles = null;
  cache.returnPolicies = null;
  cache.readinessStates = null;
  cache.timestamps = {
    sections: 0,
    shippingProfiles: 0,
    returnPolicies: 0,
    readinessStates: 0
  };
  console.log('[Cache] Etsy metadata cache cleared.');
}

export function getEtsyCredentials() {
  const client_id = process.env.ETSY_CLIENT_ID;
  const client_secret = process.env.ETSY_CLIENT_SECRET;
  
  if (!client_id || !client_secret) {
    throw new Error('Etsy API Key (ETSY_CLIENT_ID) or Shared Secret (ETSY_CLIENT_SECRET) is not configured in backend .env file.');
  }
  
  return {
    client_id,
    client_secret
  };
}

let activeRefreshPromise = null;

// Helper to get stored auth details and refresh them if expired
export async function getValidToken() {
  const auth = getActiveShop();
  
  if (!auth || !auth.access_token || auth.shop_id === 'default_shop') {
    throw new Error('Etsy hesabı bağlı değil. Lütfen Etsy panelinden mağazayı bağlayın.');
  }
  
  const { client_id, client_secret } = getEtsyCredentials();
  
  const expiresAt = new Date(auth.expires_at);
  const now = new Date();
  
  // If expired or expiring in 5 minutes, refresh
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    if (activeRefreshPromise) {
      console.log("A token refresh is already in progress, waiting for it...");
      return activeRefreshPromise;
    }

    activeRefreshPromise = (async () => {
      console.log(`Etsy token expired or expiring soon for shop ${auth.shop_id}, refreshing...`);
      try {
        const response = await axios.post('https://api.etsy.com/v3/public/oauth/token', 
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: client_id,
            refresh_token: auth.refresh_token
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        
        const { access_token, refresh_token, expires_in } = response.data;
        const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
        
        // Update tokens in DB for this specific shop
        const updateStmt = db.prepare(
          'UPDATE etsy_auth SET access_token = ?, refresh_token = ?, expires_at = ? WHERE shop_id = ?'
        );
        updateStmt.run(access_token, refresh_token, newExpiresAt, auth.shop_id);
        
        console.log(`Etsy token refreshed successfully for shop ${auth.shop_id}! New expiry:`, newExpiresAt);
        activeRefreshPromise = null;

        return {
          access_token,
          client_id,
          client_secret,
          shop_id: auth.shop_id
        };
      } catch (err) {
        activeRefreshPromise = null;
        console.error("Failed to refresh Etsy token:", err.response?.data || err.message);
        throw new Error("Etsy bağlantısı sona erdi. Lütfen Etsy hesabınızı yeniden bağlayın.");
      }
    })();

    return activeRefreshPromise;
  }
  
  return {
    access_token: auth.access_token,
    client_id,
    client_secret,
    shop_id: auth.shop_id
  };
}

export async function getShopSections(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedData('sections');
    if (cached) return cached;
  }
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/sections`;
  const res = await axios.get(url, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`
    }
  });
  setCachedData('sections', res.data.results);
  return res.data.results;
}

export async function getShippingProfiles(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedData('shippingProfiles');
    if (cached) return cached;
  }
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/shipping-profiles`;
  const res = await axios.get(url, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`
    }
  });
  setCachedData('shippingProfiles', res.data.results);
  return res.data.results;
}

export async function getReturnPolicies(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedData('returnPolicies');
    if (cached) return cached;
  }
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/policies/return`;
  const res = await axios.get(url, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`
    }
  });
  setCachedData('returnPolicies', res.data.results);
  return res.data.results;
}

export async function createListing(listingData) {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`;
  
  // Format body as url-encoded form data
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(listingData)) {
    if (key === 'tags' || key === 'materials') {
      if (Array.isArray(value)) {
        params.append(key, value.join(','));
      } else if (value !== null && value !== undefined) {
        params.append(key, value.toString());
      }
    } else if (Array.isArray(value)) {
      value.forEach(v => params.append(key, v));
    } else if (value !== null && value !== undefined) {
      params.append(key, value.toString());
    }
  }

  const res = await axios.post(url, params, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return res.data;
}

export async function uploadListingImage(listing_id, imagePath, rank = 1, altText = '') {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${listing_id}/images`;
  
  const fileBuffer = fs.readFileSync(imagePath);
  const isPng = imagePath.toLowerCase().endsWith('.png');
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const fileName = basename(imagePath) || 'image.jpg';
  
  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('image', blob, fileName);
  formData.append('rank', rank.toString());
  if (altText) {
    formData.append('alt_text', altText);
  }

  const res = await axios.post(url, formData, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`
    }
  });
  return res.data;
}

export async function updateListingInventory(listing_id, inventoryData) {
  const { access_token, client_id, client_secret } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/listings/${listing_id}/inventory`;

  const res = await axios.put(url, inventoryData, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    }
  });
  return res.data;
}

export async function updateListingProperty(listing_id, property_id, propertyData) {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${listing_id}/properties/${property_id}`;

  const res = await axios.put(url, propertyData, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    }
  });
  return res.data;
}

export async function getReadinessStates(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedData('readinessStates');
    if (cached) return cached;
  }
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/readiness-state-definitions`;
  const res = await axios.get(url, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`
    }
  });
  setCachedData('readinessStates', res.data.results);
  return res.data.results;
}

export async function uploadListingFile(listing_id, filePath, name = '') {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${listing_id}/files`;
  
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = name || basename(filePath) || 'file.zip';
  
  const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('name', fileName);
  
  const res = await axios.post(url, formData, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`
    }
  });
  return res.data;
}

export async function createShopSection(title) {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/sections`;
  
  const params = new URLSearchParams();
  params.append('title', title);
  
  const res = await axios.post(url, params, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  
  // Clear sections cache
  cache.sections = null;
  cache.timestamps.sections = 0;
  
  return res.data;
}

export async function updateListing(listing_id, listingData) {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${listing_id}`;
  
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(listingData)) {
    if (key === 'tags' || key === 'materials') {
      if (Array.isArray(value)) {
        params.append(key, value.join(','));
      } else if (value !== null && value !== undefined) {
        params.append(key, value.toString());
      }
    } else if (Array.isArray(value)) {
      value.forEach(v => params.append(key, v));
    } else if (value !== null && value !== undefined) {
      params.append(key, value.toString());
    }
  }

  const res = await axios.patch(url, params, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return res.data;
}
