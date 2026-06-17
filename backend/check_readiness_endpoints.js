import fs from 'fs';

const doc = JSON.parse(fs.readFileSync('../etsy-api_doc.json', 'utf8'));

const readinessPaths = Object.keys(doc.paths).filter(p => p.toLowerCase().includes('readiness') || p.toLowerCase().includes('state'));

console.log("Matching paths:");
readinessPaths.forEach(p => {
  console.log(`- ${p} (${Object.keys(doc.paths[p]).join(', ')})`);
});
