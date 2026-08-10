import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Plus, Save, Layers, Frame, Compass, Sliders, CheckCircle,
  Trash2, Crop, Move, HelpCircle, RefreshCw, CheckSquare, Square,
  GripVertical, ArrowUp, ArrowDown, X, Shuffle, Lock, Pin, Eye, ListOrdered
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

// Bir oranın mockup dizilim ayarının varsayılanı (backend/services/MockupOrder.js ile aynı)
const DEFAULT_ORDER = {
  enabled: false,
  thumbnailFirst: true,
  mode: 'custom',
  pinned: [],
  restMode: 'random',
  staticLast: true
};

const templateKey = (t) => (t.type === 'static' ? `static_${t.id}` : t.id);
const isThumbTemplate = (t) => {
  if (!t) return false;
  const cfgThumb = t.config?.is_thumbnail === true || t.config?.is_thumbnail === 'true';
  const nameThumb = (t.name || '').toLowerCase().startsWith('thumb');
  return cfgThumb || nameThumb;
};

const FRAME_OPTIONS = [
  { id: 'stretched', name: 'Stretched Wood (Çerçevesiz)' },
  { id: 'black_frame', name: 'Black Frame (Siyah)' },
  { id: 'white_frame', name: 'White Frame (Beyaz)' },
  { id: 'gold_frame', name: 'Gold Frame (Altın)' },
  { id: 'silver_frame', name: 'Silver Frame (Gümüş)' },
  { id: 'natural_wood', name: 'Natural Wood (Doğal Ahşap)' },
  { id: 'walnut', name: 'Walnut (Ceviz)' }
];

const parseRatio = (ratioStr) => {
  if (!ratioStr) return 1;
  const parts = ratioStr.split(':');
  if (parts.length === 2) {
    return Number(parts[0]) / Number(parts[1]);
  }
  return 1;
};

const drawRealisticFrame = (ctx, x, y, w, h, style, thickness) => {
  if (!style || style === 'stretched') return;
  
  const t = parseFloat(thickness) || 4;
  
  // Inner corners (matches the original bounds of the artwork)
  const itl = { x: x, y: y };
  const itr = { x: x + w, y: y };
  const ibr = { x: x + w, y: y + h };
  const ibl = { x: x, y: y + h };

  // Outer corners (expands outwards by thickness 't')
  const otl = { x: x - t, y: y - t };
  const otr = { x: x + w + t, y: y - t };
  const obr = { x: x + w + t, y: y + h + t };
  const obl = { x: x - t, y: y + h + t };

  const drawTrapezoid = (p1, p2, p3, p4, fillStyle) => {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  };

  const drawWoodGrains = (p1, p2, p3, p4, isHorizontal, darkColor) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1;

    const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
    const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
    const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
    const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

    if (isHorizontal) {
      const height = maxY - minY;
      const steps = Math.max(3, Math.floor(height / 2.5));
      for (let i = 0; i < steps; i++) {
        const yOffset = minY + (i / steps) * height + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(minX, yOffset);
        ctx.bezierCurveTo(
          minX + (maxX - minX) * 0.25, yOffset - 1,
          minX + (maxX - minX) * 0.75, yOffset + 1,
          maxX, yOffset
        );
        ctx.stroke();
      }
    } else {
      const width = maxX - minX;
      const steps = Math.max(3, Math.floor(width / 2.5));
      for (let i = 0; i < steps; i++) {
        const xOffset = minX + (i / steps) * width + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(xOffset, minY);
        ctx.bezierCurveTo(
          xOffset - 1, minY + (maxY - minY) * 0.25,
          xOffset + 1, minY + (maxY - minY) * 0.75,
          xOffset, maxY
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  if (style === 'black_frame') {
    const gTop = ctx.createLinearGradient(otl.x, otl.y, itl.x, itl.y);
    gTop.addColorStop(0, '#374151');
    gTop.addColorStop(1, '#111827');
    drawTrapezoid(otl, otr, itr, itl, gTop);

    const gLeft = ctx.createLinearGradient(otl.x, otl.y, itl.x, itl.y);
    gLeft.addColorStop(0, '#1f2937');
    gLeft.addColorStop(1, '#0f172a');
    drawTrapezoid(otl, obl, ibl, itl, gLeft);

    const gBottom = ctx.createLinearGradient(obl.x, obl.y, ibl.x, ibl.y);
    gBottom.addColorStop(0, '#0f172a');
    gBottom.addColorStop(1, '#020617');
    drawTrapezoid(obl, obr, ibr, ibl, gBottom);

    const gRight = ctx.createLinearGradient(otr.x, otr.y, itr.x, itr.y);
    gRight.addColorStop(0, '#0f172a');
    gRight.addColorStop(1, '#020617');
    drawTrapezoid(otr, obr, ibr, itr, gRight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  } else if (style === 'white_frame') {
    drawTrapezoid(otl, otr, itr, itl, '#f8fafc');
    drawTrapezoid(otl, obl, ibl, itl, '#f1f5f9');
    drawTrapezoid(obl, obr, ibr, ibl, '#cbd5e1');
    drawTrapezoid(otr, obr, ibr, itr, '#e2e8f0');

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - t, y - t, w + 2*t, h + 2*t);
    ctx.strokeRect(x, y, w, h);
  } else if (style === 'gold_frame') {
    const gTop = ctx.createLinearGradient(otl.x, otl.y, otr.x, otr.y);
    gTop.addColorStop(0, '#c5a059');
    gTop.addColorStop(0.3, '#fdf5e6');
    gTop.addColorStop(0.5, '#aa7c11');
    gTop.addColorStop(0.7, '#fdf5e6');
    gTop.addColorStop(1, '#c5a059');
    drawTrapezoid(otl, otr, itr, itl, gTop);

    const gLeft = ctx.createLinearGradient(otl.x, otl.y, obl.x, obl.y);
    gLeft.addColorStop(0, '#c5a059');
    gLeft.addColorStop(0.5, '#aa7c11');
    gLeft.addColorStop(1, '#8c6308');
    drawTrapezoid(otl, obl, ibl, itl, gLeft);

    const gBottom = ctx.createLinearGradient(obl.x, obl.y, obr.x, obr.y);
    gBottom.addColorStop(0, '#8c6308');
    gBottom.addColorStop(0.5, '#c5a059');
    gBottom.addColorStop(1, '#5a3f00');
    drawTrapezoid(obl, obr, ibr, ibl, gBottom);

    const gRight = ctx.createLinearGradient(otr.x, otr.y, obr.x, obr.y);
    gRight.addColorStop(0, '#c5a059');
    gRight.addColorStop(0.5, '#aa7c11');
    gRight.addColorStop(1, '#5a3f00');
    drawTrapezoid(otr, obr, ibr, itr, gRight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - t + 0.5, y - t + 0.5, w + 2*t - 1, h + 2*t - 1);
  } else if (style === 'silver_frame') {
    const gTop = ctx.createLinearGradient(otl.x, otl.y, otr.x, otr.y);
    gTop.addColorStop(0, '#94a3b8');
    gTop.addColorStop(0.3, '#f8fafc');
    gTop.addColorStop(0.5, '#64748b');
    gTop.addColorStop(0.7, '#f8fafc');
    gTop.addColorStop(1, '#94a3b8');
    drawTrapezoid(otl, otr, itr, itl, gTop);

    const gLeft = ctx.createLinearGradient(otl.x, otl.y, obl.x, obl.y);
    gLeft.addColorStop(0, '#94a3b8');
    gLeft.addColorStop(0.5, '#64748b');
    gLeft.addColorStop(1, '#475569');
    drawTrapezoid(otl, obl, ibl, itl, gLeft);

    const gBottom = ctx.createLinearGradient(obl.x, obl.y, obr.x, obr.y);
    gBottom.addColorStop(0, '#475569');
    gBottom.addColorStop(0.5, '#cbd5e1');
    gBottom.addColorStop(1, '#334155');
    drawTrapezoid(obl, obr, ibr, ibl, gBottom);

    const gRight = ctx.createLinearGradient(otr.x, otr.y, obr.x, obr.y);
    gRight.addColorStop(0, '#94a3b8');
    gRight.addColorStop(0.5, '#64748b');
    gRight.addColorStop(1, '#334155');
    drawTrapezoid(otr, obr, ibr, itr, gRight);
  } else if (style === 'natural_wood') {
    drawTrapezoid(otl, otr, itr, itl, '#dfb17b');
    drawTrapezoid(otl, obl, ibl, itl, '#d2a26c');
    drawTrapezoid(obl, obr, ibr, ibl, '#bd8d58');
    drawTrapezoid(otr, obr, ibr, itr, '#bd8d58');

    drawWoodGrains(otl, otr, itr, itl, true, 'rgba(90, 60, 30, 0.08)');
    drawWoodGrains(otl, obl, ibl, itl, false, 'rgba(90, 60, 30, 0.08)');
    drawWoodGrains(obl, obr, ibr, ibl, true, 'rgba(90, 60, 30, 0.08)');
    drawWoodGrains(otr, obr, ibr, itr, false, 'rgba(90, 60, 30, 0.08)');
  } else if (style === 'walnut') {
    drawTrapezoid(otl, otr, itr, itl, '#5c4033');
    drawTrapezoid(otl, obl, ibl, itl, '#4e3629');
    drawTrapezoid(obl, obr, ibr, ibl, '#3d2b1f');
    drawTrapezoid(otr, obr, ibr, itr, '#3d2b1f');

    drawWoodGrains(otl, otr, itr, itl, true, 'rgba(30, 15, 5, 0.15)');
    drawWoodGrains(otl, obl, ibl, itl, false, 'rgba(30, 15, 5, 0.15)');
    drawWoodGrains(obl, obr, ibr, ibl, true, 'rgba(30, 15, 5, 0.15)');
    drawWoodGrains(otr, obr, ibr, itr, false, 'rgba(30, 15, 5, 0.15)');
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(otl.x, otl.y); ctx.lineTo(itl.x, itl.y);
  ctx.moveTo(otr.x, otr.y); ctx.lineTo(itr.x, itr.y);
  ctx.moveTo(obr.x, obr.y); ctx.lineTo(ibr.x, ibr.y);
  ctx.moveTo(obl.x, obl.y); ctx.lineTo(ibl.x, ibl.y);
  ctx.stroke();
}

export default function TemplateStudio() {
  const [templates, setTemplates] = useState([]);
  const [variationProfiles, setVariationProfiles] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'editor'
  
  // Library sharing states
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryTemplates, setLibraryTemplates] = useState([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState([]);
  const [selectedLibraryShopId, setSelectedLibraryShopId] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  
  // Static templates tab state
  const [activeSubTab, setActiveSubTab] = useState('mockup'); // 'mockup' | 'static' | 'order'

  // Mockup sıralama (dizilim) state'i
  const [orderConfig, setOrderConfig] = useState({}); // { '2:3': {...}, ... }
  const [orderRatio, setOrderRatio] = useState('2:3');
  const [orderPreview, setOrderPreview] = useState([]);
  const [orderPreviewLoading, setOrderPreviewLoading] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderDirty, setOrderDirty] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [staticName, setStaticName] = useState('');
  const [staticFile, setStaticFile] = useState(null);
  const [staticRatios, setStaticRatios] = useState(['2:3']);
  const [showStaticUpload, setShowStaticUpload] = useState(false);

  const handleSaveStaticImage = async (e) => {
    e.preventDefault();
    if (!staticName.trim()) {
      alert('Lütfen bir isim girin.');
      return;
    }
    if (!staticFile) {
      alert('Lütfen bir görsel seçin.');
      return;
    }
    if (staticRatios.length === 0) {
      alert('Lütfen en az bir uyumlu oran seçin.');
      return;
    }

    const config = {
      compatible_ratios: staticRatios,
      is_thumbnail: isStaticThumbnail
    };

    const formData = new FormData();
    formData.append('name', staticName);
    formData.append('type', 'static');
    formData.append('config', JSON.stringify(config));
    formData.append('background', staticFile);

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/templates`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowStaticUpload(false);
      setStaticName('');
      setStaticFile(null);
      setStaticRatios(['2:3']);
      setIsStaticThumbnail(false);
      fetchTemplates();
    } catch (err) {
      console.error(err);
      alert('Görsel kaydedilirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };
  const [loading, setLoading] = useState(false);
  const [filterRatio, setFilterRatio] = useState('All');
  const [bgImage, setBgImage] = useState(null); // Image object
  const [bgFile, setBgFile] = useState(null); // File object
  const [bgUrl, setBgUrl] = useState('');

  // Template Form Config State
  const [name, setName] = useState('');
  const [type, setType] = useState('flat'); // 'flat' | 'perspective'
  const [compatibleRatios, setCompatibleRatios] = useState(['2:3']);
  const [activeRatio, setActiveRatio] = useState('2:3');
  const [isThumbnail, setIsThumbnail] = useState(false);
  const [isStaticThumbnail, setIsStaticThumbnail] = useState(false);
  
  // Flat Mode coordinates (normalized 0-1)
  const [flatPlacement, setFlatPlacement] = useState({
    x: 0.25, y: 0.25, width: 0.5, height: 0.5
  });

  // Flat styling
  const [frameStyle, setFrameStyle] = useState('black_frame');
  const [frameThickness, setFrameThickness] = useState(3.0);
  const [shadowEnabled, setShadowEnabled] = useState(true);
  const [shadowSides, setShadowSides] = useState('bottom');
  const [shadowOpacity, setShadowOpacity] = useState(3.0);
  const [shadowDistance, setShadowDistance] = useState(5.0);
  const [shadowBlur, setShadowBlur] = useState(6.0);

  // Perspective Mode 4 corners (normalized 0-1, TL, TR, BR, BL order)
  const [corners, setCorners] = useState({
    tl: { x: 0.25, y: 0.25 },
    tr: { x: 0.75, y: 0.25 },
    br: { x: 0.75, y: 0.75 },
    bl: { x: 0.25, y: 0.75 }
  });

  // Editor Interaction State
  const [activeHandle, setActiveHandle] = useState(null); // null | 'tl' | 'tr' | 'br' | 'bl' | 'center' (flat) | 'corner-tl' | 'corner-tr' | 'corner-br' | 'corner-bl' (perspective)
  const [selectedHandle, setSelectedHandle] = useState(null); // persists after mouseup for keyboard fine-tuning
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoomPoint, setZoomPoint] = useState(null); // null | {x, y} for magnifying glass

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const zoomTimeoutRef = useRef(null);

  useEffect(() => {
    fetchTemplates();
    fetchVariationProfiles();
    fetchOrderConfig();
  }, []);

  // Keyboard navigation for selected handle (fine-tuning)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (view !== 'editor' || !selectedHandle || !bgImage) return;

      const w = canvasRef.current?.width || 100;
      const h = canvasRef.current?.height || 100;

      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowLeft') dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else if (e.key === 'ArrowUp') dy = -1;
      else if (e.key === 'ArrowDown') dy = 1;

      if (dx === 0 && dy === 0) return;

      // Prevent window scrolling
      e.preventDefault();

      // Clear any pending zoom fade out timers when key is held down or pressed
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = null;
      }

      const speed = e.shiftKey ? 10 : 1;

      // Calculate step relative to original high-res image dimensions to allow 1px edits
      const stepX = 1 / bgImage.width;
      const stepY = 1 / bgImage.height;

      if (type === 'perspective' && selectedHandle.startsWith('corner-')) {
        const cornerKey = selectedHandle.replace('corner-', '');
        setCorners(prev => {
          const current = prev[cornerKey];
          const newX = Math.max(0, Math.min(1, current.x + dx * speed * stepX));
          const newY = Math.max(0, Math.min(1, current.y + dy * speed * stepY));
          
          // Show magnifying glass at new position
          setZoomPoint({ x: newX * w, y: newY * h });
          
          return {
            ...prev,
            [cornerKey]: { x: newX, y: newY }
          };
        });
      } else if (type === 'flat' && selectedHandle === 'center') {
        setFlatPlacement(prev => {
          const newX = Math.max(0, Math.min(1 - prev.width, prev.x + dx * speed * stepX));
          const newY = Math.max(0, Math.min(1 - prev.height, prev.y + dy * speed * stepY));
          return {
            ...prev,
            x: newX,
            y: newY
          };
        });
      }
    };

    const handleKeyUp = (e) => {
      if (e.key.startsWith('Arrow')) {
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(() => {
          setZoomPoint(null);
          zoomTimeoutRef.current = null;
        }, 1500); // Keep magnifier visible for 1.5 seconds after releasing arrow key
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, [view, selectedHandle, type, bgImage]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/templates`);
      setTemplates(res.data);
    } catch (err) {
      console.error('Şablonlar yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVariationProfiles = async () => {
    try {
      const res = await axios.get(`${API_BASE}/variations`);
      setVariationProfiles(res.data || []);
    } catch (err) {
      console.error('Varyasyon profilleri yüklenemedi:', err);
    }
  };

  const fetchOrderConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE}/templates/mockup-order`);
      setOrderConfig(res.data?.config || {});
      setOrderDirty(false);
    } catch (err) {
      console.error('Mockup dizilim ayarı yüklenemedi:', err);
    }
  };

  const ratioPresets = variationProfiles.length > 0
    ? Array.from(new Set(variationProfiles.map(p => p.ratio)))
    : ['2:3', '3:2', '1:1', '12:7', '7:12', '12:5'];

  // Seçili oran, mevcut oran listesinde yoksa ilk orana düş
  useEffect(() => {
    if (ratioPresets.length > 0 && !ratioPresets.includes(orderRatio)) {
      setOrderRatio(ratioPresets[0]);
    }
  }, [variationProfiles]);

  /* ---------------- Mockup dizilim yardımcıları ---------------- */

  const currentOrder = { ...DEFAULT_ORDER, ...(orderConfig[orderRatio] || {}) };

  // Bu orana ait şablonlar (mockup + statik)
  const orderTemplates = templates.filter(t => {
    const ratios = (t.config?.compatible_ratios && t.config.compatible_ratios.length > 0)
      ? t.config.compatible_ratios
      : ['2:3'];
    return ratios.includes(orderRatio);
  });
  const orderTemplateByKey = new Map(orderTemplates.map(t => [templateKey(t), t]));

  // Sabitlenmiş sıra: sadece bu oranda gerçekten var olan şablonlar
  const pinnedKeys = currentOrder.pinned.filter(k => orderTemplateByKey.has(k));
  // Thumbnail kuralı açıkken sabitlenen ilk thumbnail kapak (1. sıra) olur
  const coverKey = currentOrder.thumbnailFirst
    ? pinnedKeys.find(k => isThumbTemplate(orderTemplateByKey.get(k))) || null
    : null;
  const pinnedRows = pinnedKeys.filter(k => k !== coverKey);
  const poolTemplates = orderTemplates.filter(t => !pinnedKeys.includes(templateKey(t)));
  const thumbCount = orderTemplates.filter(isThumbTemplate).length;

  const patchOrder = (patch) => {
    setOrderConfig(prev => ({
      ...prev,
      [orderRatio]: { ...DEFAULT_ORDER, ...(prev[orderRatio] || {}), ...patch }
    }));
    setOrderDirty(true);
  };

  // Kapak her zaman dizinin başında tutulur; backend de ilk thumbnail'ı kapak sayar
  const setPinnedRows = (rows) => patchOrder({ pinned: coverKey ? [coverKey, ...rows] : rows });

  const addPinned = (key) => patchOrder({ enabled: true, pinned: [...pinnedKeys, key] });
  const removePinned = (key) => patchOrder({ pinned: pinnedKeys.filter(k => k !== key) });

  const movePinned = (key, direction) => {
    const idx = pinnedRows.indexOf(key);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= pinnedRows.length) return;
    const rows = [...pinnedRows];
    [rows[idx], rows[target]] = [rows[target], rows[idx]];
    setPinnedRows(rows);
  };

  const handleDropOnRow = (targetKey) => {
    if (!dragKey || dragKey === targetKey) return;
    const rows = pinnedRows.filter(k => k !== dragKey);
    const targetIdx = rows.indexOf(targetKey);
    rows.splice(targetIdx === -1 ? rows.length : targetIdx, 0, dragKey);
    if (!pinnedKeys.includes(dragKey)) patchOrder({ enabled: true });
    setPinnedRows(rows);
    setDragKey(null);
  };

  const handleDropOnList = () => {
    if (!dragKey || pinnedKeys.includes(dragKey)) return;
    addPinned(dragKey);
    setDragKey(null);
  };

  const handleDropOnPool = () => {
    if (!dragKey || !pinnedKeys.includes(dragKey)) return;
    removePinned(dragKey);
    setDragKey(null);
  };

  const runOrderPreview = async () => {
    setOrderPreviewLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/templates/mockup-order/preview`, {
        ratio: orderRatio,
        order: currentOrder
      });
      setOrderPreview(res.data?.items || []);
    } catch (err) {
      console.error('Dizilim önizlemesi alınamadı:', err);
      alert('Dizilim önizlemesi alınamadı.');
    } finally {
      setOrderPreviewLoading(false);
    }
  };

  const saveOrderConfig = async () => {
    setOrderSaving(true);
    try {
      // Tüm oranlar tek seferde kaydedilir; oran değiştirince veri kaybolmaz
      await axios.put(`${API_BASE}/templates/mockup-order`, { config: orderConfig });
      setOrderDirty(false);
    } catch (err) {
      console.error('Dizilim kaydedilemedi:', err);
      alert('Dizilim kaydedilirken hata oluştu.');
    } finally {
      setOrderSaving(false);
    }
  };

  const fetchLibraryTemplates = async () => {
    setLibraryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/templates/other-shops`);
      setLibraryTemplates(res.data);
      if (res.data.length > 0) {
        const uniqueShopIds = Array.from(new Set(res.data.map(t => t.shop_id)));
        if (uniqueShopIds.length > 0) {
          setSelectedLibraryShopId(uniqueShopIds[0]);
        }
      } else {
        setSelectedLibraryShopId(null);
      }
    } catch (err) {
      console.error('Kütüphane şablonları yüklenemedi:', err);
    } finally {
      setLibraryLoading(false);
    }
  };

  const handleCopyTemplates = async (ids) => {
    if (!ids || ids.length === 0) return;
    try {
      await axios.post(`${API_BASE}/templates/copy`, { templateIds: ids });
      alert('Şablon(lar) başarıyla kütüphaneden dükkanınıza kopyalandı!');
      setSelectedLibraryIds([]);
      setShowLibraryModal(false);
      fetchTemplates();
    } catch (err) {
      console.error('Şablonlar kopyalanamadı:', err);
      alert('Kopyalama işlemi başarısız oldu.');
    }
  };

  useEffect(() => {
    if (showLibraryModal) {
      setSelectedLibraryIds([]);
      setSelectedLibraryShopId(null);
      fetchLibraryTemplates();
    }
  }, [showLibraryModal]);

  // Redraw Canvas when configuration changes
  useEffect(() => {
    if (view === 'editor' && bgImage) {
      drawEditor();
    }
  }, [view, bgImage, type, flatPlacement, corners, frameStyle, frameThickness, shadowEnabled, shadowSides, shadowOpacity, shadowDistance, shadowBlur, activeHandle]);

  const handleCreateNew = () => {
    setBgImage(null);
    setBgFile(null);
    setBgUrl('');
    setName('');
    setType('flat');
    setCompatibleRatios(['2:3']);
    setFlatPlacement({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    setCorners({
      tl: { x: 0.25, y: 0.25 },
      tr: { x: 0.75, y: 0.25 },
      br: { x: 0.75, y: 0.75 },
      bl: { x: 0.25, y: 0.75 }
    });
    setFrameStyle('black_frame');
    setFrameThickness(3.0);
    setShadowEnabled(true);
    setShadowSides('bottom');
    setShadowOpacity(3.0);
    setShadowDistance(5.0);
    setShadowBlur(6.0);
    setIsThumbnail(false);
    setView('editor');
  };

  const handleBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setBgFile(file);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      setBgImage(img);
    };
  };

  const drawEditor = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Fit canvas to background image aspect ratio while keeping maximum container size
    const container = containerRef.current;
    if (!container) return;
    
    const maxWidth = container.clientWidth;
    const maxHeight = 500;
    
    let w = bgImage.width;
    let h = bgImage.height;
    
    const ratio = w / h;
    
    if (w > maxWidth) {
      w = maxWidth;
      h = w / ratio;
    }
    
    if (h > maxHeight) {
      h = maxHeight;
      w = h * ratio;
    }
    
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    
    // Draw background image
    ctx.drawImage(bgImage, 0, 0, w, h);
    
    // Draw overlays based on type
    if (type === 'flat') {
      drawFlatOverlay(ctx, w, h);
    } else {
      drawPerspectiveOverlay(ctx, w, h);
    }
  };

  const drawFlatOverlay = (ctx, w, h) => {
    const px = flatPlacement.x * w;
    const py = flatPlacement.y * h;
    const pw = flatPlacement.width * w;
    const ph = flatPlacement.height * h;

    // Draw dark backing tint outside placement area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    // Top
    ctx.fillRect(0, 0, w, py);
    // Bottom
    ctx.fillRect(0, py + ph, w, h - (py + ph));
    // Left
    ctx.fillRect(0, py, px, ph);
    // Right
    ctx.fillRect(px + pw, py, w - (px + pw), ph);

    // Draw shadow if enabled
    if (shadowEnabled) {
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity / 10})`;
      ctx.shadowBlur = shadowBlur;
      
      if (shadowSides === 'all' || shadowSides === 'bottom') {
        ctx.shadowOffsetY = shadowDistance;
      }
      if (shadowSides === 'all' || shadowSides === 'right') {
        ctx.shadowOffsetX = shadowDistance;
      }
      if (shadowSides === 'left') {
        ctx.shadowOffsetX = -shadowDistance;
      }
      if (shadowSides === 'top') {
        ctx.shadowOffsetY = -shadowDistance;
      }

      const t = (frameStyle !== 'stretched') ? parseFloat(frameThickness) || 0 : 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - t, py - t, pw + 2 * t, ph + 2 * t);
      ctx.restore();
    }

    // Draw Mockup placeholder background
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.fillRect(px, py, pw, ph);

    // Draw borders & frame thickness
    if (frameStyle !== 'stretched') {
      drawRealisticFrame(ctx, px, py, pw, ph, frameStyle, frameThickness);
    }

    // Outer bounding border
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px, py, pw, ph);

    // Draw center indicator
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw resize handles (TL, TR, BR, BL)
    drawHandle(ctx, px, py);
    drawHandle(ctx, px + pw, py);
    drawHandle(ctx, px + pw, py + ph);
    drawHandle(ctx, px, py + ph);

    // Bounding dimensions text
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Inter';
    ctx.fillText('Sanat Eseri Yerleşim Alanı', px + 6, py + 16);
  };

  const drawPerspectiveOverlay = (ctx, w, h) => {
    const tl = { x: corners.tl.x * w, y: corners.tl.y * h };
    const tr = { x: corners.tr.x * w, y: corners.tr.y * h };
    const br = { x: corners.br.x * w, y: corners.br.y * h };
    const bl = { x: corners.bl.x * w, y: corners.bl.y * h };

    // Draw quad polygon
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.fill();

    // Draw corners as glowing circles
    drawPerspectiveHandle(ctx, tl.x, tl.y, 'Sol Üst (TL)', selectedHandle === 'corner-tl');
    drawPerspectiveHandle(ctx, tr.x, tr.y, 'Sağ Üst (TR)', selectedHandle === 'corner-tr');
    drawPerspectiveHandle(ctx, br.x, br.y, 'Sağ Alt (BR)', selectedHandle === 'corner-br');
    drawPerspectiveHandle(ctx, bl.x, bl.y, 'Sol Alt (BL)', selectedHandle === 'corner-bl');
  };

  const drawHandle = (ctx, x, y) => {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.strokeRect(x - 5, y - 5, 10, 10);
  };

  const drawPerspectiveHandle = (ctx, x, y, label, isSelected) => {
    ctx.save();
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = isSelected ? 8 : 4;
    
    ctx.fillStyle = isSelected ? '#ffffff' : '#f59e0b';
    ctx.strokeStyle = '#0e1726';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw label
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(x + 10, y - 10, 60, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = '9px Inter';
    ctx.fillText(label, x + 14, y + 2);
  };

  const getFrameColor = (style) => {
    switch (style) {
      case 'black_frame': return '#111827';
      case 'white_frame': return '#f8fafc';
      case 'gold_frame': return '#eab308';
      case 'silver_frame': return '#cbd5e1';
      case 'natural_wood': return '#d97706';
      case 'walnut': return '#451a03';
      default: return '#111827';
    }
  };

  const handleRatioToggle = (ratio) => {
    setCompatibleRatios(prev => 
      prev.includes(ratio) ? prev.filter(r => r !== ratio) : [...prev, ratio]
    );
  };

  // Canvas Mouse interaction handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const w = canvas.width;
    const h = canvas.height;

    if (type === 'flat') {
      const px = flatPlacement.x * w;
      const py = flatPlacement.y * h;
      const pw = flatPlacement.width * w;
      const ph = flatPlacement.height * h;

      // Check corners for resizing
      const hitRadius = 10;
      if (Math.abs(x - px) < hitRadius && Math.abs(y - py) < hitRadius) {
        setActiveHandle('tl');
        setSelectedHandle('tl');
        return;
      }
      if (Math.abs(x - (px + pw)) < hitRadius && Math.abs(y - py) < hitRadius) {
        setActiveHandle('tr');
        setSelectedHandle('tr');
        return;
      }
      if (Math.abs(x - (px + pw)) < hitRadius && Math.abs(y - (py + ph)) < hitRadius) {
        setActiveHandle('br');
        setSelectedHandle('br');
        return;
      }
      if (Math.abs(x - px) < hitRadius && Math.abs(y - (py + ph)) < hitRadius) {
        setActiveHandle('bl');
        setSelectedHandle('bl');
        return;
      }

      // Check center dragging
      if (x > px && x < px + pw && y > py && y < py + ph) {
        setActiveHandle('center');
        setSelectedHandle('center');
        setDragOffset({ x: x - px, y: y - py });
        return;
      }
    } else {
      // Perspective mode corners
      const hitRadius = 15;
      const cornersCoords = {
        'corner-tl': { x: corners.tl.x * w, y: corners.tl.y * h },
        'corner-tr': { x: corners.tr.x * w, y: corners.tr.y * h },
        'corner-br': { x: corners.br.x * w, y: corners.br.y * h },
        'corner-bl': { x: corners.bl.x * w, y: corners.bl.y * h }
      };

      for (const [key, coord] of Object.entries(cornersCoords)) {
        if (Math.sqrt((x - coord.x) ** 2 + (y - coord.y) ** 2) < hitRadius) {
          setActiveHandle(key);
          setSelectedHandle(key);
          setZoomPoint({ x: coord.x, y: coord.y });
          return;
        }
      }
    }
    // Clicked elsewhere on canvas - clear selection
    setSelectedHandle(null);
  };

  const handleMouseMove = (e) => {
    if (!activeHandle) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const w = canvas.width;
    const h = canvas.height;

    // Constrain inside canvas
    const cx = Math.max(0, Math.min(w, x));
    const cy = Math.max(0, Math.min(h, y));

    const nx = cx / w;
    const ny = cy / h;

    if (type === 'flat') {
      const px = flatPlacement.x * w;
      const py = flatPlacement.y * h;
      const pw = flatPlacement.width * w;
      const ph = flatPlacement.height * h;
      const ratioValue = parseRatio(activeRatio);

      if (activeHandle === 'center') {
        const targetX = x - dragOffset.x;
        const targetY = y - dragOffset.y;
        setFlatPlacement(prev => ({
          ...prev,
          x: Math.max(0, Math.min(w - pw, targetX)) / w,
          y: Math.max(0, Math.min(h - ph, targetY)) / h
        }));
      } else if (activeHandle === 'br') {
        let newW = cx - px;
        let newH = newW / ratioValue;
        if (py + newH > h) {
          newH = h - py;
          newW = newH * ratioValue;
        }
        if (px + newW > w) {
          newW = w - px;
          newH = newW / ratioValue;
        }
        setFlatPlacement(prev => ({
          ...prev,
          width: Math.max(0.05, newW) / w,
          height: Math.max(0.05, newH) / h
        }));
      } else if (activeHandle === 'tr') {
        let newW = cx - px;
        let newH = newW / ratioValue;
        if (py + ph - newH < 0) {
          newH = py + ph;
          newW = newH * ratioValue;
        }
        if (px + newW > w) {
          newW = w - px;
          newH = newW / ratioValue;
        }
        setFlatPlacement(prev => ({
          ...prev,
          y: (py + ph - newH) / h,
          width: Math.max(0.05, newW) / w,
          height: Math.max(0.05, newH) / h
        }));
      } else if (activeHandle === 'bl') {
        let newW = px + pw - cx;
        let newH = newW / ratioValue;
        if (py + newH > h) {
          newH = h - py;
          newW = newH * ratioValue;
        }
        if (px + pw - newW < 0) {
          newW = px + pw;
          newH = newW / ratioValue;
        }
        setFlatPlacement(prev => ({
          ...prev,
          x: (px + pw - newW) / w,
          width: Math.max(0.05, newW) / w,
          height: Math.max(0.05, newH) / h
        }));
      } else if (activeHandle === 'tl') {
        let newW = px + pw - cx;
        let newH = newW / ratioValue;
        if (py + ph - newH < 0) {
          newH = py + ph;
          newW = newH * ratioValue;
        }
        if (px + pw - newW < 0) {
          newW = px + pw;
          newH = newW / ratioValue;
        }
        setFlatPlacement({
          x: (px + pw - newW) / w,
          y: (py + ph - newH) / h,
          width: Math.max(0.05, newW) / w,
          height: Math.max(0.05, newH) / h
        });
      }
    } else {
      // Perspective mode - update individual corner
      const cornerKey = activeHandle.replace('corner-', '');
      setCorners(prev => ({
        ...prev,
        [cornerKey]: { x: nx, y: ny }
      }));
      setZoomPoint({ x: cx, y: cy });
    }
  };

  const handleMouseUp = () => {
    setActiveHandle(null);
    setZoomPoint(null);
    if (zoomTimeoutRef.current) {
      clearTimeout(zoomTimeoutRef.current);
      zoomTimeoutRef.current = null;
    }
  };

  const handleSaveTemplate = async () => {
    if (!name.trim()) {
      alert('Lütfen şablon adını girin.');
      return;
    }
    if (!bgImage) {
      alert('Lütfen bir arka plan görseli yükleyin.');
      return;
    }

    const config = {
      compatible_ratios: compatibleRatios,
      editorWidth: canvasRef.current?.width || 800,
      is_thumbnail: isThumbnail
    };

    if (type === 'flat') {
      config.placement = flatPlacement;
      config.frame = {
        style: frameStyle,
        thickness: frameThickness
      };
      config.shadow = {
        enabled: shadowEnabled,
        sides: shadowSides,
        opacity: shadowOpacity,
        distance: shadowDistance,
        blur: shadowBlur
      };
    } else {
      config.corners = corners;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('type', type);
    formData.append('config', JSON.stringify(config));
    
    if (bgFile) {
      formData.append('background', bgFile);
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/templates`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setIsThumbnail(false);
      setView('list');
      fetchTemplates();
    } catch (err) {
      console.error(err);
      alert('Şablon kaydedilirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Bu şablonu silmek istediğinize emin misiniz?')) return;
    try {
      await axios.delete(`${API_BASE}/templates/${id}`);
      fetchTemplates();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleThumbnail = async (id, currentConfig) => {
    try {
      const updatedConfig = {
        ...currentConfig,
        is_thumbnail: !currentConfig?.is_thumbnail
      };
      await axios.patch(`${API_BASE}/templates/${id}`, { config: updatedConfig });
      fetchTemplates();
    } catch (err) {
      console.error(err);
      alert('Thumbnail durumu güncellenirken hata oluştu.');
    }
  };

  const renderStaticSection = () => {
    const staticTemplates = templates.filter(t => t.type === 'static');

    return (
      <div className="space-y-8 animate-fade-in text-slate-100">
        {/* Header toolbar */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Profil Bazlı Statik Görseller</h3>
            <p className="text-xs text-slate-400 mt-1">Her ürünün sonuna otomatik olarak eklenecek bilgilendirme görsellerini oran bazında gruplayın.</p>
          </div>
          {!showStaticUpload && (
            <button
              onClick={() => setShowStaticUpload(true)}
              className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-amber-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Statik Görsel Ekle</span>
            </button>
          )}
        </div>

        {/* Upload Form Modal */}
        {showStaticUpload && (
          <div className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-6 space-y-4 animate-fade-in-up">
            <h4 className="text-sm font-bold text-white">Yeni Statik Görsel Ekle</h4>
            <form onSubmit={handleSaveStaticImage} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Görsel Adı</label>
                  <input
                    type="text"
                    value={staticName}
                    onChange={(e) => setStaticName(e.target.value)}
                    placeholder="Örn: Size Chart (Boyut Tablosu)"
                    className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Uyumlu Oranlar</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ratioPresets.map(ratio => {
                      const isSelected = staticRatios.includes(ratio);
                      return (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => {
                            setStaticRatios(prev => 
                              isSelected ? prev.filter(r => r !== ratio) : [...prev, ratio]
                            );
                          }}
                          className={`text-[10px] px-3 py-1.5 border rounded-lg transition-colors font-bold ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                              : 'bg-[#151f32] border-[#1e293b] text-slate-400'
                          }`}
                        >
                          {ratio} Oranı
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Thumbnail Seçeneği */}
                <div className="flex items-center justify-between p-3 bg-[#151f32] border border-[#1e293b] rounded-2xl">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-white">Thumbnail Olarak Seç</span>
                    <p className="text-[9px] text-slate-500">Ürünün merkezde olduğu 1:1 mockup seçmeniz önerilir.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isStaticThumbnail}
                      onChange={(e) => setIsStaticThumbnail(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950 peer-checked:after:border-slate-950"></div>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Görsel Seç</label>
                  <div className="border border-dashed border-[#1e293b] rounded-2xl p-6 text-center hover:border-slate-700 transition-colors relative cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setStaticFile(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      required
                    />
                    <Crop className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <span className="text-[10px] text-slate-400 block">
                      {staticFile ? staticFile.name : 'Dosya seçmek için tıklayın veya sürükleyin'}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-2 pt-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowStaticUpload(false)}
                    className="bg-[#151f32] hover:bg-[#1c2942] border border-[#1e293b] text-slate-300 px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs transition-colors"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Profiles Sections list */}
        <div className="space-y-6">
          {ratioPresets.map(ratio => {
            const matchedImages = staticTemplates.filter(t => t.type === 'static');
            const filteredMatched = matchedImages.filter(t => t.config?.compatible_ratios?.includes(ratio));

            return (
              <div key={ratio} className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
                  <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>{ratio} Oranı Görselleri</span>
                  </h4>
                  <span className="text-[10px] font-bold text-slate-500">{filteredMatched.length} Görsel</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {filteredMatched.map(img => (
                    <div key={img.id} className="bg-[#151f32] border border-[#1e293b] rounded-2xl p-3 flex flex-col justify-between group hover:border-slate-800 transition-colors">
                      <div className="aspect-[4/3] rounded-xl bg-slate-950 border border-[#1e293b] overflow-hidden mb-3 relative">
                        <img
                          src={`http://localhost:3001/${img.background_path}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        {img.config?.is_thumbnail && (
                          <div className="absolute top-2 right-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border shadow-lg bg-emerald-500/80 border-emerald-500/30 text-white">
                              Thumbnail
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-white block truncate">{img.name}</span>
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => handleToggleThumbnail(img.id, img.config)}
                            className={`text-[10px] font-bold transition-colors ${
                              img.config?.is_thumbnail 
                                ? 'text-emerald-500 hover:text-emerald-400' 
                                : 'text-slate-500 hover:text-slate-400'
                            }`}
                          >
                            {img.config?.is_thumbnail ? '✓ Thumbnail' : 'Thumbnail Yap'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(img.id)}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-400 flex items-center space-x-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Sil</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredMatched.length === 0 && (
                    <div className="col-span-full py-6 text-center text-[11px] text-slate-500 italic">
                      Bu oran için eklenmiş statik görsel bulunmuyor.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderOrderSection = () => {
    const rowCard = (key, index, opts = {}) => {
      const tpl = orderTemplateByKey.get(key);
      if (!tpl) return null;
      const isThumb = isThumbTemplate(tpl);

      return (
        <div
          key={key}
          draggable
          onDragStart={() => setDragKey(key)}
          onDragEnd={() => setDragKey(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.stopPropagation(); handleDropOnRow(key); }}
          className={`flex items-center space-x-3 bg-[#151f32] border rounded-2xl p-2.5 transition-colors cursor-grab active:cursor-grabbing ${
            dragKey === key ? 'border-amber-500/60 opacity-60' : 'border-[#1e293b] hover:border-slate-700'
          }`}
        >
          <GripVertical className="w-4 h-4 text-slate-600 shrink-0" />
          <span className="w-6 h-6 shrink-0 rounded-lg bg-amber-500/15 text-amber-500 text-[10px] font-bold flex items-center justify-center">
            {index}
          </span>
          <div className="w-12 h-9 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-[#1e293b]">
            <img src={`http://localhost:3001/${tpl.background_path}`} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-[11px] font-semibold text-white truncate">{tpl.name}</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              {tpl.type === 'static' && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">Statik</span>
              )}
              {isThumb && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Thumbnail</span>
              )}
            </div>
          </div>
          {!opts.locked && (
            <div className="flex items-center space-x-0.5 shrink-0">
              <button type="button" onClick={() => movePinned(key, -1)} className="p-1 text-slate-500 hover:text-white transition-colors">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => movePinned(key, 1)} className="p-1 text-slate-500 hover:text-white transition-colors">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => removePinned(key)} className="p-1 text-rose-500 hover:text-rose-400 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {opts.locked && <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
        </div>
      );
    };

    const toggle = (label, hint, checked, onChange) => (
      <div className="flex items-center justify-between p-3 bg-[#151f32] border border-[#1e293b] rounded-2xl">
        <div className="space-y-0.5 pr-3">
          <span className="text-[11px] font-semibold text-white">{label}</span>
          <p className="text-[9px] text-slate-500 leading-relaxed">{hint}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
          <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950 peer-checked:after:border-slate-950"></div>
        </label>
      </div>
    );

    return (
      <div className="space-y-6 animate-fade-in text-slate-100">
        {/* Başlık */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Mockup Sıralaması</h3>
            <p className="text-xs text-slate-400 mt-1">
              Her oran için görsellerin Etsy/Shopify'a hangi sırayla yükleneceğini belirleyin. Ürün yüklemenize gerek yok.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {orderDirty && (
              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                Kaydedilmemiş değişiklik
              </span>
            )}
            <button
              onClick={saveOrderConfig}
              disabled={orderSaving}
              className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-amber-500/10 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{orderSaving ? 'Kaydediliyor...' : 'Dizilimi Kaydet'}</span>
            </button>
          </div>
        </div>

        {/* Oran seçimi */}
        <div className="flex flex-wrap gap-1 bg-[#0e1726] border border-[#1e293b] p-1 rounded-xl w-fit">
          {ratioPresets.map(ratio => {
            const cfg = orderConfig[ratio];
            return (
              <button
                key={ratio}
                onClick={() => setOrderRatio(ratio)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  orderRatio === ratio
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{ratio}</span>
                {cfg?.enabled && (
                  <span className={`w-1.5 h-1.5 rounded-full ${orderRatio === ratio ? 'bg-slate-950' : 'bg-emerald-500'}`} />
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ayarlar */}
          <div className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-5 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              <span>Kurallar</span>
            </h4>

            {toggle(
              'Özel dizilimi kullan',
              'Kapalıyken eski davranış geçerlidir: rastgele bir thumbnail kapak olur, kalanlar klasör sırasıyla yüklenir.',
              currentOrder.enabled,
              (v) => patchOrder({ enabled: v })
            )}

            {toggle(
              'İlk görsel her zaman thumbnail',
              `Açıkken 1. sıra kilitlidir ve thumbnail işaretli şablonlardan gelir (${thumbCount} aday). Kapatırsanız ilk görseli de kendiniz seçersiniz.`,
              currentOrder.thumbnailFirst,
              (v) => patchOrder({ thumbnailFirst: v })
            )}

            {toggle(
              'Statik görseller en sonda',
              'Ölçü tablosu gibi bilgilendirme görselleri sabitlemediğiniz sürece galerinin sonuna alınır.',
              currentOrder.staticLast,
              (v) => patchOrder({ staticLast: v })
            )}

            <div className="p-3 bg-[#151f32] border border-[#1e293b] rounded-2xl space-y-2">
              <span className="text-[11px] font-semibold text-white block">Dizilim modu</span>
              {[
                { id: 'custom', label: 'Sabit sıra + kalanlar', hint: 'Belirlediğiniz şablonlar sırayla, gerisi aşağıdaki kurala göre.' },
                { id: 'random', label: 'Tamamen rastgele', hint: 'Sabit sıra yok sayılır, tüm mockuplar her üründe karışır.' }
              ].map(opt => (
                <label key={opt.id} className="flex items-start space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="order-mode"
                    checked={currentOrder.mode === opt.id}
                    onChange={() => patchOrder({ mode: opt.id })}
                    className="mt-0.5 accent-amber-500"
                  />
                  <span className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-slate-200 block">{opt.label}</span>
                    <span className="text-[9px] text-slate-500 block leading-relaxed">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className={`p-3 bg-[#151f32] border border-[#1e293b] rounded-2xl space-y-2 ${currentOrder.mode === 'random' ? 'opacity-40 pointer-events-none' : ''}`}>
              <span className="text-[11px] font-semibold text-white block">Sabit sıradan sonrası</span>
              {[
                { id: 'random', label: 'Rastgele karışsın', hint: 'Her üründe farklı sıra — listelerin tekdüze görünmesini engeller.' },
                { id: 'sequential', label: 'Klasör sırasıyla', hint: 'Her üründe aynı sabit sıra.' }
              ].map(opt => (
                <label key={opt.id} className="flex items-start space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="order-rest"
                    checked={currentOrder.restMode === opt.id}
                    onChange={() => patchOrder({ restMode: opt.id })}
                    className="mt-0.5 accent-amber-500"
                  />
                  <span className="space-y-0.5">
                    <span className="text-[10px] font-semibold text-slate-200 block">{opt.label}</span>
                    <span className="text-[9px] text-slate-500 block leading-relaxed">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-start space-x-2 p-3 bg-slate-950/50 border border-[#1e293b] rounded-2xl">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Bu oran için {orderTemplates.length} şablon üretiliyor. Sabit sıradaki {pinnedRows.length + (coverKey ? 1 : 0)} görsel
                her üründe aynı konumda, kalan {Math.max(0, orderTemplates.length - pinnedRows.length - (coverKey ? 1 : 0))} görsel
                {currentOrder.mode === 'random' || currentOrder.restMode === 'random' ? ' rastgele' : ' sabit'} sırayla yüklenir.
              </p>
            </div>
          </div>

          {/* Sabit sıra */}
          <div
            className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-5 space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnList}
          >
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <ListOrdered className="w-4 h-4 text-amber-500" />
                <span>Sabit Sıra</span>
              </span>
              {pinnedKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => patchOrder({ pinned: [] })}
                  className="text-[9px] font-bold text-slate-500 hover:text-rose-400 normal-case tracking-normal"
                >
                  Temizle
                </button>
              )}
            </h4>

            <div className={`space-y-2 ${currentOrder.mode === 'random' ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* 1. sıra: thumbnail kuralı */}
              {currentOrder.thumbnailFirst && (
                coverKey ? (
                  <div className="relative">
                    {rowCard(coverKey, 1, { locked: true })}
                    <button
                      type="button"
                      onClick={() => removePinned(coverKey)}
                      className="absolute -top-1.5 -right-1.5 bg-slate-800 border border-[#1e293b] rounded-full p-0.5 text-slate-400 hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3 bg-emerald-500/5 border border-dashed border-emerald-500/30 rounded-2xl p-2.5">
                    <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="w-6 h-6 shrink-0 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center justify-center">1</span>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[11px] font-semibold text-emerald-400">Kapak: Thumbnail (otomatik)</span>
                      <span className="block text-[9px] text-slate-500">
                        {thumbCount > 0
                          ? `${thumbCount} thumbnail şablonundan rastgele biri. Belirli birini istiyorsanız havuzdan sabitleyin.`
                          : 'Bu oranda thumbnail işaretli şablon yok — 1. sıra sabit sıranın ilk görseli olur.'}
                      </span>
                    </div>
                  </div>
                )
              )}

              {pinnedRows.map((key, idx) => rowCard(key, idx + 1 + (currentOrder.thumbnailFirst ? 1 : 0)))}

              {pinnedRows.length === 0 && (
                <div className="border border-dashed border-[#1e293b] rounded-2xl py-8 text-center">
                  <Pin className="w-5 h-5 text-slate-600 mx-auto mb-2" />
                  <p className="text-[10px] text-slate-500 px-4">
                    Havuzdan şablon sürükleyin veya "+" ile ekleyin. Buraya koyduklarınız her üründe aynı konumda kalır.
                  </p>
                </div>
              )}
            </div>

            {currentOrder.mode === 'random' && (
              <p className="text-[9px] text-amber-500/80 text-center">Tamamen rastgele modda sabit sıra kullanılmaz.</p>
            )}
          </div>

          {/* Havuz */}
          <div
            className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-5 space-y-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropOnPool}
          >
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Havuz</span>
              </span>
              <span className="text-[9px] font-bold text-slate-500 normal-case tracking-normal">{poolTemplates.length} şablon</span>
            </h4>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {poolTemplates.map(tpl => {
                const key = templateKey(tpl);
                const isThumb = isThumbTemplate(tpl);
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => setDragKey(key)}
                    onDragEnd={() => setDragKey(null)}
                    className={`flex items-center space-x-3 bg-[#151f32] border rounded-2xl p-2.5 transition-colors cursor-grab active:cursor-grabbing ${
                      dragKey === key ? 'border-amber-500/60 opacity-60' : 'border-[#1e293b] hover:border-slate-700'
                    }`}
                  >
                    <div className="w-12 h-9 shrink-0 rounded-lg overflow-hidden bg-slate-950 border border-[#1e293b]">
                      <img src={`http://localhost:3001/${tpl.background_path}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[11px] font-semibold text-white truncate">{tpl.name}</span>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        {tpl.type === 'static' && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">Statik</span>
                        )}
                        {isThumb && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Thumbnail</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addPinned(key)}
                      title={isThumb && currentOrder.thumbnailFirst ? 'Kapak olarak sabitle' : 'Sabit sıraya ekle'}
                      className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {poolTemplates.length === 0 && (
                <div className="border border-dashed border-[#1e293b] rounded-2xl py-8 text-center text-[10px] text-slate-500 px-4">
                  {orderTemplates.length === 0
                    ? 'Bu oran için uyumlu şablon bulunmuyor.'
                    : 'Tüm şablonlar sabit sırada. Kaldırmak için buraya sürükleyin.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Simülasyon */}
        <div className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Eye className="w-4 h-4 text-amber-500" />
                <span>Simülasyon</span>
              </h4>
              <p className="text-[10px] text-slate-500 mt-1">
                Yükleme sırasını gerçek algoritmayla hesaplar. Rastgelelik varsa her denemede farklı çıkar.
              </p>
            </div>
            <button
              onClick={runOrderPreview}
              disabled={orderPreviewLoading || orderTemplates.length === 0}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold py-2.5 px-4 rounded-xl border border-[#334155] text-xs transition-colors"
            >
              <Shuffle className={`w-4 h-4 text-amber-500 ${orderPreviewLoading ? 'animate-spin' : ''}`} />
              <span>{orderPreview.length > 0 ? 'Yeniden Hesapla' : 'Sırayı Göster'}</span>
            </button>
          </div>

          {orderPreview.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-3">
              {orderPreview.map((item, idx) => (
                <div key={`${item.key}-${idx}`} className="space-y-1.5">
                  <div className={`relative aspect-square rounded-xl overflow-hidden bg-slate-950 border ${
                    idx === 0 ? 'border-emerald-500/60' : 'border-[#1e293b]'
                  }`}>
                    <img src={`http://localhost:3001/${item.background_path}`} alt="" className="w-full h-full object-cover" />
                    <span className={`absolute top-1 left-1 w-5 h-5 rounded-md text-[9px] font-bold flex items-center justify-center ${
                      idx === 0 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950/80 text-slate-200'
                    }`}>
                      {idx + 1}
                    </span>
                    {item.is_thumbnail && (
                      <span className="absolute bottom-1 right-1 text-[7px] font-bold px-1 py-0.5 rounded bg-emerald-500/80 text-white">TH</span>
                    )}
                  </div>
                  <span className="block text-[9px] text-slate-400 truncate">{item.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-[#1e293b] rounded-2xl py-8 text-center text-[10px] text-slate-500">
              Henüz hesaplanmadı.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-6xl mx-auto py-8 px-4 animate-fade-in">
      {view === 'list' ? (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Şablon Stüdyosu</h2>
              <p className="text-slate-400 text-sm mt-0.5">Etsy mockup şablonlarını ve statik bilgilendirme görsellerini yönetin.</p>
            </div>
            
            {activeSubTab === 'mockup' && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowLibraryModal(true)}
                  className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-5 rounded-xl border border-[#334155] transition-colors text-sm"
                >
                  <Compass className="w-5 h-5 text-amber-500" />
                  <span>Kütüphaneden Ekle</span>
                </button>
                <button
                  onClick={handleCreateNew}
                  className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 px-5 rounded-xl shadow-lg shadow-amber-500/10 transition-colors text-sm"
                >
                  <Plus className="w-5 h-5" />
                  <span>Yeni Şablon Oluştur</span>
                </button>
              </div>
            )}
          </div>

          {/* Sub Tab Navigation */}
          <div className="flex space-x-4 border-b border-[#1e293b] pb-3 mb-6">
            <button
              onClick={() => setActiveSubTab('mockup')}
              className={`pb-1 text-sm font-bold border-b-2 transition-all ${
                activeSubTab === 'mockup'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Mockup Şablonları
            </button>
            <button
              onClick={() => setActiveSubTab('static')}
              className={`pb-1 text-sm font-bold border-b-2 transition-all ${
                activeSubTab === 'static'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Statik Görseller (Eklentiler)
            </button>
            <button
              onClick={() => setActiveSubTab('order')}
              className={`pb-1 text-sm font-bold border-b-2 transition-all ${
                activeSubTab === 'order'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              Mockup Sıralaması
            </button>
          </div>

          {activeSubTab === 'order' ? (
            renderOrderSection()
          ) : activeSubTab === 'static' ? (
            renderStaticSection()
          ) : (
            <>
              {templates.filter(t => t.type !== 'static').length > 0 && (
                <div className="flex flex-wrap gap-1 bg-[#0e1726] border border-[#1e293b] p-1 rounded-xl w-fit mb-6">
                  {['All', ...ratioPresets].map(ratio => (
                    <button
                      key={ratio}
                      onClick={() => setFilterRatio(ratio)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        filterRatio === ratio
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {ratio === 'All' ? 'Tüm Oranlar' : `${ratio} Oranı`}
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div className="text-center py-12 text-slate-400">Yükleniyor...</div>
              ) : templates.filter(t => t.type !== 'static').length === 0 ? (
                <div className="bg-[#0e1726] border border-[#1e293b] rounded-2xl p-12 text-center text-slate-500">
                  <Layers className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p className="font-medium mb-1">Henüz mockup şablonu eklenmemiş</p>
                  <p className="text-xs text-slate-500 mb-6 font-normal">Kendi oda resimlerinizi yükleyip çerçeve yerleşim alanlarını belirleyin.</p>
                  <button
                    onClick={handleCreateNew}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-4 rounded-xl text-sm transition-colors border border-[#334155]"
                  >
                    İlk Şablonu Oluştur
                  </button>
                </div>
              ) : (() => {
                const filteredTemplates = templates.filter(t => t.type !== 'static' && (filterRatio === 'All' || (t.config && t.config.compatible_ratios && t.config.compatible_ratios.includes(filterRatio))));
                
                if (filteredTemplates.length === 0) {
                  return (
                    <div className="bg-[#0e1726] border border-[#1e293b] rounded-2xl p-12 text-center text-slate-500">
                      <Layers className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                      <p className="font-medium mb-1">Şablon bulunamadı</p>
                      <p className="text-xs text-slate-500 mb-6 font-normal">Bu orana uygun herhangi bir mockup şablonu bulunmuyor.</p>
                      <button
                        onClick={handleCreateNew}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-4 rounded-xl text-sm transition-colors border border-[#334155]"
                      >
                        Yeni Şablon Oluştur
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {filteredTemplates.map(tpl => (
                    <div key={tpl.id} className="bg-[#0e1726] border border-[#1e293b] rounded-2xl overflow-hidden group hover:border-amber-500/30 transition-all flex flex-col justify-between">
                      <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                        <img 
                          src={`http://localhost:3001/${tpl.background_path}`} 
                          alt={tpl.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-3 right-3 flex flex-col items-end space-y-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-lg ${
                            tpl.type === 'flat' 
                              ? 'bg-amber-500/15 border-amber-500/20 text-amber-500' 
                              : 'bg-indigo-500/15 border-indigo-500/20 text-indigo-400'
                          }`}>
                            {tpl.type === 'flat' ? 'Düz (Flat)' : 'Perspektif'}
                          </span>
                          {tpl.config?.is_thumbnail && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-lg bg-emerald-500/15 border-emerald-500/20 text-emerald-400">
                              Thumbnail
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-bold text-white group-hover:text-amber-500 transition-colors mb-1">{tpl.name}</h3>
                          <p className="text-xs text-slate-500">
                            Uyumlu Oranlar: {tpl.config.compatible_ratios.join(', ')}
                          </p>
                        </div>

                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-[#1e293b]">
                          <button
                            type="button"
                            onClick={() => handleToggleThumbnail(tpl.id, tpl.config)}
                            className={`flex items-center space-x-1.5 text-xs font-semibold transition-colors ${
                              tpl.config?.is_thumbnail 
                                ? 'text-emerald-500 hover:text-emerald-400' 
                                : 'text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            {tpl.config?.is_thumbnail ? (
                              <>
                                <CheckSquare className="w-4 h-4" />
                                <span>Thumbnail (Aktif)</span>
                              </>
                            ) : (
                              <>
                                <Square className="w-4 h-4" />
                                <span>Thumbnail Yap</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            className="flex items-center space-x-1.5 text-xs text-rose-500 hover:text-rose-400 font-semibold transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Şablonu Sil</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </>
      ) : (
        // Editor view
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Şablon Stüdyo Editörü</h2>
              <p className="text-slate-400 text-sm mt-0.5">Arka plan görseli üzerinde ürün çerçeve yerleşimi çizin.</p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setView('list')}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 px-6 rounded-xl border border-[#334155]"
              >
                Geri Dön
              </button>
              <button
                onClick={handleSaveTemplate}
                className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 px-6 rounded-xl shadow-lg shadow-amber-500/10 transition-colors"
              >
                <Save className="w-5 h-5" />
                <span>Şablonu Kaydet</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Canvas workspace column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#0e1726] border border-[#1e293b] rounded-3xl p-6 flex flex-col items-center justify-center min-h-[400px] relative overflow-hidden">
                {!bgImage ? (
                  <div className="text-center py-20">
                    <Crop className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium mb-4">Bir arka plan görseli yükleyerek başlayın</p>
                    <label className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 px-6 rounded-xl shadow-lg shadow-amber-500/10 transition-colors cursor-pointer text-sm">
                      Görsel Yükle (Oda Fotoğrafı)
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleBgUpload} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                ) : (
                  <div className="relative" ref={containerRef}>
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      className="border border-[#1e293b] rounded-xl cursor-crosshair bg-slate-950 shadow-2xl"
                    />

                    {/* Magnifying Glass widget */}
                    {zoomPoint && (() => {
                      const canvasW = canvasRef.current?.width || 500;
                      // If pin is near the top of the canvas, render magnifier below the pin (at y + 30px)
                      // otherwise above it (at y - 120px) to prevent going off-screen
                      const showBelow = zoomPoint.y < 130;
                      const topPos = showBelow ? (zoomPoint.y + 30) : (zoomPoint.y - 120);
                      // Constrain left position to keep it inside canvas bounds
                      const leftPos = Math.max(10, Math.min(canvasW - 106, zoomPoint.x - 48));

                      return (
                        <div 
                          className="absolute w-24 h-24 rounded-full border-2 border-amber-500 bg-slate-900 pointer-events-none overflow-hidden shadow-2xl z-50 flex items-center justify-center transition-all duration-150 ease-out"
                          style={{
                            left: `${leftPos}px`,
                            top: `${topPos}px`,
                          }}
                        >
                          {/* We render a scaled copy of the background around the point */}
                          <canvas
                            ref={(el) => {
                              if (!el || !bgImage || !canvasRef.current) return;
                              const zctx = el.getContext('2d');
                              const scale = 3.0; // Zoom factor
                              
                              // Map pixel coordinate in canvas to original image coordinates
                              const scaleX = bgImage.width / canvasRef.current.width;
                              const scaleY = bgImage.height / canvasRef.current.height;
                              
                              const imgX = (zoomPoint.x) * scaleX;
                              const imgY = (zoomPoint.y) * scaleY;
                              
                              zctx.clearRect(0, 0, 96, 96);
                              zctx.drawImage(
                                bgImage,
                                imgX - 16, imgY - 16, 32, 32, // Source crop
                                0, 0, 96, 96 // Draw size
                              );
                              
                              // Draw crosshair in center
                              zctx.strokeStyle = '#f59e0b';
                              zctx.lineWidth = 1;
                              zctx.beginPath();
                              zctx.moveTo(48, 0); zctx.lineTo(48, 96);
                              zctx.moveTo(0, 48); zctx.lineTo(96, 48);
                              zctx.stroke();
                            }}
                            width={96}
                            height={96}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {bgImage && (
                <div className="flex items-center space-x-3 bg-slate-800/20 border border-slate-800/30 rounded-xl p-4 text-xs text-slate-400">
                  <HelpCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span>
                    {type === 'flat' 
                      ? 'Düz modda: Çerçevenin kenarlarını sürükleyerek boyutlandırabilir, merkezinden tutarak konumlandırabilirsiniz.'
                      : 'Perspektif modda: Çerçevenin eğik duracağı 4 köşeyi sırasıyla işaretleyin. Sürüklerken büyüteç yardımıyla hassas ayar yapın.'}
                  </span>
                </div>
              )}
            </div>

            {/* Sidebar properties panel */}
            <div className="space-y-6">
              <div className="bg-[#0e1726] border border-[#1e293b] rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Compass className="w-4 h-4 text-amber-500" />
                  <span>1. Şablon Tipi</span>
                </h3>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Şablon Adı
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn: Modern Living Room"
                    className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setType('flat')}
                    className={`py-3 px-4 border rounded-xl font-semibold text-xs flex items-center justify-center space-x-2 transition-all ${
                      type === 'flat'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                        : 'bg-[#151f32] border-[#1e293b] text-slate-400'
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    <span>Düz (Flat)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('perspective')}
                    className={`py-3 px-4 border rounded-xl font-semibold text-xs flex items-center justify-center space-x-2 transition-all ${
                      type === 'perspective'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                        : 'bg-[#151f32] border-[#1e293b] text-slate-400'
                    }`}
                  >
                    <Compass className="w-4 h-4" />
                    <span>Perspektif</span>
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Uyumlu Oranlar
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ratioPresets.map(ratio => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => handleRatioToggle(ratio)}
                        className={`text-xs px-3 py-1.5 border rounded-lg transition-colors ${
                          compatibleRatios.includes(ratio)
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                            : 'bg-[#151f32] border-[#1e293b] text-slate-400'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thumbnail Seçeneği */}
                <div className="flex items-center justify-between p-3 bg-[#151f32] border border-[#1e293b] rounded-xl pt-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">Thumbnail Olarak Seç</span>
                    <p className="text-[10px] text-slate-500">Ürünün merkezde olduğu 1:1 mockup seçmeniz önerilir.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isThumbnail}
                      onChange={(e) => setIsThumbnail(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950 peer-checked:after:border-slate-950"></div>
                  </label>
                </div>

                {type === 'flat' && (
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Çizim Oranı (Oran Kilidi)
                    </label>
                    <select
                      value={activeRatio}
                      onChange={(e) => {
                        const newRatio = e.target.value;
                        setActiveRatio(newRatio);
                        if (bgImage) {
                          const canvas = canvasRef.current;
                          const w = canvas.width;
                          const h = canvas.height;
                          const px = flatPlacement.x * w;
                          const py = flatPlacement.y * h;
                          const pw = flatPlacement.width * w;
                          const rVal = parseRatio(newRatio);
                          const ph = pw / rVal;
                          setFlatPlacement(prev => ({
                            ...prev,
                            height: ph / h
                          }));
                        }
                      }}
                      className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      {ratioPresets.map(r => (
                        <option key={r} value={r}>{r} Oranı</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Only show styling tools in Flat mode */}
              {type === 'flat' && bgImage && (
                <div className="bg-[#0e1726] border border-[#1e293b] rounded-2xl p-6 space-y-6">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2 border-b border-[#1e293b] pb-3">
                    <Frame className="w-4 h-4 text-amber-500" />
                    <span>2. Çerçeve & Gölge Efektleri</span>
                  </h3>

                  {/* Frame selection */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Çerçeve Türü
                    </label>
                    <select
                      value={frameStyle}
                      onChange={(e) => setFrameStyle(e.target.value)}
                      className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      {FRAME_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                      ))}
                    </select>
                  </div>

                  {frameStyle !== 'stretched' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Çerçeve Kalınlığı</span>
                        <span>{frameThickness}px</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="15"
                        step="0.5"
                        value={frameThickness}
                        onChange={(e) => setFrameThickness(Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                  )}

                  {/* Shadow settings */}
                  <div className="border-t border-[#1e293b] pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300 font-semibold uppercase tracking-wider">Derinlik Gölgesi</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={shadowEnabled} 
                          onChange={(e) => setShadowEnabled(e.target.checked)} 
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-slate-950 peer-checked:after:border-slate-950"></div>
                      </label>
                    </div>

                    {shadowEnabled && (
                      <div className="space-y-3 pt-2">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Gölge Kenarı (Direction)
                          </label>
                          <select
                            value={shadowSides}
                            onChange={(e) => setShadowSides(e.target.value)}
                            className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none"
                          >
                            <option value="all">Her Yöne (All)</option>
                            <option value="bottom">Alt Kenara (Bottom)</option>
                            <option value="right">Sağ Kenara (Right)</option>
                            <option value="left">Sol Kenara (Left)</option>
                            <option value="top">Üst Kenara (Top)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>Yoğunluk (Opacity)</span>
                            <span>{shadowOpacity / 10}</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="9"
                            step="0.5"
                            value={shadowOpacity}
                            onChange={(e) => setShadowOpacity(Number(e.target.value))}
                            className="w-full accent-amber-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>Mesafe (Offset)</span>
                            <span>{shadowDistance}px</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="25"
                            value={shadowDistance}
                            onChange={(e) => setShadowDistance(Number(e.target.value))}
                            className="w-full accent-amber-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>Yayılma & Bulanıklık</span>
                            <span>{shadowBlur}px</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="25"
                            value={shadowBlur}
                            onChange={(e) => setShadowBlur(Number(e.target.value))}
                            className="w-full accent-amber-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0e1726] border border-[#1e293b] rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#1e293b]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Compass className="w-5 h-5 text-amber-500" />
                  <span>Mockup Kütüphanesi (Mağazalar Arası Transfer)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Diğer mağazalarınızda tanımlanmış veya global olan mockup şablonlarını aktif mağazanıza kopyalayın.
                </p>
              </div>
              <button 
                onClick={() => setShowLibraryModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {libraryLoading ? (
                <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                  <span>Şablonlar yükleniyor...</span>
                </div>
              ) : libraryTemplates.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Layers className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                  <p className="font-medium text-slate-400">Kütüphanede kopyalanabilir şablon bulunamadı.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Diğer mağazalarınızda şablon oluşturduğunuzda burada listelenecektir.
                  </p>
                </div>
              ) : (() => {
                const uniqueShops = Array.from(new Set(libraryTemplates.map(t => t.shop_id)))
                  .map(id => {
                    const match = libraryTemplates.find(t => t.shop_id === id);
                    return {
                      shop_id: id,
                      shop_name: match ? match.shop_name : 'Bilinmeyen Mağaza'
                    };
                  });
                const filteredTemplates = libraryTemplates.filter(t => t.shop_id === selectedLibraryShopId);
                const isAllSelected = filteredTemplates.length > 0 && selectedLibraryIds.length === filteredTemplates.length;

                return (
                  <>
                    {/* Shop Tabs Selector */}
                    {uniqueShops.length > 0 && (
                      <div className="flex items-center space-x-2 pb-4 border-b border-[#1e293b] mb-6 overflow-x-auto">
                        {uniqueShops.map(shop => (
                          <button
                            key={shop.shop_id}
                            onClick={() => {
                              setSelectedLibraryShopId(shop.shop_id);
                              setSelectedLibraryIds([]); // Clear selection when switching shops
                            }}
                            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap ${
                              selectedLibraryShopId === shop.shop_id
                                ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-lg shadow-amber-500/10'
                                : 'bg-[#151f32]/40 text-slate-400 border-[#1e293b] hover:text-white hover:border-slate-700'
                            }`}
                          >
                            {shop.shop_name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Selection Action Bar */}
                    <div className="flex items-center justify-between pb-4 border-b border-[#1e293b] mb-6">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => {
                            if (isAllSelected) {
                              setSelectedLibraryIds([]);
                            } else {
                              setSelectedLibraryIds(filteredTemplates.map(t => t.id));
                            }
                          }}
                          className="text-xs bg-[#1e293b] hover:bg-[#2e3b4e] text-slate-300 px-3 py-1.5 rounded-lg border border-[#334155] transition-colors font-medium"
                        >
                          {isAllSelected ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                        </button>
                        {selectedLibraryIds.length > 0 && (
                          <span className="text-xs text-amber-500 font-semibold animate-pulse">
                            {selectedLibraryIds.length} şablon seçildi
                          </span>
                        )}
                      </div>
                      {selectedLibraryIds.length > 0 && (
                        <button
                          onClick={() => handleCopyTemplates(selectedLibraryIds)}
                          className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center space-x-1.5 transform hover:scale-[1.02]"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Seçilenleri Dükkanıma Ekle ({selectedLibraryIds.length})</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredTemplates.map(tpl => {
                        const isSelected = selectedLibraryIds.includes(tpl.id);
                        return (
                          <div 
                            key={tpl.id} 
                            onClick={() => {
                              if (isSelected) {
                                setSelectedLibraryIds(selectedLibraryIds.filter(id => id !== tpl.id));
                              } else {
                                setSelectedLibraryIds([...selectedLibraryIds, tpl.id]);
                              }
                            }}
                            className={`group relative rounded-2xl overflow-hidden p-4 flex space-x-4 cursor-pointer transition-all border ${
                              isSelected 
                                ? 'border-amber-500 bg-amber-500/5' 
                                : 'bg-[#151f32]/60 border-[#1e293b] hover:border-slate-700'
                            }`}
                          >
                            <div className="w-24 h-24 bg-slate-950 rounded-xl overflow-hidden flex-shrink-0 relative border border-[#1e293b]">
                              <img 
                                src={`http://localhost:3001/${tpl.background_path}`} 
                                alt={tpl.name}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              {/* Checkbox overlay indicator */}
                              <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                isSelected 
                                  ? 'bg-amber-500 border-amber-500 text-slate-950' 
                                  : 'bg-black/40 border-slate-500 text-transparent'
                              }`}>
                                <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            </div>
                            <div className="flex-1 flex flex-col justify-between min-w-0">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <h4 className="font-bold text-white text-sm truncate pr-2">{tpl.name}</h4>
                                  <span className="text-[9px] bg-slate-800 text-slate-400 border border-[#1e293b] px-2 py-0.5 rounded-full flex-shrink-0">
                                    {tpl.shop_name}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400">Tip: {tpl.type === 'flat' ? 'Düz' : 'Perspektif'}</p>
                                <p className="text-[10px] text-slate-500 truncate">
                                  Uyumlu Oranlar: {tpl.config.compatible_ratios ? tpl.config.compatible_ratios.join(', ') : ''}
                                </p>
                              </div>
                              <div className="flex justify-end pt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyTemplates([tpl.id]);
                                  }}
                                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Dükkanıma Ekle</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
