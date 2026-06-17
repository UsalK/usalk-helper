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
    
    console.log("All properties for node 1027:");
    res.data.results.forEach(p => {
      console.log(`- ID: ${p.property_id}, Name: ${p.name}, DisplayName: ${p.display_name}, Required: ${p.is_required}, Multi: ${p.is_multivalued}`);
      if (p.possible_values && p.possible_values.length > 0) {
        console.log(`  Possible values (first 5):`, p.possible_values.slice(0, 5).map(v => `${v.value_id}: ${v.name}`));
      }
    });
  } catch (err) {
    console.error("API CALL FAILED!", err.response?.data || err.message);
  }
}

test();
