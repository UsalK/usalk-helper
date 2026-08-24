/**
 * Toplu güncelleme sonrası rastgele örneklem doğrulaması.
 * Her listing için: en küçük boyut + Roll fiyatı hedefe eşit mi, ve diğer varyasyonların
 * fiyatları audit anındaki değerleriyle aynı mı (yani PUT yan hasar yapmamış mı).
 *
 *   node scratch/spotcheck.js [ornek_sayisi]
 */
import * as EtsyService from '../services/EtsyService.js';
import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';

const N = Number(process.argv[2] || 10);
const PRICE = 59.98;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s ?? '').replace(/[”“″]/g, '"').replace(/[’‘]/g, "'");

function dims(l) {
  const s = norm(l);
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*cm/i);
  if (m) return { w: +m[1].replace(',', '.'), h: +m[2].replace(',', '.') };
  m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (m) return { w: +m[1].replace(',', '.'), h: +m[2].replace(',', '.') };
  return null;
}
function propIdByHint(products, hints) {
  const names = new Map();
  for (const p of products) for (const pv of (p.property_values || [])) names.set(pv.property_id, (pv.property_name || '').toLowerCase());
  for (const [id, name] of names) if (hints.some(h => name.includes(h))) return id;
  return null;
}
const valOf = (p, id) => {
  const pv = (p.property_values || []).find(v => v.property_id === id);
  return pv ? norm((pv.values || [])[0]) : null;
};

async function main() {
  const { access_token, client_id, client_secret } = await EtsyService.getValidToken();
  const headers = { 'x-api-key': `${client_id}:${client_secret}`, 'Authorization': `Bearer ${access_token}` };

  const exec = JSON.parse(fs.readFileSync('scratch/min_roll_price_execute.json', 'utf8'));
  // Audit, güncelleme öncesi tüm varyasyon fiyatlarının referansı
  const audit = new Map(JSON.parse(fs.readFileSync('scratch/min_size_audit.json', 'utf8')).map(r => [r.listing_id, r]));

  const pool = exec.report.filter(r => r.status === 'updated');
  const picked = [];
  const seen = new Set();
  while (picked.length < Math.min(N, pool.length)) {
    const i = Math.floor(Math.random() * pool.length);
    if (seen.has(i)) continue;
    seen.add(i); picked.push(pool[i]);
  }

  let pass = 0, fail = 0;
  for (const row of picked) {
    const id = row.listing_id;
    const inv = (await axios.get(`https://openapi.etsy.com/v3/application/listings/${id}/inventory`, { headers })).data;
    const products = inv.products || [];
    const sizeProp = propIdByHint(products, ['dimension', 'size', 'boyut', 'ebat']);
    const frameRaw = propIdByHint(products, ['frame', 'cerceve', 'çerçeve', 'style']);
    const frameProp = frameRaw === sizeProp ? null : frameRaw;

    let minLabel = null, minArea = Infinity;
    for (const p of products) {
      const d = dims(valOf(p, sizeProp));
      if (d && d.w * d.h < minArea) { minArea = d.w * d.h; minLabel = valOf(p, sizeProp); }
    }

    const problems = [];

    // 1) Hedef varyasyon gerçekten 59.98 mi
    const roll = products.find(p => valOf(p, sizeProp) === minLabel && (valOf(p, frameProp) || '').toLowerCase() === 'roll');
    const rollPrice = roll ? roll.offerings[0].price.amount / roll.offerings[0].price.divisor : null;
    if (rollPrice !== PRICE) problems.push(`Roll fiyati ${rollPrice} (beklenen ${PRICE})`);

    // 2) Varyasyon sayısı korunmuş mu
    const a = audit.get(id);
    if (a && a.variation_count !== products.length) problems.push(`varyasyon sayisi ${a.variation_count} -> ${products.length}`);

    // 3) En küçük boyuttaki diğer çerçeveler audit'teki fiyatlarını korumuş mu
    if (a) {
      for (const ref of (a.min_size_rows || [])) {
        if (String(ref.frame).toLowerCase() === 'roll') continue;
        const p = products.find(x => valOf(x, sizeProp) === minLabel && (valOf(x, frameProp) || '') === ref.frame);
        if (!p) { problems.push(`kayip varyasyon: ${ref.frame}`); continue; }
        const now = p.offerings[0].price.amount / p.offerings[0].price.divisor;
        if (Math.abs(now - ref.price) > 0.005) problems.push(`${ref.frame}: ${ref.price} -> ${now}`);
      }
      // 4) Tüm listing'in fiyat aralığı: üst sınır değişmemeli
      const allNow = products.flatMap(p => p.offerings.map(o => o.price.amount / o.price.divisor));
      const maxNow = Math.max(...allNow);
      if (a.all_price_max != null && Math.abs(maxNow - a.all_price_max) > 0.005) {
        problems.push(`max fiyat ${a.all_price_max} -> ${maxNow}`);
      }
    }

    if (problems.length) { fail++; console.log(`FAIL ${id} (${products.length} var.)`); problems.forEach(p => console.log('     - ' + p)); }
    else { pass++; console.log(`OK   ${id}  ${minLabel} + Roll = $${rollPrice}  (${products.length} varyasyon, max $${a?.all_price_max})`); }

    await sleep(250);
  }

  console.log(`\n=== ${pass} OK / ${fail} FAIL (${picked.length} ornek) ===`);
}

main().catch(e => { console.error('FATAL', e.response?.data || e.message); process.exit(1); });
