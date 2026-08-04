import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_SEED_PATH = join(__dirname, '../config/templates_seed.json');
const PROFILES_SEED_PATH = join(__dirname, '../config/profiles_seed.json');

/**
 * Veritabanındaki tüm mockup şablonlarını ve koordinatlarını JSON dosyasına aktarır (Git yedeklemesi için).
 */
export function exportTemplatesToSeed() {
  try {
    const templates = db.prepare('SELECT id, shop_id, name, type, config, background_path, created_at FROM templates').all();
    fs.writeFileSync(TEMPLATES_SEED_PATH, JSON.stringify(templates, null, 2), 'utf8');
    console.log(`[TemplateSync] ${templates.length} mockup şablonu ve koordinatları config/templates_seed.json dosyasına aktarıldı.`);

    const profiles = db.prepare('SELECT id, shop_id, name, ratio, sizes, frames, combinations, template_ids, created_at FROM variation_profiles').all();
    fs.writeFileSync(PROFILES_SEED_PATH, JSON.stringify(profiles, null, 2), 'utf8');
    console.log(`[TemplateSync] ${profiles.length} varyasyon profili config/profiles_seed.json dosyasına aktarıldı.`);

    return { templateCount: templates.length, profileCount: profiles.length };
  } catch (err) {
    console.error('[TemplateSync] Şablonlar dışa aktarılırken hata oluştu:', err.message);
    return null;
  }
}

/**
 * config/templates_seed.json ve profiles_seed.json dosyalarındaki şablonları veritabanına geri yükler.
 */
export function importTemplatesFromSeed() {
  try {
    let importedTemplates = 0;
    if (fs.existsSync(TEMPLATES_SEED_PATH)) {
      const content = fs.readFileSync(TEMPLATES_SEED_PATH, 'utf8');
      const templates = JSON.parse(content);

      const stmt = db.prepare(`
        INSERT INTO templates (id, shop_id, name, type, config, background_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          config = excluded.config,
          background_path = excluded.background_path
      `);

      db.exec('BEGIN');
      for (const t of templates) {
        stmt.run(
          t.id,
          t.shop_id || 'default_shop',
          t.name,
          t.type,
          typeof t.config === 'object' ? JSON.stringify(t.config) : t.config,
          t.background_path || '',
          t.created_at || new Date().toISOString()
        );
        importedTemplates++;
      }
      db.exec('COMMIT');
      console.log(`[TemplateSync] ${importedTemplates} mockup şablonu/koordinatı veritabanına yüklendi.`);
    }

    let importedProfiles = 0;
    if (fs.existsSync(PROFILES_SEED_PATH)) {
      const content = fs.readFileSync(PROFILES_SEED_PATH, 'utf8');
      const profiles = JSON.parse(content);

      const stmt = db.prepare(`
        INSERT INTO variation_profiles (id, shop_id, name, ratio, sizes, frames, combinations, template_ids, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_id, id) DO UPDATE SET
          name = excluded.name,
          ratio = excluded.ratio,
          sizes = excluded.sizes,
          frames = excluded.frames,
          combinations = excluded.combinations,
          template_ids = excluded.template_ids
      `);

      db.exec('BEGIN');
      for (const p of profiles) {
        stmt.run(
          p.id,
          p.shop_id || 'default_shop',
          p.name,
          p.ratio,
          typeof p.sizes === 'object' ? JSON.stringify(p.sizes) : p.sizes,
          typeof p.frames === 'object' ? JSON.stringify(p.frames) : p.frames,
          typeof p.combinations === 'object' ? JSON.stringify(p.combinations) : p.combinations,
          typeof p.template_ids === 'object' ? JSON.stringify(p.template_ids) : p.template_ids,
          p.created_at || new Date().toISOString()
        );
        importedProfiles++;
      }
      db.exec('COMMIT');
      console.log(`[TemplateSync] ${importedProfiles} varyasyon profili veritabanına yüklendi.`);
    }

    return { importedTemplates, importedProfiles };
  } catch (err) {
    console.error('[TemplateSync] Şablonlar içe aktarılırken hata oluştu:', err.message);
    return null;
  }
}
