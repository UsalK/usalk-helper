/**
 * Sanatçı/marka politikasının alan bazlı davranış testi.
 *   node scratch/test_artist_policy.js
 */
import { sanitizeText, ARTIST_POLICY_PROMPT } from '../services/KimiService.js';

const cases = [
  // [alan, girdi, beklenen]

  // --- Kamu malı: visual_style ve description'da ad AYNEN kalmalı ---
  ['visual_style', 'Gustav Klimt',                 'Gustav Klimt'],
  ['visual_style', 'klimt',                        'Klimt'],
  ['visual_style', 'Art Nouveau',                  'Art Nouveau'],
  ['visual_style', 'Vienna Secession',             'Vienna Secession'],
  ['visual_style', 'van gogh',                     'Van Gogh'],
  ['visual_style', 'Ukiyo-e',                      'Ukiyo-e'],
  ['description',  'Inspired by the golden mosaics of Gustav Klimt.', 'Inspired by the golden mosaics of Gustav Klimt.'],

  // --- Kamu malı: title/tags'te "Style" eki eklenmeli ---
  ['title',        'Klimt Wall Art',               'Klimt Style Wall Art'],
  ['title',        'Gustav Klimt Portrait',        'Gustav Klimt Style Portrait'],
  ['tags',         'van gogh art',                 'Van Gogh Style art'],
  ['tags',         'monet garden art',             'Monet Style garden art'],

  // --- Zaten nitelenmişse ikinci "Style" eklenmemeli ---
  ['title',        'Klimt Style Wall Art',         'Klimt Style Wall Art'],
  ['title',        'Klimt Inspired Gold Art',      'Klimt Inspired Gold Art'],

  // --- Telifli sanatçılar: HER alanda silinmeli ---
  ['visual_style', 'Basquiat',                     'Neo-Expressionist'],
  ['visual_style', 'Yayoi Kusama',                 'Polka Dot Contemporary'],
  ['title',        'Picasso Style Portrait',       'Cubist Style Portrait'],
  ['description',  'A Banksy inspired stencil.',   'A Graffiti Art inspired stencil.'],
  ['tags',         'warhol pop print',             'Pop Art pop print'],
  ['visual_style', 'Frida Kahlo',                  'Mexican Folk Surrealist'],

  // --- Markalar: her alanda silinmeli ---
  ['visual_style', 'Studio Ghibli',                'Anime Landscape'],
  ['title',        'Disney Princess Art',          'Fantasy Art Princess Art'],
  ['tags',         'gucci luxury decor',           'Luxury Fashion Style luxury decor'],

  // --- Yanlış pozitif olmamalı ---
  ['title',        'Sharing Moments Wall Art',     'Sharing Moments Wall Art'],
  ['title',        'Grasshopper Meadow Print',     'Grasshopper Meadow Print'],
  ['visual_style', 'Abstract Expressionist',       'Abstract Expressionist'],
  ['title',        'Golf Course Wall Art',         'Golf Course Wall Art'],
];

// Resmedilen konu: eser o kişiyi GÖSTERİYORSA adı "Style" eki almamalı.
// Bir Van Gogh otoportresinde "Van Gogh Style Portrait" yanlış — tarz Bizans mozaiği,
// Van Gogh ise konunun kendisi.
const depicted = new Set(['Vincent Van Gogh', 'Van Gogh']);
const depictedCases = [
  ['title', 'Van Gogh Portrait Wall Art',        'Van Gogh Portrait Wall Art'],
  ['title', 'Vincent Van Gogh Mosaic Poster',    'Vincent Van Gogh Mosaic Poster'],
  ['tags',  'van gogh wall art',                 'Van Gogh wall art'],
  // Aynı metindeki BAŞKA bir kamu malı sanatçı hâlâ tarz atfı sayılır
  ['title', 'Van Gogh Portrait, Klimt Mosaic',   'Van Gogh Portrait, Klimt Style Mosaic'],
];

let pass = 0, fail = 0;
for (const [field, input, expected] of depictedCases) {
  const got = sanitizeText(input, field, { keepBare: depicted });
  if (got === expected) { pass++; console.log(`  OK   [${field}+konu] "${input}" -> "${got}"`); }
  else { fail++; console.log(`  FAIL [${field}+konu] "${input}"\n         beklenen: "${expected}"\n         gelen   : "${got}"`); }
}

for (const [field, input, expected] of cases) {
  const got = sanitizeText(input, field);
  if (got === expected) { pass++; console.log(`  OK   [${field}] "${input}" -> "${got}"`); }
  else { fail++; console.log(`  FAIL [${field}] "${input}"\n         beklenen: "${expected}"\n         gelen   : "${got}"`); }
}

console.log(`\n=== ${pass} OK / ${fail} FAIL ===`);
console.log('\n--- Prompt\'a eklenen politika blogu ---');
console.log(ARTIST_POLICY_PROMPT);
process.exit(fail ? 1 : 0);
