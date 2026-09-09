import { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

/** Vite derleme sırasında kökteki package.json sürümünü gömer. */
const BUILD_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;

/** Güncelleme kontrolü açılışta bir kez, sonra bu aralıkla tekrarlanır. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Marka başlığının sağ altındaki sürüm rozeti.
 *
 * Sürüm derleme sırasında gömülür; backend kapalıyken de doğru görünür.
 * Yeni sürüm varsa rozet vurgulanır ve tıklanınca ayrıntı paneli açılır.
 */
export default function VersionBadge() {
  const [version, setVersion] = useState(BUILD_VERSION);
  const [check, setCheck] = useState(null); // { updateAvailable, latest, notes, url }
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);

  // Backend'den gelen sürüm derlemedekiyle aynı olmalı; ayrıldıysa (yarım
  // güncelleme) backend'inki gerçeği yansıtır.
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/version`)
      .then(res => { if (!cancelled && res.data?.version) setVersion(res.data.version); })
      .catch(() => { /* backend kapalıysa gömülü sürüm gösterilir */ });
    return () => { cancelled = true; };
  }, []);

  const runCheck = async (force = false) => {
    setChecking(true);
    try {
      const res = await axios.get(`${API_BASE}/version/check${force ? '?force=1' : ''}`);
      setCheck(res.data);
      if (res.data?.current) setVersion(res.data.current);
    } catch {
      setCheck({ ok: false, error: 'Güncelleme sunucusuna ulaşılamadı.' });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runCheck(false);
    const timer = setInterval(() => runCheck(false), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!version) return null;
  const hasUpdate = !!check?.updateAvailable;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!check) runCheck(true); }}
        title={hasUpdate ? `Yeni sürüm: ${check.latest}` : 'Sürüm bilgisi ve güncelleme kontrolü'}
        className={`flex items-center space-x-1 text-[10px] font-semibold tabular-nums rounded-md px-1.5 py-0.5 border transition-colors ${
          hasUpdate
            ? 'text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
            : 'text-slate-600 border-transparent hover:text-slate-400 hover:border-[#1e293b]'
        }`}
      >
        <span>v{version}</span>
        {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
      </button>

      {open && (
        <>
          {/* Dışarı tıklayınca kapansın */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-64 z-50 bg-[#0e1726] border border-[#1e293b] rounded-xl shadow-2xl p-4 space-y-3 animate-fade-in">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Kurulu Sürüm</span>
              <span className="text-xs font-bold text-white tabular-nums">v{version}</span>
            </div>

            {checking && <p className="text-[11px] text-slate-400">Kontrol ediliyor…</p>}

            {!checking && check?.ok === false && (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {check.error || 'Güncelleme kontrolü yapılamadı.'} İnternet bağlantısı olmadan da
                uygulama normal çalışır.
              </p>
            )}

            {!checking && check?.ok && !hasUpdate && (
              <p className="text-[11px] text-emerald-400">En güncel sürümü kullanıyorsunuz.</p>
            )}

            {!checking && hasUpdate && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-amber-500 uppercase tracking-wider font-bold">Yeni Sürüm</span>
                  <span className="text-xs font-bold text-amber-400 tabular-nums">{check.latest}</span>
                </div>
                {check.notes && (
                  <p className="text-[10px] text-slate-400 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-line">
                    {check.notes.slice(0, 400)}
                  </p>
                )}
                {check.url && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full text-center py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] font-semibold hover:bg-amber-500/20 transition-colors"
                  >
                    Sürüm notlarını aç
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => runCheck(true)}
              disabled={checking}
              className="w-full py-1.5 rounded-lg bg-[#151f32] border border-[#1e293b] text-[11px] text-slate-300 hover:border-amber-500/40 hover:text-amber-500 disabled:opacity-40 transition-colors"
            >
              Şimdi kontrol et
            </button>
          </div>
        </>
      )}
    </div>
  );
}
