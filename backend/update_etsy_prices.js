import * as EtsyService from './services/EtsyService.js';
import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const listingIdArg = args.find((_, i) => args[i - 1] === '--listing');
  const percentArg = args.find((_, i) => args[i - 1] === '--percent');

  const percentage = percentArg ? parseFloat(percentArg) : 20;
  const percentMultiplier = 1 + (percentage / 100);

  console.log("==========================================");
  console.log(`   ETSY BULK PRICE UPDATER (+${percentage}%)`);
  console.log(`   Mode: ${execute ? 'EXECUTE (REAL UPDATE)' : 'DRY RUN (SIMULATION)'}`);
  if (listingIdArg) {
    console.log(`   Targeting Listing ID: ${listingIdArg}`);
  }
  console.log("==========================================\n");

  try {
    // Get valid oauth credentials
    const credentials = await EtsyService.getValidToken();
    const { access_token, client_id, client_secret, shop_id } = credentials;
    console.log(`Authenticated with Etsy. Shop ID: ${shop_id}`);

    // Get listings to process
    let listings = [];
    if (listingIdArg) {
      listings = [{ listing_id: Number(listingIdArg), title: `Target Listing ${listingIdArg}` }];
    } else {
      const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`;
      const headers = {
        'x-api-key': `${client_id}:${client_secret}`,
        'Authorization': `Bearer ${access_token}`
      };

      console.log("Fetching active listings from Etsy...");
      const firstRes = await axios.get(url, {
        params: { state: 'active', limit: 100, offset: 0 },
        headers
      });

      const totalCount = firstRes.data.count || 0;
      listings = [...(firstRes.data.results || [])];
      console.log(`Total active listings count: ${totalCount}`);

      if (totalCount > 100) {
        for (let offset = 100; offset < totalCount; offset += 100) {
          console.log(`Fetching listings offset ${offset}...`);
          const r = await axios.get(url, {
            params: { state: 'active', limit: 100, offset },
            headers
          });
          if (r.data?.results) {
            listings.push(...r.data.results);
          }
          await sleep(200); // Respect API limit
        }
      }
    }

    console.log(`Starting processing for ${listings.length} listings...\n`);
    const report = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      const listingId = listing.listing_id.toString();
      console.log(`[${i + 1}/${listings.length}] Listing ID ${listingId}: "${listing.title || 'No Title'}"`);

      try {
        // Fetch current inventory
        const getUrl = `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`;
        const getRes = await axios.get(getUrl, {
          headers: {
            'x-api-key': `${client_id}:${client_secret}`,
            'Authorization': `Bearer ${access_token}`
          }
        });

        const inventory = getRes.data;
        if (!inventory || !inventory.products || inventory.products.length === 0) {
          console.log(`  -> Warning: No products/variations found. Skipping.`);
          report.push({ listingId, title: listing.title, status: 'skipped', reason: 'No products in inventory' });
          continue;
        }

        const hasVariations = inventory.price_on_property && inventory.price_on_property.length > 0;
        const originalPrices = [];
        const newPrices = [];

        // Map existing products into updated list
        const updatedProducts = inventory.products.map(product => {
          const property_values = (product.property_values || []).map(pv => ({
            property_id: pv.property_id,
            property_name: pv.property_name,
            value_ids: pv.value_ids || [],
            values: pv.values || []
          }));

          const offerings = (product.offerings || []).map(offering => {
            const originalPrice = offering.price.amount / offering.price.divisor;
            const newPriceVal = Number((originalPrice * percentMultiplier).toFixed(2));

            originalPrices.push(originalPrice);
            newPrices.push(newPriceVal);

            const newOffering = {
              price: newPriceVal,
              quantity: offering.quantity !== undefined ? offering.quantity : 100,
              is_enabled: offering.is_enabled !== undefined ? offering.is_enabled : true
            };

            if (offering.readiness_state_id) {
              newOffering.readiness_state_id = offering.readiness_state_id;
            } else {
              newOffering.readiness_state_id = null;
            }

            return newOffering;
          });

          return {
            sku: product.sku || '',
            property_values,
            offerings
          };
        });

        const minOrig = Math.min(...originalPrices);
        const maxOrig = Math.max(...originalPrices);
        const minNew = Math.min(...newPrices);
        const maxNew = Math.max(...newPrices);

        console.log(`  -> Prices: $${minOrig} - $${maxOrig} ==> $${minNew} - $${maxNew}`);

        if (!hasVariations) {
          console.log(`  -> Simple listing. Updating via PATCH...`);
          if (execute) {
            const patchUrl = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings/${listingId}`;
            const params = new URLSearchParams();
            params.append('price', newPrices[0].toString());

            await axios.patch(patchUrl, params, {
              headers: {
                'x-api-key': `${client_id}:${client_secret}`,
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            });
            console.log(`  -> [SUCCESS] Updated simple listing.`);
          } else {
            console.log(`  -> [DRY RUN] Would PATCH price to $${newPrices[0]}.`);
          }
        } else {
          console.log(`  -> Variation listing (${updatedProducts.length} variations). Updating via PUT Inventory...`);
          if (execute) {
            const putData = {
              products: updatedProducts,
              price_on_property: inventory.price_on_property || [],
              quantity_on_property: inventory.quantity_on_property || [],
              sku_on_property: inventory.sku_on_property || []
            };

            await axios.put(
              `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`,
              putData,
              {
                headers: {
                  'x-api-key': `${client_id}:${client_secret}`,
                  'Authorization': `Bearer ${access_token}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            console.log(`  -> [SUCCESS] Updated inventory.`);
          } else {
            console.log(`  -> [DRY RUN] Would PUT inventory updates.`);
          }
        }

        successCount++;
        report.push({
          listingId,
          title: listing.title,
          status: execute ? 'updated' : 'dry-run-success',
          originalPriceRange: `${minOrig} - ${maxOrig}`,
          newPriceRange: `${minNew} - ${maxNew}`
        });

      } catch (err) {
        failCount++;
        const errMsg = err.response?.data?.error || err.response?.data || err.message;
        console.error(`  -> [ERROR] Failed:`, errMsg);
        report.push({
          listingId,
          title: listing.title,
          status: 'error',
          error: errMsg
        });
      }

      // 250ms delay between operations to respect Etsy rate limit (10 rps)
      await sleep(250);
    }

    // Save report to scratch directory
    const scratchDir = join(__dirname, 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    const reportPath = join(scratchDir, 'price_update_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log("\n==========================================");
    console.log("   PRICING UPDATE COMPLETE");
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Report saved to: ${reportPath}`);
    console.log("==========================================\n");

  } catch (err) {
    console.error("CRITICAL ERROR IN SCRIPT:", err.message);
  }
}

run();
