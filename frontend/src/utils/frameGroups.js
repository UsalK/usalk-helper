// Çerçeve seçeneklerinin fiyat gruplaması.
//
// Uygulamada çerçeve türlerinin fiyatı üç kümede toplanır: rulo baskı,
// gerdirilmiş kanvas ve çerçeveli baskılar. Çerçeveli olanların (Gold, Black,
// Silver, White, Natural Wood, Walnut ...) fiyatı pratikte hep aynıdır; bu
// yüzden fiyat matrisinde tek sütunda toplanabilirler.
//
// Gruplama yalnızca DÜZENLEME görünümünü etkiler. Kaydederken fiyatlar yine
// her çerçeve için ayrı ayrı yazılır (combinations: {size, frame, price}),
// böylece render, Etsy yükleme ve fiyat güncelleme tarafında hiçbir şey
// değişmez.

/** Bir çerçeve adının hangi fiyat grubuna girdiği. */
export function frameGroupOf(frame) {
  const name = String(frame || '').toLowerCase();
  if (name.includes('roll') || name.includes('rulo')) return 'roll';
  if (name.includes('stretched') || name.includes('canvas') || name.includes('kanvas')) return 'canvas';
  return 'frame';
}

export const FRAME_GROUP_LABELS = {
  roll: 'Roll (Rulo)',
  canvas: 'Stretched Wood',
  frame: 'Çerçeveli'
};

/** Grupların matriste görünme sırası. */
const GROUP_ORDER = ['roll', 'canvas', 'frame'];

/**
 * Çerçeve listesini fiyat gruplarına ayırır.
 * Yalnızca içinde çerçeve bulunan gruplar döner.
 *
 * @param {string[]} frames
 * @returns {{key: string, label: string, frames: string[]}[]}
 */
export function groupFrames(frames = []) {
  const buckets = new Map();
  for (const frame of frames) {
    const key = frameGroupOf(frame);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(frame);
  }

  return GROUP_ORDER
    .filter(key => buckets.has(key))
    .map(key => ({
      key,
      label: FRAME_GROUP_LABELS[key],
      frames: buckets.get(key)
    }));
}

/**
 * Bir grubun ortak fiyatı. Gruptaki çerçevelerin fiyatları birbirinden
 * farklıysa null döner; arayüz bunu "farklı" olarak gösterir.
 */
export function groupPriceOf(priceMap, size, group) {
  const values = group.frames.map(f => priceMap[`${size}_${f}`]);
  const first = values[0];
  return values.every(v => v === first) ? (first ?? '') : null;
}

/** Grubun tüm çerçevelerine aynı fiyatı yazar. */
export function setGroupPrice(priceMap, size, group, value) {
  const price = Number(value) || 0;
  const next = { ...priceMap };
  for (const frame of group.frames) {
    next[`${size}_${frame}`] = price;
  }
  return next;
}
