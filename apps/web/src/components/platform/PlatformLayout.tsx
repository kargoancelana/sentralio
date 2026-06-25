/**
 * PlatformLayout - shell portal Super Admin (/platform/*).
 *
 * Sidebar + header berisi nama admin yang login dan tombol logout, lalu
 * <Outlet/> untuk halaman portal aktif. Nav selain Dashboard adalah
 * placeholder untuk fase berikutnya (companies, plans, dst).
 */

import { NavLink, Outlet } from 'react-router-dom';
import { usePlatformAuth } from '../../context/PlatformAuthContext';

export function PlatformLayout() {
  const { state, logout } = usePlatformAuth();
  const adminName = state.status === 'authenticated' ? state.admin.name : '';

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
          <NavLink to="/platform/plans">
            Plans
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
