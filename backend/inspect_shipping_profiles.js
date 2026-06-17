import { DatabaseSync } from 'node:sqlite';
import axios from 'axios';
import 'dotenv/config';

const dbPath = 'c:/Users/usalk/Desktop/helper/backend/db/database.db';
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
  
  const url = `https://openapi.etsy.com/v3/application/shops/${auth.shop_id}/shipping-profiles`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        'x-api-key': `${client_id}:${client_secret}`,
        'Authorization': `Bearer ${auth.access_token}`
      }
    });
    console.log("SUCCESS! Shipping profiles:");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("API CALL FAILED!");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Message:", err.message);
    }
  }
}

test();
