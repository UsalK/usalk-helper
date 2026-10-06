import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Plus, Check, RefreshCw, X, Folder } from 'lucide-react';
import { folderTitle } from '../utils/folderSections';

/** Klasörü bir bölüme bağlanmamış (ve elle değiştirilmemiş) görsel mi? */
export const isUnmatched = (item, folderMap) =>
  Boolean(item.folder && !item.sectionManual && folderMap[item.folder]?.status === 'none');

/** Özet satırı / modal filtresi: { ratio, sectionId?, unmatched } */
export const matchesSpec = (item, spec, folderMap) => {
  if ((item.ratioName || '?') !== spec.ratio) return false;
  const unmatched = isUnmatched(item, folderMap);
  if (spec.unmatched) return unmatched;
  if (unmatched) return false;
  return spec.sectionId === undefined || (item.sectionId || '') === spec.sectionId;
};

/** Oran bazlı satırlar: eşleşenler üstte (çoktan aza), eşleşmeyenler en altta. */
const buildRows = (items, folderMap) => {
  const rows = new Map();
  for (const item of items) {
    const unmatched = isUnmatched(item, folderMap);
    const ratio = item.ratioName || '?';
    const key = `${unmatched ? 1 : 0}|${ratio}`;
    if (!rows.has(key)) rows.set(key, { key, ratio, unmatched, count: 0, sections: new Map() });
    const row = rows.get(key);
    row.count++;
    if (!unmatched) {
      const sid = item.sectionId || '';
      row.sections.set(sid, (row.sections.get(sid) || 0) + 1);
    }
  }
  return [...rows.values()].sort((a, b) => (a.unmatched - b.unmatched) || (b.count - a.count));
};

const chip = 'transition-colors rounded-lg border text-[11px] font-semibold px-2.5 py-1';

/** Seçilen dosyaların oran → adet → bölüm özeti. Her parça tıklanınca görselleri açar. */
export default function SectionSummary({ items, folderMap, shopSections, onOpen }) {
  if (items.length === 0) return null;
  const rows = buildRows(items, folderMap);
  const titleOf = (id) => (id ? shopSections.find(s => String(s.shop_section_id) === id)?.title || `#${id}` : 'Bölümsüz');
  const unmatchedCount = rows.filter(r => r.unmatched).reduce((n, r) => n + r.count, 0);

  return (
    <div className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
        <h4 className="text-sm font-bold text-white">Bölüm Özeti</h4>
        <span className="text-[10px] text-slate-500">{items.length} görsel</span>
      </div>

      <div className="space-y-2">
        {rows.map(row => (
          <div
            key={row.key}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
              row.unmatched ? 'bg-rose-500/[0.05] border-rose-500/30' : 'bg-[#151f32] border-[#1e293b]'
            }`}
          >
            <span className="flex items-center w-14 flex-shrink-0 text-xs font-bold text-slate-200 tabular-nums">
              {row.unmatched && <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-400 flex-shrink-0" />}
              {row.ratio}
            </span>

            <button
              onClick={(e) => onOpen({ ratio: row.ratio, unmatched: row.unmatched, origin: e.currentTarget.getBoundingClientRect() })}
              className={`${chip} flex-shrink-0 ${
                row.unmatched
                  ? 'text-rose-300 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
              }`}
            >
              {row.count} adet
            </button>

            <div className="flex flex-wrap gap-1.5 min-w-0">
              {row.unmatched ? (
                <button
                  onClick={(e) => onOpen({ ratio: row.ratio, unmatched: true, origin: e.currentTarget.getBoundingClientRect() })}
                  className={`${chip} text-rose-300 border-transparent hover:border-rose-500/30`}
                >
                  Eşleşmedi
                </button>
              ) : (
                [...row.sections.entries()].map(([sid, n]) => (
                  <button
                    key={sid}
                    title={`${n} görsel`}
                    onClick={(e) => onOpen({ ratio: row.ratio, sectionId: sid, unmatched: false, origin: e.currentTarget.getBoundingClientRect() })}
                    className={`${chip} text-slate-200 bg-[#0e1726] border-[#1e293b] hover:border-slate-600 truncate max-w-full`}
                  >
                    {titleOf(sid)}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {unmatchedCount > 0 && (
        <p className="text-[10px] text-rose-300/80">
          {unmatchedCount} görsel bir bölüme bağlanmadı. Satıra tıklayıp bağlayın ya da yeni bölüm açın; karar bu mağaza için hatırlanır.
        </p>
      )}
    </div>
  );
}

const GAP = 5;
const MIN_CELL = 200;

/**
 * n adet aynı oranlı görsel için ekranı en iyi dolduran sütun sayısını bulur:
 * her sütun sayısı denenir, görsel genişliği en büyük olan seçilir.
 * Görseller çok küçülecekse sabit hücre genişliğiyle dikey kaydırmaya geçer.
 */
export const bestGrid = (n, ratio, vw, vh) => {
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((vw - GAP * (cols - 1)) / cols, ((vh - GAP * (rows - 1)) / rows) * ratio);
    if (w > best.w + 0.5) best = { cols, w };
  }
  if (best.w < MIN_CELL) {
    const cols = Math.max(1, Math.min(n, Math.floor((vw + GAP) / (MIN_CELL + GAP))));
    best = { cols, w: (vw - GAP * (cols - 1)) / cols };
  }
  return { cols: best.cols, w: Math.floor(best.w), h: Math.floor(best.w / ratio) };
};

/** Görselleri ekranı en iyi kaplayan matriste dizer; arada 5px. */
const ImageGrid = ({ items, urlOf, reserve = 0 }) => {
  const ratio = items.reduce((t, i) => t + (i.ratioVal || 1), 0) / items.length;
  const { cols, w, h } = bestGrid(items.length, ratio, window.innerWidth - 20, window.innerHeight - 20 - reserve);
  return (
    <div className="grid justify-center" style={{ gap: GAP, gridTemplateColumns: `repeat(${cols}, ${w}px)` }}>
      {items.map(i => (urlOf(i)
        ? <img key={i.id} src={urlOf(i)} alt={i.name} title={i.name} style={{ width: w, height: h }} className="object-contain" />
        // URL bir kare sonra gelir; yer tutucu, açılış animasyonunun boyutu doğru ölçmesini sağlar.
        : <div key={i.id} style={{ width: w, height: h }} className="bg-white/5" />
      ))}
    </div>
  );
};

/** Eşleşmeyen klasör için karar çubuğu: mevcut bölüme bağla ya da yeni bölüm aç. */
const FolderDecision = ({ folder, count, shopSections, onAssign, draft, onDraftChange, onCreate }) => {
  const drafting = draft && draft.folder === folder;
  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#0e1726] border border-rose-500/30 rounded-2xl px-3 py-2 mb-[5px]">
      <Folder className="w-3.5 h-3.5 text-rose-400" />
      <span className="text-xs font-semibold text-white mr-1">{folderTitle(folder)}</span>
      <span className="text-[10px] text-slate-500 mr-2">{count} görsel</span>
      {drafting ? (
        <>
          <input
            autoFocus
            value={draft.title}
            disabled={draft.busy}
            onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') { e.stopPropagation(); onDraftChange(null); } }}
            placeholder="Yeni bölüm adı"
            className="w-48 bg-[#151f32] border border-amber-500/30 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none"
          />
          <button
            onClick={onCreate}
            disabled={draft.busy}
            className="flex items-center text-[11px] font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 rounded-lg px-2.5 py-1.5"
          >
            {draft.busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" />Bölümü aç</>}
          </button>
          <button onClick={() => onDraftChange(null)} disabled={draft.busy} className="text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <select
            value=""
            onChange={(e) => e.target.value && onAssign(folder, e.target.value)}
            className="bg-[#151f32] border border-[#1e293b] rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none"
          >
            <option value="">Bölüme bağla…</option>
            {shopSections.map(s => (
              <option key={s.shop_section_id} value={String(s.shop_section_id)}>{s.title}</option>
            ))}
          </select>
          <button
            onClick={() => onDraftChange({ folder, title: folderTitle(folder), busy: false })}
            className="flex items-center text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 rounded-lg px-2.5 py-1.5"
          >
            <Plus className="w-3 h-3 mr-0.5" />Yeni bölüm
          </button>
        </>
      )}
    </div>
  );
};

/**
 * macOS "genie" benzeri açılış: içerik, tıklanan öğeden huni şeklinde
 * süzülerek açılır; kapanırken aynı yoldan geri döner.
 */
const genieKeyframes = (fromRect, el) => {
  const r = el.getBoundingClientRect();
  const dx = fromRect ? fromRect.left + fromRect.width / 2 - (r.left + r.width / 2) : 0;
  const dy = fromRect ? fromRect.top + fromRect.height / 2 - (r.top + r.height / 2) : r.height / 2;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  // Huninin dar ucu kaynak öğeye bakar.
  const funnel = (narrow, wide) => {
    const a = (100 - wide) / 2, b = (100 + wide) / 2, c = (100 - narrow) / 2, d = (100 + narrow) / 2;
    if (horizontal) {
      return dx > 0
        ? `polygon(0% ${a}%, 100% ${c}%, 100% ${d}%, 0% ${b}%)`
        : `polygon(0% ${c}%, 100% ${a}%, 100% ${b}%, 0% ${d}%)`;
    }
    return dy > 0
      ? `polygon(${a}% 0%, ${b}% 0%, ${d}% 100%, ${c}% 100%)`
      : `polygon(${c}% 0%, ${d}% 0%, ${b}% 100%, ${a}% 100%)`;
  };
  const [sx, sy] = horizontal ? [0.08, 0.25] : [0.25, 0.08];
  const [mx, my] = horizontal ? [0.55, 0.85] : [0.85, 0.55];
  return [
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, clipPath: funnel(6, 40), opacity: 0.2 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35}px) scale(${mx}, ${my})`, clipPath: funnel(35, 90), opacity: 1, offset: 0.45 },
    { transform: 'translate(0px, 0px) scale(1, 1)', clipPath: funnel(100, 100), opacity: 1 }
  ];
};

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Tıklanan özet parçasındaki görselleri gösteren sade modal.
 * Eşleşmeyenlerde her klasörün üstünde karar çubuğu bulunur.
 */
export function ImagePreviewModal({ items, unmatched, origin, onClose, ...decisionProps }) {
  const backdropRef = useRef(null);
  const contentRef = useRef(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const content = contentRef.current, backdrop = backdropRef.current;
    if (!content || reduceMotion()) return onClose();
    const opts = { duration: 320, easing: 'cubic-bezier(.55,0,.75,.3)', fill: 'forwards' };
    content.animate(genieKeyframes(origin, content).reverse(), opts);
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], opts);
    // onfinish yerine zamanlayıcı: sekme arka plandayken animasyon durabilir, modal yine kapanmalı.
    setTimeout(onClose, opts.duration);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    const content = contentRef.current, backdrop = backdropRef.current;
    if (!content || reduceMotion()) return;
    content.animate(genieKeyframes(origin, content), { duration: 480, easing: 'cubic-bezier(.2,.85,.25,1)' });
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Önizleme URL'leri efektte üretilir ki StrictMode'un çift mount'u bunları geçersiz kılmasın.
  const [urlMap, setUrlMap] = useState({});
  const idsKey = items.map(i => i.id).join('|');
  useEffect(() => {
    const map = {};
    items.forEach(i => { map[i.id] = URL.createObjectURL(i.file); });
    setUrlMap(map);
    return () => Object.values(map).forEach(u => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);
  const urlOf = (item) => urlMap[item.id];

  const byFolder = unmatched
    ? [...items.reduce((m, i) => m.set(i.folder, [...(m.get(i.folder) || []), i]), new Map()).entries()]
    : null;

  // Sayfadaki transform'lu kapsayıcılar fixed konumu daraltmasın diye body'ye taşınır.
  const onBackdrop = (e) => { if (e.target === e.currentTarget) close(); };

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-auto p-[5px] flex" onClick={onBackdrop}>
      <div ref={backdropRef} className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={onBackdrop} />
      <button onClick={close} className="fixed top-3 right-3 z-10 text-slate-400 hover:text-white bg-black/50 rounded-full p-1.5">
        <X className="w-4 h-4" />
      </button>
      <div ref={contentRef} className="relative m-auto will-change-transform" onClick={onBackdrop}>
        {byFolder ? (
          <div className="flex flex-col gap-[5px]">
            {byFolder.map(([folder, list]) => (
              <div key={folder}>
                <FolderDecision folder={folder} count={list.length} {...decisionProps} />
                <ImageGrid items={list} urlOf={urlOf} reserve={56} />
              </div>
            ))}
          </div>
        ) : (
          <ImageGrid items={items} urlOf={urlOf} />
        )}
      </div>
    </div>,
    document.body
  );
}
