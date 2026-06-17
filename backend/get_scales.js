import { DatabaseSync } from 'node:sqlite';
import axios from 'axios';
import 'dotenv/config';

const dbPath = './db/database.db';
const db = new DatabaseSync(dbPath);

async function test() {
  const authStmt = db.prepare('SELECT * FROM etsy_auth WHERE id = 1');
  const auth = authStmt.get();
  
  if (!auth) {
    console.error("No auth token in DB");
    return;
  }
  
  const client_id = process.env.ETSY_CLIENT_ID;
  const client_secret = process.env.ETSY_CLIENT_SECRET;
  
  const url = `https://openapi.etsy.com/v3/application/seller-taxonomy/nodes/1027/properties`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        'x-api-key': `${client_id}:${client_secret}`,
        'Authorization': `Bearer ${auth.access_token}`
      }
    });
    
    res.data.results.forEach(p => {
      if (p.property_id === 47626759898 || p.property_id === 47626759834) {
        console.log(`Property: ${p.name} (ID: ${p.property_id})`);
        console.log("Scales:", JSON.stringify(p.scales, null, 2));
      }
    });
  } catch (err) {
    console.error("API CALL FAILED!", err.response?.data || err.message);
  }
}

test();
