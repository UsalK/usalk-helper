import { DatabaseSync } from 'node:sqlite';

const dbPath = './db/database.db';
const db = new DatabaseSync(dbPath);

console.log("=== TEMPLATES IN DB ===");
try {
  const templates = db.prepare('SELECT id, name, type, config FROM templates').all();
  templates.forEach(t => {
    console.log(`\n- ID: ${t.id}, Name: ${t.name}, Type: ${t.type}`);
    console.log("  Config:", JSON.parse(t.config));
  });
} catch (e) {
  console.error("Error:", e.message);
}
