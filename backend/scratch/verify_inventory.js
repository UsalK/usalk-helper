/**
 * Bir listing'in envanterini çekip snapshot alır ya da önceki snapshot ile karşılaştırır.
 * PUT sonrası fiyat dışında hiçbir şeyin (etiketler, SKU, quantity, readiness) bozulmadığını
 * doğrulamak için kullanılır — özellikle HTML-escape'li ölçü etiketlerinin çift-escape olması riski.
 *
 *   node scratch/verify_inventory.js <listing_id> before
 *   node scratch/verify_inventory.js <listing_id> after
 */
import * as EtsyService from '../services/EtsyService.js';
import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';

const [listingId, label = 'snap'] = process.argv.slice(2);
if (!listingId) { console.error('kullanim: node scratch/verify_inventory.js <listing_id> <before|after>'); process.exit(1); }

/** Karşılaştırılabilir, sırası sabit bir özet çıkarır. */
function snapshot(inv) {
  const rows = (inv.products || []).map(p => ({
    sku: p.sku || '',
    props: (p.property_values || [])
      .map(pv => `${pv.property_id}:${pv.property_name}=${JSON.stringify(pv.values)}|ids=${JSON.stringify(pv.value_ids)}|scale=${pv.scale_id ?? 'null'}`)
      .sort().join(' ;; '),
    offerings: (p.offerings || []).map(o => ({
      price: o.price.amount / o.price.divisor,
      currency: o.price.currency_code,
      quantity: o.quantity,
      is_enabled: o.is_enabled,
      readiness_state_id: o.readiness_state_id ?? null
    }))
  })).sort((a, b) => (a.props + a.sku).localeCompare(b.props + b.sku));

  return {
    product_count: rows.length,
    price_on_property: inv.price_on_property || [],
    quantity_on_property: inv.quantity_on_property || [],
    sku_on_property: inv.sku_on_property || [],
    rows
  };
}

/** İki snapshot arasındaki farkları satır satır listeler. */
function diff(a, b) {
  const out = [];
  if (a.product_count !== b.product_count) out.push(`product_count: ${a.product_count} -> ${b.product_count}`);
  for (const k of ['price_on_property', 'quantity_on_property', 'sku_on_property']) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
  }
  const n = Math.min(a.rows.length, b.rows.length);
  for (let i = 0; i < n; i++) {
    const ra = a.rows[i], rb = b.rows[i];
    if (ra.props !== rb.props) out.push(`[${i}] PROPS DEGISTI\n      onceki: ${ra.props}\n      sonraki: ${rb.props}`);
    if (ra.sku !== rb.sku) out.push(`[${i}] sku: "${ra.sku}" -> "${rb.sku}"`);
    const oa = JSON.stringify(ra.offerings), ob = JSON.stringify(rb.offerings);
    if (oa !== ob) out.push(`[${i}] ${ra.props.slice(0, 70)}\n      offerings: ${oa}\n               -> ${ob}`);
  }
  return out;
}

async function main() {
  const { access_token, client_id, client_secret } = await EtsyService.getValidToken();
  const inv = (await axios.get(`https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`, {
    headers: { 'x-api-key': `${client_id}:${client_secret}`, 'Authorization': `Bearer ${access_token}` }
  })).data;

  const snap = snapshot(inv);
  const path = `scratch/snap_${listingId}_${label}.json`;
  fs.writeFileSync(path, JSON.stringify(snap, null, 2));
  console.log(`Snapshot yazildi: backend/${path} (${snap.product_count} varyasyon)`);

  const beforePath = `scratch/snap_${listingId}_before.json`;
  if (label === 'after' && fs.existsSync(beforePath)) {
    const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    const d = diff(before, snap);
    console.log('\n=== BEFORE -> AFTER FARKLARI ===');
    if (!d.length) console.log('  (fark yok)');
    else d.forEach(l => console.log('  ' + l));
    console.log(`\nToplam ${d.length} fark.`);
  }
}

main().catch(e => { console.error('FATAL', e.response?.data || e.message); process.exit(1); });
