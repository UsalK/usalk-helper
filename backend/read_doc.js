import fs from 'fs';

const doc = JSON.parse(fs.readFileSync('../etsy-api_doc.json', 'utf8'));

// Search for the endpoint PUT /listings/{listing_id}/inventory
// or paths that contain inventory
const inventoryPath = Object.keys(doc.paths).find(p => p.includes('inventory'));

if (inventoryPath) {
  console.log("Found path:", inventoryPath);
  const methods = doc.paths[inventoryPath];
  console.log("Methods:", Object.keys(methods));
  
  if (methods.put) {
    console.log("PUT description:", methods.put.description || methods.put.summary);
    if (methods.put.requestBody) {
      console.log("Request Body Schema:", JSON.stringify(methods.put.requestBody.content['application/json'].schema, null, 2));
    }
  }
} else {
  console.log("Inventory path not found in openapi doc.");
}
