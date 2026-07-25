import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart3,
  RefreshCw,
  Search,
  Filter,
  Sparkles,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Eye,
  Heart,
  ShoppingBag,
  DollarSign,
  Calendar,
  Clock,
  Edit3,
  Trash2,
  FolderOpen,
  Image as ImageIcon,
  ChevronRight,
  Terminal,
  Zap
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

export default function Analytics({ etsyConnected, activeShop }) {
  // Filters State
  const [dateRange, setDateRange] = useState('all'); // 'all', '7d', '30d', '90d', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [minAgeDays, setMinAgeDays] = useState(0);
  const [zeroVisitsOnly, setZeroVisitsOnly] = useState(false);
  const [zeroFavsOnly, setZeroFavsOnly] = useState(false);
  const [sortBy, setSortBy] = useState('views');
  const [sortOrder, setSortOrder] = useState('desc');

  // Data & Status State
  const [listings, setListings] = useState([]);
  const [summary, setSummary] = useState({
    total_views: 0,
    total_favorites: 0,
    total_sales: 0,
    total_revenue: 0,
    avg_click_rate: 0
  });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Selection & Modal State
  const [selectedListingIds, setSelectedListingIds] = useState([]);
  const [activeAnalysisModal, setActiveAnalysisModal] = useState(null); // listing object
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [imageInspection, setImageInspection] = useState(null);

  // Replace Single Modal State
  const [replaceSingleModal, setReplaceSingleModal] = useState(null);
  const [singleNewTitle, setSingleNewTitle] = useState('');
  const [singleNewTags, setSingleNewTags] = useState('');
  const [singleNewImageFile, setSingleNewImageFile] = useState(null);
  const [replacingSingle, setReplacingSingle] = useState(false);

  // Pagination State
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    setCurrentPageNum(1);
    fetchListings();
  }, [dateRange, startDate, endDate, searchQuery, minAgeDays, zeroVisitsOnly, zeroFavsOnly, sortBy, sortOrder]);

  // Lock body scroll when modal is active to keep modal centered in viewport
  useEffect(() => {
    if (activeAnalysisModal || replaceSingleModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeAnalysisModal, replaceSingleModal]);


  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = {
        range: dateRange,
        startDate,
        endDate,
        search: searchQuery,
        minAgeDays,
        zeroVisitsOnly,
        zeroFavsOnly,
        sortBy,
        sortOrder
      };
      const res = await axios.get(`${API_BASE}/etsy/analytics/listings`, { params });
      if (res.data.success) {
        setListings(res.data.listings);
        setSummary(res.data.summary);
        setTotalCount(res.data.total_count);
      }
    } catch (err) {
      console.error('Failed to fetch analytics listings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await axios.get(`${API_BASE}/etsy/analytics/sync`);
      if (res.data.success) {
        setLastSyncedAt(res.data.last_synced_at);
        await fetchListings();
      }
    } catch (err) {
      console.error('Sync failed:', err);
      alert('Etsy verileri senkronize edilemedi: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenAIAnalysis = async (listing) => {
    setActiveAnalysisModal(listing);
    setAiResult(null);
    setImageInspection(null);
    setAnalyzingAI(true);

    try {
      // 1. Inspect image dimensions
      const imgRes = await axios.post(`${API_BASE}/etsy/analytics/inspect-image`, { listing_id: listing.listing_id });
      if (imgRes.data.success) {
        setImageInspection(imgRes.data);
      }

      // 2. Call AI Listing Evaluation
      const aiRes = await axios.post(`${API_BASE}/etsy/analytics/ai-evaluate`, { listing_id: listing.listing_id });
      if (aiRes.data.success) {
        setAiResult(aiRes.data);

        // Print debug token log in browser console as requested
        console.log(`\n=================== [FRONTEND AI DEBUG LOG] ===================`);
        console.log(`Target Listing ID: #${listing.listing_id}`);
        console.log(`AI Recommendation: ${aiRes.data.action}`);
        console.log(`Tokens Spent -> Prompt: ${aiRes.data.token_usage?.prompt_tokens} | Completion: ${aiRes.data.token_usage?.completion_tokens} | Total: ${aiRes.data.token_usage?.total_tokens}`);
        console.log(`AI Short Note: ${aiRes.data.ai_short_note}`);
        console.log(`===============================================================\n`);
      }
    } catch (err) {
      console.error('AI Evaluation error:', err);
      alert('AI analizi sırasında hata oluştu: ' + (err.response?.data?.error || err.message));
    } finally {
      setAnalyzingAI(false);
    }
  };

  const handleOpenReplaceSingle = (listing) => {
    setReplaceSingleModal(listing);
    setSingleNewTitle(listing.title || '');
    setSingleNewTags(Array.isArray(listing.tags) ? listing.tags.join(', ') : (listing.tags || ''));
    setSingleNewImageFile(null);
  };

  const handleExecuteReplaceSingle = async (e) => {
    e.preventDefault();
    if (!replaceSingleModal) return;
    setReplacingSingle(true);

    try {
      const formData = new FormData();
      formData.append('listing_id', replaceSingleModal.listing_id);
      formData.append('title', singleNewTitle);
      formData.append('tags', singleNewTags);
      if (singleNewImageFile) {
        formData.append('image', singleNewImageFile);
      }

      const res = await axios.post(`${API_BASE}/etsy/analytics/replace-single`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data.success) {
        alert(`Listing #${replaceSingleModal.listing_id} başarıyla güncellendi!`);
        setReplaceSingleModal(null);
        await fetchListings();
      }
    } catch (err) {
      console.error('Single replacement failed:', err);
      alert('Güncelleme başarısız: ' + (err.response?.data?.error || err.message));
    } finally {
      setReplacingSingle(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedListingIds.length === listings.length) {
      setSelectedListingIds([]);
    } else {
      setSelectedListingIds(listings.map(l => l.listing_id));
    }
  };

  const toggleSelectListing = (id) => {
    if (selectedListingIds.includes(id)) {
      setSelectedListingIds(selectedListingIds.filter(i => i !== id));
    } else {
      setSelectedListingIds([...selectedListingIds, id]);
    }
  };

  const handleImportSalesCSV = async (file) => {
    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      }
      const res = await axios.post(`${API_BASE}/etsy/analytics/import-sales-csv`, formData);
      if (res.data.success) {
        alert(`Sipariş CSV Aktarımı Başarılı!\nSipariş Sayısı: ${res.data.total_orders_parsed}\nEşleşen Ürün: ${res.data.updated_listings}\nToplam Aktarılan Ciro: $${res.data.total_revenue_imported.toFixed(2)} USD`);
        await fetchListings();
      }
    } catch (err) {
      console.error('CSV import error:', err);
      alert('Sipariş CSV aktarılamadı: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      
      {/* Top Header & Sync Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a] border border-[#1e293b] p-6 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white font-outfit tracking-tight">
                Analiz & Optimizasyon Sekmesi
              </h1>
              <p className="text-xs text-slate-400">
                Etsy ürünlerinin performansını takip et, raf ömrü bitenleri AI ile analiz et ve tekli/toplu optimize et.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-[#151f32] hover:bg-slate-800 text-slate-200 border border-[#1e293b] cursor-pointer transition-colors shadow-md">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Sipariş CSV Yükle</span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleImportSalesCSV(e.target.files[0]);
                }
              }}
              className="hidden"
            />
          </label>

          <button
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-lg cursor-pointer ${
              syncing
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-amber-500/20'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Veriler Çekiliyor...' : 'Verileri Güncelle (Sync)'}</span>
          </button>
        </div>
      </div>


      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">Aktif Ürün</span>
            <FolderOpen className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-white font-outfit">{totalCount}</p>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">Görüntülenme</span>
            <Eye className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-white font-outfit">{summary.total_views.toLocaleString()}</p>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">Favoriler</span>
            <Heart className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-white font-outfit">{summary.total_favorites.toLocaleString()}</p>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">Satış Adedi</span>
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white font-outfit">{summary.total_sales}</p>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase">Toplam Ciro</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-400 font-outfit">${summary.total_revenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-[#0f172a] border border-[#1e293b] p-6 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Date Range Selector */}
          <div className="flex items-center space-x-1.5 bg-[#151f32] p-1 rounded-xl border border-[#1e293b] text-xs">
            <button
              onClick={() => setDateRange('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === 'all' ? 'bg-amber-500 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tüm Zamanlar
            </button>
            <button
              onClick={() => setDateRange('7d')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === '7d' ? 'bg-amber-500 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Son 7 Gün
            </button>
            <button
              onClick={() => setDateRange('30d')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === '30d' ? 'bg-amber-500 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Son 30 Gün
            </button>
            <button
              onClick={() => setDateRange('90d')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === '90d' ? 'bg-amber-500 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Son 90 Gün
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                dateRange === 'custom' ? 'bg-amber-500 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Özel Tarih
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Ürün başlığı veya etiket ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
            />
          </div>
        </div>

        {/* Custom Date Pickers if selected */}
        {dateRange === 'custom' && (
          <div className="flex items-center space-x-4 pt-2 border-t border-[#1e293b] text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Başlangıç:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-[#151f32] border border-[#1e293b] rounded-lg px-3 py-1.5 text-white"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Bitiş:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-[#151f32] border border-[#1e293b] rounded-lg px-3 py-1.5 text-white"
              />
            </div>
          </div>
        )}

        {/* Threshold Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-[#1e293b] text-xs">
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2 bg-[#151f32] border border-[#1e293b] px-3 py-1.5 rounded-xl">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-slate-400 font-medium">Min Aktiflik:</span>
              <input
                type="number"
                min="0"
                placeholder="0 gün"
                value={minAgeDays || ''}
                onChange={(e) => setMinAgeDays(parseInt(e.target.value) || 0)}
                className="w-16 bg-[#0f172a] border border-[#1e293b] rounded px-2 py-0.5 text-center text-amber-400 font-bold"
              />
              <span className="text-slate-400">gün</span>
            </div>

            <label className="flex items-center space-x-2 cursor-pointer bg-[#151f32] border border-[#1e293b] px-3 py-1.5 rounded-xl">
              <input
                type="checkbox"
                checked={zeroVisitsOnly}
                onChange={(e) => setZeroVisitsOnly(e.target.checked)}
                className="rounded border-[#1e293b] text-amber-500 focus:ring-0"
              />
              <span className="text-slate-300 font-medium">Sadece 0 Tıklama Almayanlar</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer bg-[#151f32] border border-[#1e293b] px-3 py-1.5 rounded-xl">
              <input
                type="checkbox"
                checked={zeroFavsOnly}
                onChange={(e) => setZeroFavsOnly(e.target.checked)}
                className="rounded border-[#1e293b] text-amber-500 focus:ring-0"
              />
              <span className="text-slate-300 font-medium">Sadece 0 Favori Almayanlar</span>
            </label>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center space-x-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 font-medium">Sırala:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#151f32] border border-[#1e293b] rounded-xl px-3 py-1.5 text-white font-medium focus:outline-none"
            >
              <option value="views">Görüntülenme (Visits)</option>
              <option value="num_favorers">Favori Sayısı</option>
              <option value="sales_count">Satış Sayısı</option>
              <option value="total_revenue">Toplam Ciro ($)</option>
              <option value="click_rate">Tıklama/Etkileşim Oranı (%)</option>
              <option value="conv_rate">Dönüşüm Oranı (%)</option>
              <option value="age_days">Yaş (Gündür Aktif)</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="px-2.5 py-1.5 bg-[#151f32] border border-[#1e293b] rounded-xl text-slate-300 font-bold uppercase"
            >
              {sortOrder}
            </button>
          </div>

        </div>

      </div>

      {/* Main Table */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 space-y-4 text-amber-500">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold">Analiz verileri yükleniyor...</span>
          </div>
        ) : listings.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <Filter className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-sm font-semibold">Filtre kriterlerine uygun ürün bulunamadı.</p>
            <p className="text-xs text-slate-500">Lütfen filtreleri sıfırlamayı veya Verileri Güncelle (Sync) butonunu deneyin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151f32] text-slate-400 font-semibold border-b border-[#1e293b]">
                <tr>
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedListingIds.length === listings.length && listings.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-[#1e293b] text-amber-500"
                    />
                  </th>
                  <th className="p-4">Ürün Detayı</th>
                  <th className="p-4">Seksiyon</th>
                  <th className="p-4 text-center">Yaş (Gün)</th>
                  <th className="p-4 text-center">Görüntülenme</th>
                  <th className="p-4 text-center">Favori</th>
                  <th className="p-4 text-center">Satış</th>
                  <th className="p-4 text-center">Kazanç ($)</th>
                  <th className="p-4 text-center">Etkileşim %</th>
                  <th className="p-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {listings.slice((currentPageNum - 1) * itemsPerPage, currentPageNum * itemsPerPage).map(l => (
                  <tr key={l.listing_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedListingIds.includes(l.listing_id)}
                        onChange={() => toggleSelectListing(l.listing_id)}
                        className="rounded border-[#1e293b] text-amber-500"
                      />
                    </td>

                    <td className="p-4 max-w-sm">
                      <div className="flex items-center space-x-4">
                        <div className="relative w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700/80 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg group hover:border-amber-500/50 transition-all duration-300">
                          {l.image_url ? (
                            <img 
                              src={l.image_url} 
                              alt={l.title} 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                            />
                          ) : (
                            <div className="flex flex-col items-center text-slate-600">
                              <ImageIcon className="w-6 h-6" />
                              <span className="text-[9px] mt-0.5 font-bold">Görsel Yok</span>
                            </div>
                          )}

                          {l.image_width > 0 && (
                            <span className={`absolute bottom-0 inset-x-0 text-[8px] font-black text-center py-0.5 text-white backdrop-blur-md ${
                              l.is_high_res ? 'bg-emerald-600/80' : 'bg-amber-600/80'
                            }`}>
                              {l.image_width}x{l.image_height}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-slate-200 hover:text-amber-400 transition-colors line-clamp-2 leading-tight text-xs"
                          >
                            {l.title}
                          </a>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                            <span className="font-mono text-slate-500">#{l.listing_id}</span>
                            <span>•</span>
                            <span className="text-amber-400 font-extrabold text-xs">${l.price_amount} USD</span>
                            <span>•</span>
                            <span className="text-slate-400 font-medium">Stok: {l.quantity}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 text-slate-400 font-medium">
                      <span className="bg-slate-800/70 border border-slate-700 px-2 py-1 rounded-md text-[10px]">
                        {l.section_title || 'Genel'}
                      </span>
                    </td>

                    <td className="p-4 text-center font-bold text-slate-300">
                      {l.age_days} gün
                    </td>

                    <td className="p-4 text-center font-extrabold text-cyan-400">
                      {l.views}
                    </td>

                    <td className="p-4 text-center font-extrabold text-rose-400">
                      {l.num_favorers}
                    </td>

                    <td className="p-4 text-center font-extrabold text-emerald-400">
                      {l.sales_count}
                    </td>

                    <td className="p-4 text-center font-extrabold text-emerald-300">
                      ${l.total_revenue.toFixed(2)}
                    </td>

                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        l.click_rate > 5 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        l.click_rate > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-slate-800 text-slate-500'
                      }`}>
                        %{l.click_rate}
                      </span>
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenAIAnalysis(l)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-bold text-[10px] shadow-md shadow-purple-500/10 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>AI ile Analiz Et</span>
                        </button>

                        <button
                          onClick={() => handleOpenReplaceSingle(l)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-semibold cursor-pointer border border-slate-700"
                          title="Tekli Ürün Değiştir"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {listings.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#151f32] border-t border-[#1e293b] p-4 text-xs">
            <div className="flex items-center space-x-3 text-slate-400 font-medium">
              <span>
                Toplam <strong className="text-slate-200">{listings.length}</strong> üründen{' '}
                <strong className="text-amber-400">
                  {Math.min((currentPageNum - 1) * itemsPerPage + 1, listings.length)} - {Math.min(currentPageNum * itemsPerPage, listings.length)}
                </strong>{' '}
                arası gösteriliyor
              </span>

              <span className="text-slate-600">|</span>

              <div className="flex items-center space-x-2">
                <span>Sayfa Başı:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPageNum(1);
                  }}
                  className="bg-[#0f172a] border border-[#1e293b] text-slate-200 px-2.5 py-1 rounded-lg font-bold outline-none cursor-pointer focus:border-amber-500"
                >
                  <option value={10}>10 Ürün</option>
                  <option value={25}>25 Ürün</option>
                  <option value={50}>50 Ürün</option>
                  <option value={100}>100 Ürün</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={currentPageNum <= 1}
                onClick={() => setCurrentPageNum(p => Math.max(1, p - 1))}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all border ${
                  currentPageNum <= 1
                    ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer'
                }`}
              >
                ← Önceki
              </button>

              <div className="flex items-center space-x-1 px-3 py-1.5 bg-[#0f172a] border border-[#1e293b] rounded-lg font-bold text-slate-300">
                <span className="text-amber-400">{currentPageNum}</span>
                <span className="text-slate-500">/</span>
                <span>{Math.ceil(listings.length / itemsPerPage) || 1} Sayfa</span>
              </div>

              <button
                disabled={currentPageNum >= Math.ceil(listings.length / itemsPerPage)}
                onClick={() => setCurrentPageNum(p => Math.min(Math.ceil(listings.length / itemsPerPage), p + 1))}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all border ${
                  currentPageNum >= Math.ceil(listings.length / itemsPerPage)
                    ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 cursor-pointer'
                }`}
              >
                Sonraki →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI ANALYSIS MODAL */}
      {activeAnalysisModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="relative z-10 bg-[#0f172a] border border-[#1e293b] w-full max-w-2xl rounded-3xl p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[85vh] my-auto">

            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#1e293b] pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white font-outfit">AI Ürün Analiz & Değerlendirme</h3>
                  <p className="text-xs text-slate-400 truncate max-w-md">#{activeAnalysisModal.listing_id} • {activeAnalysisModal.title}</p>
                </div>
              </div>

              <button
                onClick={() => setActiveAnalysisModal(null)}
                className="text-slate-500 hover:text-white text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Analysis Progress */}
            {analyzingAI ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-purple-400 font-semibold">AI metrikleri, görsel boyutlarını ve memory bank'i değerlendiriyor...</p>
              </div>
            ) : aiResult ? (
              <div className="space-y-6">

                {/* AI Recommendation Badge */}
                <div className={`p-5 rounded-2xl border flex items-center justify-between ${
                  aiResult.action === 'OPTIMIZE'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  <div className="flex items-center space-x-3">
                    {aiResult.action === 'OPTIMIZE' ? (
                      <CheckCircle2 className="w-7 h-7 text-amber-400" />
                    ) : (
                      <AlertTriangle className="w-7 h-7 text-rose-400" />
                    )}
                    <div>
                      <span className="text-xs uppercase font-bold tracking-wider">AI Kararı:</span>
                      <h4 className="text-xl font-extrabold font-outfit">
                        {aiResult.action === 'OPTIMIZE' ? 'OPTIMIZE ET (SEO & Başlık İyileştir)' : 'DEĞİŞTİR (Listing Emekli Et)'}
                      </h4>
                    </div>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                    aiResult.action === 'OPTIMIZE' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                  }`}>
                    {aiResult.action}
                  </span>
                </div>

                {/* Image Resolution Check (Non-AI Algorithm) */}
                {imageInspection && (
                  <div className="bg-[#151f32] border border-[#1e293b] p-4 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-400">Görsel Çözünürlük Kontrolü (Algoritma):</span>
                      <span className={imageInspection.is_high_res ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {imageInspection.is_high_res ? '>= 2000x2000px HIGH RES OK' : 'DÜŞÜK ÇÖZÜNÜRLÜK (< 2000px)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Görsel Boyutu: <strong className="text-slate-200">{imageInspection.width} x {imageInspection.height} px</strong>
                    </p>
                  </div>
                )}

                {/* Token Usage Debug Panel (User Requested) */}
                {aiResult.token_usage && (
                  <div className="bg-[#0b0f19] border border-purple-500/20 p-4 rounded-2xl space-y-2">
                    <div className="flex items-center space-x-2 text-purple-400 font-bold text-xs">
                      <Terminal className="w-4 h-4" />
                      <span>AI TOKEN HARCAMA DEBUG KONSOLU</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                      <div className="bg-[#151f32] p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block">Prompt Tokens</span>
                        <strong className="text-purple-300 font-mono text-sm">{aiResult.token_usage.prompt_tokens}</strong>
                      </div>
                      <div className="bg-[#151f32] p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block">Completion Tokens</span>
                        <strong className="text-purple-300 font-mono text-sm">{aiResult.token_usage.completion_tokens}</strong>
                      </div>
                      <div className="bg-[#151f32] p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block">Toplam Token</span>
                        <strong className="text-emerald-400 font-mono text-sm">{aiResult.token_usage.total_tokens}</strong>
                      </div>
                      <div className="bg-[#151f32] p-2 rounded-xl border border-slate-800">
                        <span className="text-slate-500 block">Model</span>
                        <strong className="text-slate-300 text-[10px] font-mono block truncate">{aiResult.token_usage.model}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Reason & Notes */}
                <div className="bg-[#151f32] border border-[#1e293b] p-4 rounded-2xl space-y-2 text-xs">
                  <h5 className="font-bold text-slate-300">Analiz Nedeni:</h5>
                  <p className="text-slate-400 leading-relaxed">{aiResult.reason}</p>
                </div>

                <div className="bg-[#151f32] border border-[#1e293b] p-4 rounded-2xl space-y-2 text-xs">
                  <h5 className="font-bold text-slate-300">Memory Bank Kayıt Notu (CSV):</h5>
                  <p className="text-purple-300 font-mono text-[11px]">{aiResult.ai_short_note}</p>
                </div>

                {/* Suggestions if OPTIMIZE */}
                {aiResult.action === 'OPTIMIZE' && (
                  <div className="bg-[#151f32] border border-[#1e293b] p-4 rounded-2xl space-y-3 text-xs">
                    <h5 className="font-bold text-amber-400">Önerilen Başlık İyileştirmesi:</h5>
                    <p className="text-slate-200 font-semibold bg-[#0f172a] p-3 rounded-xl border border-slate-800">{aiResult.suggested_title || 'Mevcut başlık iyi durumda.'}</p>
                    
                    {aiResult.suggested_tags?.length > 0 && (
                      <div>
                        <span className="font-bold text-amber-400 block mb-1.5">Önerilen Tag'ler:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {aiResult.suggested_tags.map((t, idx) => (
                            <span key={idx} className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-1 rounded text-[10px] font-semibold">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : null}

            <div className="pt-4 border-t border-[#1e293b] flex justify-end">
              <button
                onClick={() => setActiveAnalysisModal(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
              >
                Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {/* REPLACE SINGLE MODAL */}
      {replaceSingleModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <form onSubmit={handleExecuteReplaceSingle} className="relative z-10 bg-[#0f172a] border border-[#1e293b] w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl my-auto">

            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
              <h3 className="font-bold text-white text-base font-outfit">Tekli Ürün Değiştir / Güncelle</h3>
              <button type="button" onClick={() => setReplaceSingleModal(null)} className="text-slate-500 hover:text-white font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Yeni Ürün Başlığı:</label>
                <input
                  type="text"
                  value={singleNewTitle}
                  onChange={(e) => setSingleNewTitle(e.target.value)}
                  className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Yeni Tag'ler (Virgülle ayırın, maks 13):</label>
                <input
                  type="text"
                  value={singleNewTags}
                  onChange={(e) => setSingleNewTags(e.target.value)}
                  className="w-full bg-[#151f32] border border-[#1e293b] rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Yeni Görsel Seç (Opsiyonel):</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setSingleNewImageFile(e.target.files[0])}
                  className="w-full text-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-[#1e293b]">
              <button
                type="button"
                onClick={() => setReplaceSingleModal(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={replacingSingle}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-500/20"
              >
                {replacingSingle ? 'Güncelleniyor...' : 'Güncelle ve Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
