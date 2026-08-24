/**
 * En küçük boyut + Roll varyasyonunun fiyatını sabit bir değere çeker.
 * Sadece belirtilen en-boy oranlarındaki (varsayılan 2:3 ve 3:2) listing'lere dokunur.
 *
 * Kullanım:
 *   node scratch/set_min_roll_price.js                      # DRY RUN
 *   node scratch/set_min_roll_price.js --execute            # gerçek güncelleme
 *   node scratch/set_min_roll_price.js --price 59.98 --ratios 2:3,3:2 --limit 5 --execute
 */
import * as EtsyService from '../services/EtsyService.js';
import axios from 'axios';
import 'dotenv/config';
import fs from 'fs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const EXECUTE   = args.includes('--execute');
const PRICE     = Number(flag('price', '59.98'));
const RATIOS    = String(flag('ratios', '2:3,3:2')).split(',').map(s => s.trim());
const FRAME     = String(flag('frame', 'Roll'));
const LIMIT     = flag('limit') ? Number(flag('limit')) : Infinity;
const AUDIT     = flag('audit', 'scratch/min_size_audit.json');
const TOLERANCE = 0.03;

const RATIO_TARGETS = { '2:3': 2 / 3, '3:2': 3 / 2, '1:1': 1, '12:7': 12 / 7, '7:12': 7 / 12, '12:5': 12 / 5 };

/**
 * "Set of 2 (2:3)" profilinin ölçü etiketleri tekli 2:3 profiliyle birebir aynı,
 * yani oran hesabı ikisini ayıramıyor. Sette iki panel olduğu için giriş fiyatını
 * tekli posterle aynı seviyeye çekmek yanlış olur — başlıktan yakalayıp eliyoruz.
 * --allow-sets ile bu koruma kapatılabilir.
 */
const SET_TITLE_RE = /\b(set of \d|diptych|triptych|multi[- ]?panel|panel set|\d\s*(?:piece|panel|pcs)\b|2 ?piece|3 ?piece)/i;
const ALLOW_SETS = args.includes('--allow-sets');

const norm = (s) => String(s ?? '').replace(/[”“″]/g, '"').replace(/[’‘]/g, "'");

/** "20x30cm - 8”x12”" -> {w:20,h:30} (cm; cm yoksa inçten çevirir) */
function dims(label) {
  const s = norm(label);
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*cm/i);
  if (m) return { w: parseFloat(m[1].replace(',', '.')), h: parseFloat(m[2].replace(',', '.')) };
  m = s.match(/(\d+(?:[.,]\d+)?)\s*"\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*"/);
  if (m) return { w: parseFloat(m[1].replace(',', '.')) * 2.54, h: parseFloat(m[2].replace(',', '.')) * 2.54 };
  m = s.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/);
  if (m) return { w: parseFloat(m[1].replace(',', '.')), h: parseFloat(m[2].replace(',', '.')) };
  return null;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** Ölçü etiketlerinin medyan w/h oranına en yakın profil oranını döndürür. */
function classifyRatio(sizeLabels) {
  const rs = sizeLabels.map(dims).filter(Boolean).map(d => d.w / d.h).filter(r => isFinite(r) && r > 0);
  if (!rs.length) return { ratio: null, value: null, nearest: null, diff: null };
  const m = median(rs);
  let best = null, bestDiff = Infinity;
  for (const [name, target] of Object.entries(RATIO_TARGETS)) {
    const diff = Math.abs(m - target);
    if (diff < bestDiff) { bestDiff = diff; best = name; }
  }
  return {
    ratio: bestDiff <= TOLERANCE ? best : null,
    value: Number(m.toFixed(4)),
    nearest: best,
    diff: Number(bestDiff.toFixed(4))
  };
}

const SIZE_PROP_HINTS  = ['dimension', 'size', 'boyut', 'ebat'];
const FRAME_PROP_HINTS = ['frame', 'cerceve', 'çerçeve', 'style'];

function propIdByHint(products, hints) {
  const names = new Map();
  for (const p of products) {
    for (const pv of (p.property_values || [])) {
      names.set(pv.property_id, (pv.property_name || '').toLowerCase());
    }
  }
  for (const [id, name] of names) {
    if (hints.some(h => name.includes(h))) return id;
  }
  return null;
}

const valOf = (product, propId) => {
  const pv = (product.property_values || []).find(v => v.property_id === propId);
  return pv ? norm((pv.values || [])[0]) : null;
};

/** GET'ten gelen ürünü PUT şemasına birebir çevirir; newPrice verilirse fiyatı ezer. */
function toPutProduct(product, newPrice) {
  return {
    sku: product.sku || '',
    property_values: (product.property_values || []).map(pv => {
      const out = {
        property_id: pv.property_id,
        property_name: pv.property_name,
        value_ids: pv.value_ids || [],
        values: pv.values || []
      };
      if (pv.scale_id != null) out.scale_id = pv.scale_id;
      return out;
    }),
    offerings: (product.offerings || []).map(off => ({
      price: newPrice != null ? newPrice : Number((off.price.amount / off.price.divisor).toFixed(2)),
      quantity: off.quantity !== undefined ? off.quantity : 100,
      is_enabled: off.is_enabled !== undefined ? off.is_enabled : true,
      readiness_state_id: off.readiness_state_id ?? null
    }))
  };
}

async function main() {
  const { access_token, client_id, client_secret, shop_id } = await EtsyService.getValidToken();
  const headers = { 'x-api-key': `${client_id}:${client_secret}`, 'Authorization': `Bearer ${access_token}` };

  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));

  console.log('='.repeat(60));
  console.log(`  EN KUCUK BOYUT + ${FRAME} -> $${PRICE}`);
  console.log(`  Mod     : ${EXECUTE ? 'EXECUTE (GERCEK)' : 'DRY RUN'}`);
  console.log(`  Shop    : ${shop_id}`);
  console.log(`  Oranlar : ${RATIOS.join(', ')}`);
  console.log('='.repeat(60) + '\n');

  // 1) Audit raporundan oran filtresi
  const targets = [];
  const skipped = [];
  for (const row of audit) {
    if (row.error) { skipped.push({ listing_id: row.listing_id, title: row.title, skip: 'audit-error' }); continue; }
    const cls = classifyRatio(row.distinct_sizes || []);
    if (!RATIOS.includes(cls.ratio)) {
      skipped.push({
        listing_id: row.listing_id, title: row.title, skip: 'ratio',
        ratio: cls.ratio, ratio_value: cls.value, nearest: cls.nearest
      });
      continue;
    }
    if (!ALLOW_SETS && SET_TITLE_RE.test(row.title || '')) {
      skipped.push({
        listing_id: row.listing_id, title: row.title, skip: 'set-of-n',
        ratio: cls.ratio, match: (row.title || '').match(SET_TITLE_RE)?.[0]
      });
      continue;
    }
    targets.push({ ...row, ratio: cls.ratio, ratio_value: cls.value });
  }

  const byRatio = {};
  for (const t of targets) byRatio[t.ratio] = (byRatio[t.ratio] || 0) + 1;
  console.log(`Audit: ${audit.length} listing -> hedef ${targets.length}`, byRatio);
  console.log(`Atlanan: ${skipped.length}\n`);

  const work = targets.slice(0, LIMIT);
  const report = [];
  let updated = 0, noop = 0, failed = 0, notarget = 0;

  for (let i = 0; i < work.length; i++) {
    const t = work[i];
    const id = t.listing_id;
    const tag = `[${i + 1}/${work.length}] ${id} (${t.ratio})`;
    try {
      const inv = (await axios.get(`https://openapi.etsy.com/v3/application/listings/${id}/inventory`, { headers })).data;
      const products = inv.products || [];
      const sizeProp = propIdByHint(products, SIZE_PROP_HINTS);
      const framePropRaw = propIdByHint(products, FRAME_PROP_HINTS);
      const frameProp = framePropRaw === sizeProp ? null : framePropRaw;

      // En küçük boyutu alan üzerinden bul
      let minLabel = null, minArea = Infinity;
      for (const p of products) {
        const label = valOf(p, sizeProp);
        const d = dims(label);
        if (!d) continue;
        const area = d.w * d.h;
        if (area < minArea) { minArea = area; minLabel = label; }
      }

      // Hedef ürün: en küçük boyut + istenen çerçeve
      const idx = products.findIndex(p =>
        valOf(p, sizeProp) === minLabel &&
        (frameProp == null || (valOf(p, frameProp) || '').toLowerCase() === FRAME.toLowerCase())
      );

      if (idx === -1) {
        notarget++;
        console.log(`${tag} ATLANDI - "${minLabel}" + ${FRAME} kombinasyonu yok`);
        report.push({ listing_id: id, title: t.title, ratio: t.ratio, status: 'no-target', min_size: minLabel });
        await sleep(220);
        continue;
      }

      const target = products[idx];
      const oldPrice = target.offerings[0].price.amount / target.offerings[0].price.divisor;

      if (Math.abs(oldPrice - PRICE) < 0.005) {
        noop++;
        console.log(`${tag} zaten $${PRICE} - atlandi`);
        report.push({ listing_id: id, title: t.title, ratio: t.ratio, status: 'already-set', min_size: minLabel, price: oldPrice });
        await sleep(120);
        continue;
      }

      const payload = {
        products: products.map((p, j) => toPutProduct(p, j === idx ? PRICE : null)),
        price_on_property: inv.price_on_property || [],
        quantity_on_property: inv.quantity_on_property || [],
        sku_on_property: inv.sku_on_property || []
      };

      console.log(`${tag} "${minLabel}" + ${FRAME}: $${oldPrice} -> $${PRICE}${EXECUTE ? '' : '  [DRY RUN]'}`);

      if (EXECUTE) {
        await axios.put(`https://openapi.etsy.com/v3/application/listings/${id}/inventory`, payload, {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      updated++;
      report.push({
        listing_id: id, title: t.title, ratio: t.ratio,
        status: EXECUTE ? 'updated' : 'dry-run',
        min_size: minLabel, frame: FRAME,
        old_price: oldPrice, new_price: PRICE,
        variation_count: products.length
      });
    } catch (e) {
      failed++;
      const err = e.response?.data || e.message;
      console.log(`${tag} HATA:`, JSON.stringify(err).slice(0, 300));
      report.push({ listing_id: id, title: t.title, ratio: t.ratio, status: 'error', error: err });
    }
    await sleep(260);
  }

  const outPath = EXECUTE ? 'scratch/min_roll_price_execute.json' : 'scratch/min_roll_price_dryrun.json';
  fs.writeFileSync(outPath, JSON.stringify({ price: PRICE, ratios: RATIOS, frame: FRAME, shop_id, report, skipped }, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log(`  ${EXECUTE ? 'GUNCELLENDI' : 'DRY RUN'}: ${updated} | zaten dogru: ${noop} | hedef yok: ${notarget} | hata: ${failed}`);
  console.log(`  Rapor: backend/${outPath}`);
  console.log('='.repeat(60));
}

main().catch(e => { console.error('FATAL', e.response?.data || e.message); process.exit(1); });
