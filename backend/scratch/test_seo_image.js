/**
 * Bir görseli gerçek SEO pipeline'ından geçirir ve sonucu okunur biçimde basar.
 * Sanatçı/tarz politikası değişikliğini uçtan uca doğrulamak için.
 *
 *   node scratch/test_seo_image.js "C:/yol/gorsel.jpg" [shopId]
 */
import 'dotenv/config';
import fs from 'fs';
import { generateSEO } from '../services/KimiService.js';

const imagePath = process.argv[2];
const shopId = process.argv[3] || '65571647';

if (!imagePath || !fs.existsSync(imagePath)) {
  console.error('Görsel bulunamadı:', imagePath);
  process.exit(1);
}

const line = (n = 62) => '='.repeat(n);

const r = await generateSEO(imagePath, 'US/UK', 'vintage poster, art deco', shopId, 'etsy', null, null);

console.log('\n' + line());
console.log('  SEO SONUCU:', imagePath.split(/[\\/]/).pop());
console.log(line());

console.log('\nVISUAL_STYLE  ->', JSON.stringify(r.visual_style));
console.log('SUBJECT       ->', r.subject);
console.log('ORIENTATION   ->', r.orientation);
console.log('COLORS        ->', r.primary_color, '/', r.secondary_color);
console.log('ROOM          ->', JSON.stringify(r.room));

console.log(`\nTITLE (${(r.title || '').length} karakter):`);
console.log(' ', r.title);

console.log(`\nDESCRIPTION:`);
console.log(' ', r.description || r.description_hook);

console.log(`\nTAGS (${(r.tags || []).length}):`);
(r.tags || []).forEach((t, i) => console.log(`  ${String(i + 1).padStart(2)}. ${t}  (${t.length})`));

// Politikanın iki yönünü de kontrol et
const blob = [r.title, r.description, ...(r.tags || []), ...(r.visual_style || [])].join(' | ').toLowerCase();
const leaked = ['picasso', 'warhol', 'basquiat', 'kusama', 'banksy', 'disney', 'ghibli', 'kahlo', 'rothko']
  .filter(n => blob.includes(n));
const styleNamed = (r.visual_style || []).length > 0;

console.log('\n' + line());
console.log('  KONTROL');
console.log(line());
console.log(`  visual_style dolu mu      : ${styleNamed ? 'EVET' : 'HAYIR (BASARISIZ)'}`);
console.log(`  telifli isim sizmis mi    : ${leaked.length ? 'EVET -> ' + leaked.join(', ') + ' (BASARISIZ)' : 'HAYIR'}`);
console.log(line() + '\n');
