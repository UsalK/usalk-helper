import fs from 'fs';

const doc = JSON.parse(fs.readFileSync('../etsy-api_doc.json', 'utf8'));

// Search for properties endpoint details
const pathName = '/v3/application/shops/{shop_id}/listings/{listing_id}/properties/{property_id}';
const endpoint = doc.paths[pathName];

if (endpoint) {
  console.log("Endpoint details for PUT properties:");
  console.log(JSON.stringify(endpoint.put, null, 2));
} else {
  console.log("Path not found");
}

const pathName2 = '/v3/application/shops/{shop_id}/listings/{listing_id}/properties';
const endpoint2 = doc.paths[pathName2];
if (endpoint2) {
  console.log("Endpoint details for GET/POST/PUT properties:");
  console.log(JSON.stringify(endpoint2, null, 2));
}
