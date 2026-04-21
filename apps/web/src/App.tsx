import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { MasterProduk } from './pages/MasterProduk';
import { ProdukChannel } from './pages/ProdukChannel';
import { IntegrasiShopee } from './pages/IntegrasiShopee';
import { ShopeeCallback } from './pages/ShopeeCallback';
import './styles/themes.css';
import './styles/globals.css';
import './styles/animations.css';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/produk/master" element={<MasterProduk />} />
            <Route path="/produk/channel" element={<ProdukChannel />} />
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
