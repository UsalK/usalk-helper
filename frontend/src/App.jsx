import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import BulkUpload from './pages/BulkUpload';
import TemplateStudio from './pages/TemplateStudio';
import VariationProfiles from './pages/VariationProfiles';
import DefaultSettings from './pages/DefaultSettings';
import EtsyConnect from './pages/EtsyConnect';

const API_BASE = 'http://localhost:3001/api';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [etsyConnected, setEtsyConnected] = useState(false);
  const [activeShop, setActiveShop] = useState(null);
  const [shops, setShops] = useState([]);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    checkEtsyAuth();
  }, []);

  const checkEtsyAuth = async () => {
    try {
      const res = await axios.get(`${API_BASE}/etsy/status`);
      setEtsyConnected(res.data.connected);
      if (res.data.connected) {
        setActiveShop(res.data.activeShop);
        setShops(res.data.shops || []);
      } else {
        setActiveShop(null);
        setShops(res.data.shops || []);
      }
    } catch (err) {
      console.error('Cannot check Etsy connection status:', err);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleSwitchShop = async (shopId) => {
    try {
      setCheckingAuth(true);
      await axios.post(`${API_BASE}/etsy/switch`, { shopId });
      await checkEtsyAuth();
    } catch (err) {
      console.error('Failed to switch shop:', err);
      alert('Mağaza değiştirilemedi.');
    } finally {
      setCheckingAuth(false);
    }
  };

  const renderPage = () => {
    const shopKey = activeShop?.shop_id || 'default';
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard key={shopKey} etsyConnected={etsyConnected} activeShop={activeShop} />;
      case 'bulk-upload':
        return <BulkUpload key={shopKey} etsyConnected={etsyConnected} activeShop={activeShop} />;
      case 'templates':
        return <TemplateStudio key={shopKey} activeShop={activeShop} />;
      case 'variations':
        return <VariationProfiles key={shopKey} activeShop={activeShop} />;
      case 'settings':
        return <DefaultSettings key={shopKey} etsyConnected={etsyConnected} activeShop={activeShop} />;
      case 'etsy-connect':
        return (
          <EtsyConnect 
            key={shopKey}
            etsyConnected={etsyConnected} 
            setEtsyConnected={setEtsyConnected} 
            activeShop={activeShop}
            shops={shops}
            onShopChange={checkEtsyAuth}
          />
        );
      default:
        return <Dashboard key={shopKey} etsyConnected={etsyConnected} activeShop={activeShop} />;
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b0f19] text-amber-500 font-semibold text-sm">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Altyapı Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b0f19] overflow-hidden text-slate-100">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        etsyConnected={etsyConnected} 
        activeShop={activeShop}
        shops={shops}
        onSwitchShop={handleSwitchShop}
      />
      
      <main className="flex-1 overflow-y-auto bg-[#0b0f19]">
        {/* Decorative background glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none z-0"></div>
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-rose-500/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
        
        <div className="relative z-10">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
