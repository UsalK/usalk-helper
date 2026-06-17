import fs from 'fs';

const doc = JSON.parse(fs.readFileSync('../etsy-api_doc.json', 'utf8'));

// Search references to 513 or 514
let found = [];
function search(obj, path = '') {
  if (!obj) return;
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'description' && typeof v === 'string' && (v.includes('513') || v.includes('custom') || v.includes('inventory'))) {
        found.push({ path, description: v });
      }
      search(v, `${path}.${k}`);
    }
  }
}

search(doc);
console.log(`Found ${found.length} items:`);
found.slice(0, 10).forEach(f => {
  console.log(`\nPath: ${f.path}`);
  console.log(`Description: ${f.description.substring(0, 300)}...`);
});
