import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { MasterProduk } from './pages/MasterProduk';
import { ProdukChannel } from './pages/ProdukChannel';
import { IntegrasiShopee } from './pages/IntegrasiShopee';
import { ShopeeCallback } from './pages/ShopeeCallback';
import { PesananSaya } from './pages/PesananSaya';
import { LaporanKeuangan } from './pages/LaporanKeuangan';
import { LoginPage } from './pages/Login';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleGate } from './auth/RoleGate';
import { Pengaturan } from './pages/Pengaturan';
import './styles/globals.css';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* AuthProvider must be inside BrowserRouter because it uses useNavigate */}
        <AuthProvider>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />

            {/* All authenticated routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pesanan/saya" element={<PesananSaya />} />
                {/* Cetak Label shares the orders page */}
                <Route path="/cetak-label" element={<PesananSaya />} />

                {/* Admin-only routes */}
                <Route element={<RoleGate allow={['admin']} />}>
                  <Route path="/produk/master" element={<MasterProduk />} />
                  <Route path="/produk/channel" element={<ProdukChannel />} />
                  <Route path="/keuangan/laporan" element={<LaporanKeuangan />} />
                  <Route path="/integrasi/shopee" element={<IntegrasiShopee />} />
                  <Route path="/integrasi/shopee/callback" element={<ShopeeCallback />} />
                </Route>

                {/* Settings — available to all authenticated users.
                    Admin-only sections (user management) are gated inside the page. */}
                <Route path="/settings" element={<Pengaturan />} />
                {/* Legacy /users path now lives under Settings */}
                <Route path="/users" element={<Navigate to="/settings" replace />} />
              </Route>
            </Route>

            {/* Catch-all — redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
