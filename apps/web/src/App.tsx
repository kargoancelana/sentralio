import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { MasterProduk } from './pages/MasterProduk';
import { ProdukChannel } from './pages/ProdukChannel';
import { IntegrasiShopee } from './pages/IntegrasiShopee';
import { ShopeeCallback } from './pages/ShopeeCallback';
import { PesananSaya } from './pages/PesananSaya';
import './styles/globals.css';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/produk/master" element={<MasterProduk />} />
            <Route path="/produk/channel" element={<ProdukChannel />} />
            <Route path="/pesanan/saya" element={<PesananSaya />} />
            <Route path="/keuangan/laporan" element={
              <div className="animate-fade-in" style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
                  <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text1)', margin: '0 0 8px' }}>Laporan Keuangan</h2>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text3)' }}>Coming soon...</p>
              </div>
            } />
            <Route path="/integrasi/shopee" element={<IntegrasiShopee />} />
            <Route path="/integrasi/shopee/callback" element={<ShopeeCallback />} />
            <Route path="/settings" element={
              <div className="animate-fade-in" style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <h2>Settings</h2>
                <p style={{ marginTop: '8px' }}>Coming soon...</p>
              </div>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
