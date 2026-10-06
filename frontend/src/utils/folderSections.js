// Klasör yapısından mağaza bölümü çıkarımı.
// Beklenen düzen: <mağaza>/<Bölüm Adı (shop_section_id)>/<görsel>
// Örn: "usalk/Abstract Wall Art (59012638)/UK-001.png" — ID yok sayılır, ada bakılır.

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export const isImageFile = (file) =>
  (file.type && file.type.startsWith('image/')) || IMAGE_EXT.test(file.name);

const normalize = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Bölüm adlarında ayırt edici olmayan kelimeler; eşleşmeyi bunlar belirlememeli.
const GENERIC = new Set(['wall', 'art', 'arts', 'and', 'the', 'of', 'decor', 'print', 'prints', 'poster', 'posters', 've']);

const tokens = (s) => normalize(s).split(' ').filter(Boolean);
const coreTokens = (s) => {
  const all = tokens(s);
  const core = all.filter(t => !GENERIC.has(t));
  return core.length ? core : all;
};

/** Tekil/çoğul ve kısaltma farklarını tolere eden kelime eşitliği. */
const sameWord = (a, b) => {
  if (a === b) return true;
  const sa = a.replace(/s$/, ''), sb = b.replace(/s$/, '');
  if (sa === sb) return true;
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  return short.length >= 5 && long.startsWith(short);
};

/** Göreli yoldan görselin bulunduğu klasörün adını döndürür ("" = kök). */
export const parentFolderOf = (relPath) => {
  const parts = String(relPath || '').split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : '';
};

/** "Abstract Wall Art (59012638)" → "Abstract Wall Art" */
export const folderTitle = (folderName) => String(folderName || '').replace(/\s*\(\d+\)\s*$/, '').trim();

/** 0..1 arası benzerlik; ortak ayırt edici kelime yoksa 0. */
export const titleSimilarity = (a, b) => {
  if (normalize(a) === normalize(b)) return 1;
  const ta = coreTokens(a), tb = coreTokens(b);
  const shared = ta.filter(x => tb.some(y => sameWord(x, y))).length;
  if (shared === 0) return 0;
  return shared / (ta.length + tb.length - shared);
};

const MIN_SCORE = 0.3;

/**
 * Klasör adına en benzer mağaza bölümünü bulur. Parantez içindeki ID
 * dikkate alınmaz (üretim sırasında yanlış yazılabiliyor), yalnızca ad.
 * Dönüş: { sectionId, title, score, exact } ya da eşleşme yoksa null.
 */
export const matchFolderToSection = (folderName, shopSections = []) => {
  const title = folderTitle(folderName);
  if (!title) return null;
  let best = null;
  for (const s of shopSections) {
    const score = titleSimilarity(title, s.title);
    if (score >= MIN_SCORE && (!best || score > best.score)) {
      best = { sectionId: String(s.shop_section_id), title: s.title, score, exact: score === 1 };
    }
  }
  return best;
};

const readAllEntries = (dirEntry) =>
  new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const all = [];
    // readEntries tek çağrıda en fazla ~100 kayıt döndürür; boş gelene kadar oku.
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });

const entryToFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

const walkEntry = async (entry, prefix, out) => {
  if (entry.isFile) {
    const file = await entryToFile(entry);
    out.push({ file, relPath: prefix + file.name });
  } else if (entry.isDirectory) {
    const children = await readAllEntries(entry);
    for (const child of children) await walkEntry(child, `${prefix}${entry.name}/`, out);
  }
};

/**
 * Sürükle-bırak verisinden (klasörler dahil) { file, relPath } listesi çıkarır.
 * DataTransfer olay bitince geçersizleşir; entry'ler senkron alınmalı.
 */
export const collectDroppedFiles = async (dataTransfer) => {
  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .filter(it => it.kind === 'file')
    .map(it => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null));

  if (entries.length === 0 || entries.some(e => !e)) {
    return Array.from(dataTransfer.files || []).map(file => ({ file, relPath: file.name }));
  }
  const out = [];
  for (const entry of entries) await walkEntry(entry, '', out);
  return out;
};

/** <input webkitdirectory> veya normal dosya seçiminden { file, relPath } listesi. */
export const filesFromInput = (fileList) =>
  Array.from(fileList || []).map(file => ({ file, relPath: file.webkitRelativePath || file.name }));

// --- Kullanıcı kararlarının hatırlanması (mağaza başına, tarayıcıda) ---
const memoryKey = (shopId) => `usalk.folderSections.${shopId || 'default'}`;
const folderKey = (folder) => normalize(folderTitle(folder));

export const loadFolderMemory = (shopId) => {
  try {
    return JSON.parse(localStorage.getItem(memoryKey(shopId))) || {};
  } catch {
    return {};
  }
};

/** Klasör adı → bölüm kararını kaydeder; sectionId boşsa kararı siler. */
export const rememberFolderSection = (shopId, folder, sectionId) => {
  try {
    const mem = loadFolderMemory(shopId);
    if (sectionId) mem[folderKey(folder)] = String(sectionId);
    else delete mem[folderKey(folder)];
    localStorage.setItem(memoryKey(shopId), JSON.stringify(mem));
  } catch { /* depolama kapalıysa karar yalnızca bu oturumda geçerli */ }
};

/** Hatırlanan bölüm hâlâ mağazada varsa ID'sini döndürür. */
export const recallFolderSection = (memory, folder, shopSections = []) => {
  const id = memory[folderKey(folder)];
  if (!id) return null;
  return shopSections.length === 0 || shopSections.some(s => String(s.shop_section_id) === id) ? id : null;
};
