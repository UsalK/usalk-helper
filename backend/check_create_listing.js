import fs from 'fs';

const doc = JSON.parse(fs.readFileSync('../etsy-api_doc.json', 'utf8'));

const createListingPath = '/v3/application/shops/{shop_id}/listings';
const method = doc.paths[createListingPath];

if (method && method.post) {
  console.log("Found POST /v3/application/shops/{shop_id}/listings");
  const schema = method.post.requestBody.content['application/x-www-form-urlencoded'].schema;
  console.log("Required fields:", schema.required);
  console.log("Properties keys:", Object.keys(schema.properties));
  
  // Look for any property containing 'readiness' or 'shipping' or 'state'
  const matches = Object.keys(schema.properties).filter(k => k.includes('readiness') || k.includes('profile') || k.includes('shipping'));
  console.log("Matching properties:", matches);
  matches.forEach(m => {
    console.log(`- ${m}:`, JSON.stringify(schema.properties[m], null, 2));
  });
} else {
  console.log("Create listing path not found.");
}
