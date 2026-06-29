/**
 * PlatformLayout - shell portal Super Admin (/platform/*).
 *
 * Sidebar + header berisi nama admin yang login dan tombol logout, lalu
 * <Outlet/> untuk halaman portal aktif.
 */

import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { usePlatformAuth } from '../../context/PlatformAuthContext';
import { platformOrderApi } from '../../lib/platformApi';

export function PlatformLayout() {
  const { state, logout } = usePlatformAuth();
  const adminName = state.status === 'authenticated' ? state.admin.name : '';
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    platformOrderApi.pendingCount()
      .then((res) => setPendingCount(res.count))
      .catch(() => { /* silent */ });
  }, []);

  return (
    <div className="platform-shell">
      <aside className="platform-shell__sidebar">
        <div className="platform-shell__brand">Super Admin</div>
        <nav className="platform-shell__nav">
          <NavLink to="/platform" end>
            Dashboard
          </NavLink>
          <NavLink to="/platform/companies">
            Companies
          </NavLink>
          <NavLink to="/platform/orders">
            Order{pendingCount > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  background: '#dc2626',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  verticalAlign: 'middle',
                }}
              >
                {pendingCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/platform/plans">
            Plans
          </NavLink>
          <NavLink to="/platform/coupons">
            Coupons
          </NavLink>
          <NavLink to="/platform/settings">
            Settings
          </NavLink>
        </nav>
      </aside>
      <div className="platform-shell__main">
        <header className="platform-shell__header">
          <span className="platform-shell__admin">{adminName}</span>
          <button type="button" className="btn" onClick={() => void logout()}>
            Keluar
          </button>
        </header>
        <main className="platform-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
