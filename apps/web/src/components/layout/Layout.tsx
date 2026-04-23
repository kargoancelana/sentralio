import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ToastProvider } from '../ui/Toast';
import { Sidebar } from './Sidebar';
import { TopBar } from './Header';

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Integrasi Dark Mode
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('wms-theme') === 'dark'; } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('wms-theme', dark ? 'dark' : 'light'); } catch {}
  }, [dark]);

  // Menentukan item navigasi aktif dari URL
  const active = location.pathname.includes('/integrasi/shopee') ? 'integrations'
    : location.pathname.includes('/produk/channel') ? 'channel'
    : location.pathname.includes('/produk/master') ? 'master'
    : location.pathname.includes('/settings') ? 'settings'
    : 'dashboard';

  return (
    <ToastProvider>
      <div className="wms-shell">
        <Sidebar
          active={active}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          dark={dark}
          toggleDark={() => setDark(d => !d)}
        />
        <div className="wms-main">
          <TopBar active={active} />
          <Outlet />
        </div>
      </div>
    </ToastProvider>
  );
}
