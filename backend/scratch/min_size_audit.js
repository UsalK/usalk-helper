import * as EtsyService from '../services/EtsyService.js';
import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// "20x30cm - 8”x12”" -> alan (cm^2). cm bulunamazsa inch'ten türet.
export function sizeArea(label) {
  const s = String(label).replace(/[”“]/g, '"').replace(/[’‘]/g, "'");
  const cm = s.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*cm/i);
  if (cm) return parseFloat(cm[1].replace(',', '.')) * parseFloat(cm[2].replace(',', '.'));
  const inch = s.match(/(\d+(?:[.,]\d+)?)\s*"\s*x\s*(\d+(?:[.,]\d+)?)\s*"/);
  if (inch) return parseFloat(inch[1].replace(',', '.')) * parseFloat(inch[2].replace(',', '.')) * 6.4516;
  const any = s.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/i);
  if (any) return parseFloat(any[1].replace(',', '.')) * parseFloat(any[2].replace(',', '.'));
  return null;
}

const SIZE_PROP_NAMES = ['size', 'boyut', 'dimensions', 'ebat'];
export function findSizeProperty(products) {
  const names = new Map();
  for (const p of products) for (const pv of (p.property_values || [])) {
    names.set(pv.property_id, (pv.property_name || '').toLowerCase());
  }
  for (const [id, name] of names) if (SIZE_PROP_NAMES.some(n => name.includes(n))) return id;
  return null;
}

async function main() {
  const { access_token, client_id, client_secret, shop_id } = await EtsyService.getValidToken();
  const headers = {
    'x-api-key': `${client_id}:${client_secret}`,
    'Authorization': `Bearer ${access_token}`
  };
  console.log(`Shop ID: ${shop_id}`);

  const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`;
  const listings = [];
  let offset = 0, total = null;
  do {
    const r = await axios.get(url, { params: { state: 'active', limit: 100, offset }, headers });
    total = r.data.count || 0;
    listings.push(...(r.data.results || []));
    offset += 100;
    if (offset < total) await sleep(220);
  } while (offset < total);
  console.log(`Aktif listing: ${listings.length} / ${total}`);

  const out = [];
  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    const id = String(l.listing_id);
    try {
      const inv = (await axios.get(`https://openapi.etsy.com/v3/application/listings/${id}/inventory`, { headers })).data;
      const products = inv.products || [];
      const sizePropId = findSizeProperty(products);

      const rows = [];
      for (const p of products) {
        const pvs = p.property_values || [];
        const sizePv = pvs.find(pv => pv.property_id === sizePropId);
        const sizeLabel = sizePv ? (sizePv.values || [])[0] : null;
        const otherLabels = pvs.filter(pv => pv.property_id !== sizePropId).map(pv => (pv.values || [])[0]);
        for (const off of (p.offerings || [])) {
          rows.push({
            size: sizeLabel,
            area: sizeArea(sizeLabel || ''),
            other: otherLabels.join(' / '),
            price: off.price.amount / off.price.divisor,
            enabled: off.is_enabled
          });
        }
      }

      const areas = rows.map(r => r.area).filter(a => a != null);
      const minArea = areas.length ? Math.min(...areas) : null;
      const minRows = rows.filter(r => r.area === minArea);

      out.push({
        listing_id: id,
        title: l.title,
        variation_count: products.length,
        size_property_id: sizePropId,
        size_property_found: sizePropId != null,
        distinct_sizes: [...new Set(rows.map(r => r.size))],
        min_size: minRows[0]?.size ?? null,
        min_size_rows: minRows.map(r => ({ frame: r.other, price: r.price, enabled: r.enabled })),
        all_price_min: rows.length ? Math.min(...rows.map(r => r.price)) : null,
        all_price_max: rows.length ? Math.max(...rows.map(r => r.price)) : null
      });
      process.stdout.write(`[${i + 1}/${listings.length}] ${id} ok\r`);
    } catch (e) {
      out.push({ listing_id: id, title: l.title, error: e.response?.data || e.message });
      console.log(`\n[${i + 1}] ${id} HATA`, e.response?.data || e.message);
    }
    await sleep(220);
  }

  fs.writeFileSync('scratch/min_size_audit.json', JSON.stringify(out, null, 2));
  console.log(`\nRapor: backend/scratch/min_size_audit.json (${out.length} listing)`);
}

main().catch(e => { console.error('FATAL', e.response?.data || e.message); process.exit(1); });
