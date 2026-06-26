import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ToastProvider } from '../ui/Toast';
import { Sidebar } from './Sidebar';
import { TopBar } from './Header';
import { SubscriptionBanner } from '../subscription/SubscriptionBanner';

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Menentukan item navigasi aktif dari URL
  const active = location.pathname.includes('/integrasi/shopee') ? 'integrations'
    : location.pathname.includes('/produk/channel') ? 'channel'
    : location.pathname.includes('/produk/master') ? 'master'
    : location.pathname.includes('/settings') ? 'settings'
    : location.pathname.includes('/pesanan') ? 'orders'
    : location.pathname.includes('/keuangan/laporan') ? 'laporan'
    : 'dashboard';

  return (
    <ToastProvider>
      <SubscriptionBanner />
      <div className="wms-shell">
        <Sidebar
          active={active}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
        <div className="wms-main">
          <TopBar active={active} />
          <Outlet />
        </div>
      </div>
    </ToastProvider>
  );
}
