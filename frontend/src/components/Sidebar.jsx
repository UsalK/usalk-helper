import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  Tag, 
  Settings, 
  Link, 
  UploadCloud 
} from 'lucide-react';

export default function Sidebar({ currentPage, setCurrentPage, etsyConnected, activeShop, shops, onSwitchShop }) {
  const menuItems = [
    { id: 'dashboard', name: 'Ürün Paneli', icon: LayoutDashboard },
    { id: 'bulk-upload', name: 'Toplu Yükleme Sihirbazı', icon: UploadCloud },
    { id: 'templates', name: 'Şablon Stüdyosu', icon: Layers },
    { id: 'variations', name: 'Varyasyon Profilleri', icon: Tag },
    { id: 'settings', name: 'Genel Ayarlar', icon: Settings },
    { id: 'etsy-connect', name: 'Etsy Bağlantısı', icon: Link }
  ];

  return (
    <aside className="w-64 bg-[#0e1726] border-r border-[#1e293b] flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#1e293b] flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center font-bold text-white shadow-lg shadow-amber-500/20">
          U
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Usalk Art
          </h1>
          <span className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
            Etsy SEO & Mockup Tool
          </span>
        </div>
      </div>

      {/* Shop Selector Dropdown */}
      {etsyConnected && shops && shops.length > 0 && (
        <div className="px-4 py-4 border-b border-[#1e293b] space-y-1.5 animate-fade-in">
          <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aktif Mağaza</label>
          <div className="relative">
            <select
              value={activeShop?.shop_id || ''}
              onChange={(e) => onSwitchShop(e.target.value)}
              className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer appearance-none pr-8 font-semibold transition-colors"
            >
              {shops.map(s => (
                <option key={s.shop_id} value={s.shop_id} className="bg-[#151f32]">
                  {s.shop_name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group text-left ${
                isActive 
                  ? 'bg-gradient-to-r from-amber-500/10 to-amber-500/5 text-amber-500 border border-amber-500/20 font-medium'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'text-amber-500' : 'text-slate-500 group-hover:text-slate-400 group-hover:scale-110'}`} />
              <span className="text-sm">{item.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Etsy Connection Status Card */}
      <div className="p-4 border-t border-[#1e293b]">
        <div className="bg-[#151f32] rounded-xl p-4 border border-[#1e293b]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Etsy Bağlantısı</span>
            <div className={`w-2.5 h-2.5 rounded-full ${etsyConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            {etsyConnected 
              ? `Mağazanıza (${activeShop?.shop_name || 'Etsy'}) güvenle bağlandınız. Yüklemeye hazırsınız.` 
              : 'Listing yüklemek için önce Etsy hesabınızı bağlayın.'}
          </p>
          <button 
            onClick={() => setCurrentPage('etsy-connect')}
            className={`w-full text-xs font-semibold py-2 px-3 rounded-lg transition-colors ${
              etsyConnected 
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' 
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/10'
            }`}
          >
            {etsyConnected ? 'Bağlantıyı Yönet' : 'Şimdi Bağla'}
          </button>
        </div>
      </div>
    </aside>
  );
}
