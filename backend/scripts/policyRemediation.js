/**
 * Etsy politika temizligi — tek seferlik calistirilir.
 *
 *   node backend/scripts/policyRemediation.js            # DRY RUN (hicbir sey degismez)
 *   node backend/scripts/policyRemediation.js --apply    # sadece B grubu guncellemeleri
 *   node backend/scripts/policyRemediation.js --apply --confirm-delete   # + A grubu silme
 *
 * Silme GERI ALINAMAZ. --confirm-delete ayri bir bayrak, cunku --apply'a
 * kazara basmak 11 listingi yok etmemeli. Her destructive cagridan ONCE
 * eslesen tum listinglerin tam JSON'u logs/ altina yedeklenir.
 *
 * Eslestirme SKU ile degil TAM BASLIK ile yapiliyor: CSV export'unda
 * listinglerin cogunda SKU alani bos.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '..');       // .../usalk-helper/backend
const ROOT = path.resolve(BACKEND, '..');            // .../usalk-helper

// EtsyService process.env'i hazir bulmayi bekliyor (normalde server.js yukluyor).
dotenv.config({ path: path.join(BACKEND, '.env') });
dotenv.config({ path: path.join(ROOT, '.env') });

// Dinamik import: EtsyService (ve zincirindeki db.js) import aninda process.env'i
// okuyabildigi icin dotenv'den SONRA yuklenmeli. pathToFileURL Windows yollarini
// da dogru file:// URL'ine cevirir.
const { getValidToken, updateListing } = await import(
  pathToFileURL(path.join(BACKEND, 'services', 'EtsyService.js')).href
);

const APPLY = process.argv.includes('--apply');
const CONFIRM_DELETE = process.argv.includes('--confirm-delete');

const planPath = path.join(__dirname, 'policy-remediation-plan.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

// Etsy API basliklari HTML-entity kodlu dondurur: "Rock&#39;n&#39;Roll".
// Cozmeden karsilastirirsak apostrof/ampersand iceren basliklar eslesmez.
// &amp; en sona birakiliyor ki "&amp;#39;" gibi cift kodlamalar bozulmasin.
const decodeEntities = (s) =>
  (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');

const norm = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim().toLowerCase();

const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const log = [];
const say = (msg) => { console.log(msg); log.push(msg); };

/** Magazadaki tum listingleri ceker (active + inactive + draft). */
async function fetchAllListings() {
  const { access_token, client_id, client_secret, shop_id } = await getValidToken();
  const headers = {
    'x-api-key': `${client_id}:${client_secret}`,
    Authorization: `Bearer ${access_token}`
  };
  const all = [];
  for (const state of ['active', 'inactive', 'draft']) {
    let offset = 0;
    for (;;) {
      const url = `https://openapi.etsy.com/v3/application/shops/${shop_id}/listings`;
      const res = await axios.get(url, { headers, params: { state, limit: 100, offset } });
      const results = res.data?.results || [];
      all.push(...results.map(l => ({ ...l, _state: state })));
      if (results.length < 100) break;
      offset += 100;
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return { all, shop_id };
}

async function deleteListing(listing_id) {
  const { access_token, client_id, client_secret } = await getValidToken();
  return axios.delete(`https://openapi.etsy.com/v3/application/listings/${listing_id}`, {
    headers: {
      'x-api-key': `${client_id}:${client_secret}`,
      Authorization: `Bearer ${access_token}`
    }
  });
}

(async () => {
  const { all, shop_id } = await fetchAllListings();
  say(`Magaza: shop_id=${shop_id} — ${all.length} listing cekildi (active+inactive+draft)`);
  say(`Mod: ${APPLY ? (CONFIRM_DELETE ? 'APPLY + SILME' : 'APPLY (sadece guncelleme)') : 'DRY RUN'}`);
  say('');

  const byTitle = new Map();
  for (const l of all) {
    const k = norm(l.title);
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(l);
  }

  const resolve = (item) => {
    const hits = byTitle.get(norm(item.match_title)) || [];
    if (hits.length === 0) return { error: 'ESLESME YOK' };
    if (hits.length > 1) return { error: `${hits.length} ADET AYNI BASLIK — elle bak` };
    return { listing: hits[0] };
  };

  // ---- Yedek: dokunulacak her listingin mevcut hali ----
  const touched = [];
  for (const it of [...plan.delete, ...plan.update]) {
    const r = resolve(it);
    if (r.listing) touched.push(r.listing);
  }
  const backupPath = path.join(LOG_DIR, `policy-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(touched, null, 2));
  say(`Yedek: ${backupPath} (${touched.length} listing)`);
  say('');

  // ---- A GRUBU: SIL ----
  say('=== A GRUBU — SILINECEK ===');
  let delOk = 0, delFail = 0;
  for (const it of plan.delete) {
    const r = resolve(it);
    if (r.error) { say(`  [ATLANDI] ${r.error} :: ${it.match_title.slice(0, 70)}`); delFail++; continue; }
    const l = r.listing;
    say(`  ${l.listing_id} (${l._state}) :: ${l.title.slice(0, 70)}`);
    say(`      sebep: ${it.reason}`);
    if (APPLY && CONFIRM_DELETE) {
      try { await deleteListing(l.listing_id); say('      -> SILINDI'); delOk++; }
      catch (e) { say(`      -> HATA: ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`); delFail++; }
      await new Promise(r2 => setTimeout(r2, 250));
    }
  }
  say('');

  // ---- B GRUBU: BASLIK + TAG GUNCELLE ----
  say('=== B GRUBU — GUNCELLENECEK ===');
  let updOk = 0, updFail = 0;
  for (const it of plan.update) {
    const r = resolve(it);
    if (r.error) { say(`  [ATLANDI] ${r.error} :: ${it.match_title.slice(0, 70)}`); updFail++; continue; }
    const l = r.listing;
    say(`  ${l.listing_id} (${l._state})`);
    say(`      eski: ${it.match_title.slice(0, 90)}`);
    say(`      yeni: ${it.new_title.slice(0, 90)}`);
    if (it.changed_tags.length) say(`      tag : ${it.changed_tags.join(' | ')}`);
    if (APPLY) {
      try {
        await updateListing(l.listing_id, { title: it.new_title, tags: it.new_tags });
        say('      -> GUNCELLENDI'); updOk++;
      } catch (e) {
        say(`      -> HATA: ${e.response?.status} ${JSON.stringify(e.response?.data || e.message)}`); updFail++;
      }
    }
  }

  say('');
  say(`OZET — silinen: ${delOk}, silme hatasi/atlanan: ${delFail}, guncellenen: ${updOk}, guncelleme hatasi/atlanan: ${updFail}`);
  if (!APPLY) say('DRY RUN idi, hicbir sey degismedi. Uygulamak icin --apply ekle.');
  if (APPLY && !CONFIRM_DELETE) say('Silme yapilmadi: --confirm-delete bayragi verilmedi.');

  const logPath = path.join(LOG_DIR, `policy-remediation-${stamp}.log`);
  fs.writeFileSync(logPath, log.join('\n'));
  console.log(`\nLog: ${logPath}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
