import fs from 'fs';

const doc = JSON.parse(fs.readFileSync('../etsy-api_doc.json', 'utf8'));

const propertyPaths = Object.keys(doc.paths).filter(p => p.toLowerCase().includes('property') || p.toLowerCase().includes('properties'));

console.log("Matching property paths:");
propertyPaths.forEach(p => {
  console.log(`- ${p} (${Object.keys(doc.paths[p]).join(', ')})`);
});
