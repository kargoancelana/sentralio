import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { PlatformAuthProvider } from './context/PlatformAuthContext';
import { Layout } from './components/layout/Layout';
import { PlatformLayout } from './components/platform/PlatformLayout';
import { Dashboard } from './pages/Dashboard';
import { MasterProduk } from './pages/MasterProduk';
import { ProdukChannel } from './pages/ProdukChannel';
import { IntegrasiShopee } from './pages/IntegrasiShopee';
import { ShopeeCallback } from './pages/ShopeeCallback';
import { PesananSaya } from './pages/PesananSaya';
import { LaporanKeuangan } from './pages/LaporanKeuangan';
import { LoginPage } from './pages/Login';
import { PlatformLogin } from './pages/platform/PlatformLogin';
import { PlatformDashboard } from './pages/platform/PlatformDashboard';
import { PlatformCompanies } from './pages/platform/PlatformCompanies';
import { PlatformCompanyDetail } from './pages/platform/PlatformCompanyDetail';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PlatformProtectedRoute } from './auth/PlatformProtectedRoute';
import { RoleGate } from './auth/RoleGate';
import { FeatureGate } from './auth/FeatureGate';
import { Pengaturan } from './pages/Pengaturan';
import { AutoBoost } from './pages/AutoBoost';
import { ResetPassword } from './pages/ResetPassword';
import './styles/globals.css';
import './styles/hpp-layout.css';

/**
 * Subtree app tenant, dibungkus AuthProvider tenant. Hanya ter-mount untuk
 * route non-/platform, jadi cek sesi tenant / 'wms.session-expired' tidak
 * pernah jalan di dalam portal Super Admin.
 */
function TenantAuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/**
 * Subtree portal Super Admin, dibungkus PlatformAuthProvider sendiri. Terisolasi
 * dari AuthProvider tenant: cookie sesi beda, cek /me beda.
 */
function PlatformAuthLayout() {
  return (
    <PlatformAuthProvider>
      <Outlet />
    </PlatformAuthProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Portal Super Admin (/platform) - auth context terisolasi */}
          <Route element={<PlatformAuthLayout />}>
            {/* Public portal route */}
            <Route path="/platform/login" element={<PlatformLogin />} />

            {/* Protected portal routes */}
            <Route element={<PlatformProtectedRoute />}>
              <Route element={<PlatformLayout />}>
                <Route path="/platform" element={<PlatformDashboard />} />
                <Route path="/platform/companies" element={<PlatformCompanies />} />
                <Route path="/platform/companies/:id" element={<PlatformCompanyDetail />} />
              </Route>
            </Route>
          </Route>

          {/* App tenant (selain /platform) */}
          <Route element={<TenantAuthLayout />}>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />

            {/* All authenticated routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pesanan/saya" element={<PesananSaya />} />
                {/* Cetak Label shares the orders page */}
                <Route path="/cetak-label" element={<PesananSaya />} />

                {/* Configurable feature routes - gated by effective feature
                    access so admin-granted staff permissions take effect. */}
                <Route element={<FeatureGate feature="master_produk" />}>
                  <Route path="/produk/master" element={<MasterProduk />} />
                </Route>
                <Route element={<FeatureGate feature="produk_channel" />}>
                  <Route path="/produk/channel" element={<ProdukChannel />} />
                </Route>
                <Route element={<FeatureGate feature="auto_boost" />}>
                  <Route path="/promosi/auto-boost" element={<AutoBoost />} />
                </Route>
                <Route element={<FeatureGate feature="laporan_keuangan" />}>
                  <Route path="/keuangan/laporan" element={<LaporanKeuangan />} />
                </Route>

                {/* Shopee integration stays admin-only (manages credentials). */}
                <Route element={<RoleGate allow={['admin']} />}>
                  <Route path="/integrasi/shopee" element={<IntegrasiShopee />} />
                  <Route path="/integrasi/shopee/callback" element={<ShopeeCallback />} />
                </Route>

                {/* Settings - available to all authenticated users.
                    Admin-only sections (user management) are gated inside the page. */}
                <Route path="/settings" element={<Pengaturan />} />
                {/* Legacy /users path now lives under Settings */}
                <Route path="/users" element={<Navigate to="/settings" replace />} />
              </Route>
            </Route>

            {/* Catch-all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
