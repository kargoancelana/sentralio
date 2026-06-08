/**
 * Sidebar — collapsible navigation sidebar.
 *
 * Identity is read dynamically from AuthContext (Req 4.6):
 *   - Primary line: user.name || user.email
 *   - Secondary line: user.role
 *   - Avatar initials: first letter of each word in name (max 2), or first two
 *     chars of the email local-part when name is absent/whitespace.
 *
 * Nav items are filtered by role via visibleNavFor() from the shared auth
 * matrix (Req 5.6, 11.5).
 *
 * Logout control (Req 3.1, 3.2, 3.6):
 *   - Only rendered when state.status === 'authenticated'.
 *   - On click: disables itself, calls auth.logout(), re-enables after the
 *     request resolves or after a 10-second timeout (whichever comes first).
 *
 * Requirements: 3.1, 3.2, 3.4, 3.6, 4.1, 4.6, 5.6, 5.7, 11.5
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../context/AuthContext';
import { effectiveFeatures, type Feature } from '../../auth/matrix';

/** 10-second timeout for the logout request (Req 3.2). */
const LOGOUT_TIMEOUT_MS = 10_000;

// ─── Nav item definitions ──────────────────────────────────────────────────
// Each nav item carries a `feature` field (or `isHeader`) so we can filter
// by role using visibleNavFor().

interface NavHeader {
  id: string;
  isHeader: true;
  label: string;
}

interface NavItem {
  id: string;
  isHeader?: false;
  label: string;
  icon: string;
  path: string;
  badge?: string | null;
  /** The matrix Feature that gates this nav item. */
  feature: Feature;
  /** When true, the item is always shown regardless of role (e.g. Dashboard). */
  alwaysVisible?: boolean;
}

type NavEntry = NavHeader | NavItem;

const ALL_NAV: NavEntry[] = [
  { id: 'dashboard',        label: 'Dashboard',        icon: 'dashboard',    path: '/',                 feature: 'me_logout', alwaysVisible: true },
  { id: 'header-produk',    label: 'PRODUK',          isHeader: true },
  { id: 'master',           label: 'Master Produk',    icon: 'master',       path: '/produk/master',    feature: 'master_produk' },
  { id: 'channel',          label: 'Produk Channel',   icon: 'products',     path: '/produk/channel',   feature: 'produk_channel' },
  { id: 'header-pesanan',   label: 'PESANAN',          isHeader: true },
  { id: 'orders',           label: 'Pesanan Saya',     icon: 'orders',       path: '/pesanan/saya',     feature: 'orders' },
  { id: 'header-keuangan',  label: 'KEUANGAN',         isHeader: true },
  { id: 'laporan',          label: 'Laporan',           icon: 'reports',      path: '/keuangan/laporan', feature: 'laporan_keuangan' },
  { id: 'header-toko',      label: 'WORKFLOW',         isHeader: true },
  { id: 'integrations',     label: 'Integrasi Toko',   icon: 'integrations', path: '/integrasi/shopee', feature: 'integrasi_toko' },
  { id: 'header-system',    label: 'SYSTEM',           isHeader: true },
  { id: 'settings',         label: 'Pengaturan',       icon: 'settings',     path: '/settings',         feature: 'me_logout' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Compute avatar initials.
 * - From name: first letter of each word, max 2, uppercase.
 * - From email: first two characters of the local-part, uppercase.
 */
function computeInitials(name: string, email: string): string {
  const trimmedName = name.trim();
  if (trimmedName) {
    const words = trimmedName.split(/\s+/);
    const letters = words.map((w) => w[0] ?? '').join('').toUpperCase();
    return letters.slice(0, 2);
  }
  // Fall back to email local-part.
  const local = email.split('@')[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────

interface SidebarProps {
  active: string;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  dark: boolean;
  toggleDark: () => void;
}

export function Sidebar({ active, collapsed, setCollapsed, dark, toggleDark }: SidebarProps) {
  const auth = useAuth();
  const { state } = auth;

  const [logoutDisabled, setLogoutDisabled] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // ── Derive identity ──────────────────────────────────────────────────────
  const user = state.status === 'authenticated' ? state.user : null;
  const primaryLabel = user ? (user.name?.trim() || user.email) : '';
  const roleLabel = user?.role ?? '';
  const initials = user ? computeInitials(user.name ?? '', user.email) : 'WA';

  // ── Filter nav items ─────────────────────────────────────────────────────
  // When authenticated, hide nav entries the user's role cannot access.
  // When not yet authenticated, show nothing (loading / anonymous handled by ProtectedRoute).
  const visibleFeatures: Set<Feature> = user
    ? effectiveFeatures(user)
    : new Set<Feature>();

  // Build the filtered list; also strip orphaned section headers.
  const filteredNav: NavEntry[] = [];
  for (let i = 0; i < ALL_NAV.length; i++) {
    const entry = ALL_NAV[i];
    if (entry.isHeader) {
      // Peek ahead: include header only if at least one following non-header
      // item (before the next header) is visible.
      let hasVisible = false;
      for (let j = i + 1; j < ALL_NAV.length; j++) {
        const next = ALL_NAV[j];
        if (next.isHeader) break;
        const nextItem = next as NavItem;
        if (nextItem.alwaysVisible || visibleFeatures.has(nextItem.feature)) {
          hasVisible = true;
          break;
        }
      }
      if (hasVisible) filteredNav.push(entry);
    } else {
      const item = entry as NavItem;
      if (item.alwaysVisible || visibleFeatures.has(item.feature)) {
        filteredNav.push(entry);
      }
    }
  }

  // ── Logout handler ───────────────────────────────────────────────────────
  async function handleLogout() {
    if (logoutDisabled) return;

    setLogoutDisabled(true);

    // 10-second timeout in case the request hangs (Req 3.2).
    const timeoutId = setTimeout(() => {
      setLogoutDisabled(false);
    }, LOGOUT_TIMEOUT_MS);

    try {
      await auth.logout();
    } finally {
      clearTimeout(timeoutId);
      setLogoutDisabled(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* User identity (Req 3.1, 4.6) — clickable to open account menu (logout) */}
      <div
        className={`sb-user ${collapsed ? 'collapsed' : ''}`}
        style={{ position: 'relative', ...(collapsed ? { justifyContent: 'center', padding: '15px 0 11px 0' } : {}) }}
      >
        {state.status === 'authenticated' ? (
          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            title={collapsed ? primaryLabel : 'Menu akun'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: collapsed ? 0 : '10px',
              flex: 1,
              minWidth: 0,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              textAlign: 'left',
            }}
          >
            <Avatar initials={initials} color="#111827" size={34} />
            {!collapsed && (
              <div className="sb-user-info" style={{ minWidth: 0 }}>
                <div className="sb-user-name">{primaryLabel}</div>
                {roleLabel && <div className="sb-user-role">{roleLabel}</div>}
              </div>
            )}
            {!collapsed && (
              <span style={{ marginLeft: 'auto', color: 'var(--text3)', display: 'flex' }}>
                <Icon name="menu" size={12} />
              </span>
            )}
          </button>
        ) : (
          <>
            {!collapsed && <Avatar initials={initials} color="#111827" size={34} />}
            {!collapsed && (
              <div className="sb-user-info">
                <div className="sb-user-name">{primaryLabel}</div>
                {roleLabel && <div className="sb-user-role">{roleLabel}</div>}
              </div>
            )}
          </>
        )}
        <button className="ic-btn" onClick={() => setCollapsed(c => !c)} title="Toggle sidebar">
          <Icon name="menu" size={14} />
        </button>

        {/* Account dropdown menu */}
        {showUserMenu && state.status === 'authenticated' && (
          <>
            {/* click-away overlay */}
            <div
              onClick={() => setShowUserMenu(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            />
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% - 4px)',
                left: collapsed ? '50%' : '12px',
                transform: collapsed ? 'translateX(-50%)' : 'none',
                minWidth: '180px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                padding: '6px',
                zIndex: 41,
              }}
            >
              <button
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  setShowLogoutConfirm(true);
                }}
                disabled={logoutDisabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 10px',
                  border: 'none',
                  borderRadius: '7px',
                  background: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: '0.875rem',
                  color: 'var(--danger, #dc2626)',
                  textAlign: 'left',
                }}
              >
                <Icon name="logout" size={16} />
                <span>{logoutDisabled ? 'Keluar…' : 'Keluar'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nav — filtered by role (Req 5.6, 11.5) */}
      <nav className="sb-nav">
        {filteredNav.map((entry) => {
          if (entry.isHeader) {
            return !collapsed ? (
              <div
                key={entry.id}
                className="sb-section-label"
                style={{ marginTop: entry.id !== 'header-produk' ? 12 : 0 }}
              >
                {entry.label}
              </div>
            ) : null;
          }
          const item = entry as NavItem;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`nav-btn ${active === item.id ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
              style={{ textDecoration: 'none' }}
            >
              <Icon name={item.icon} size={16} />
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {!collapsed && item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        <button className="nav-btn" onClick={toggleDark} title="Toggle theme">
          <Icon name={dark ? 'sun' : 'moon'} size={16} />
          {!collapsed && <span className="nav-label">{dark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        <button className="nav-btn" title={collapsed ? 'Help' : undefined}>
          <Icon name="help" size={16} />
          {!collapsed && <span className="nav-label">Bantuan</span>}
        </button>
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi keluar"
          onClick={() => !logoutDisabled && setShowLogoutConfirm(false)}
        >
          <div className="modal-box" style={{ maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text1)', marginBottom: '8px' }}>
                Keluar dari akun?
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text3)' }}>
                Anda perlu login kembali untuk mengakses aplikasi.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowLogoutConfirm(false)} disabled={logoutDisabled} className="btn btn-ghost">
                Batal
              </button>
              <button onClick={handleLogout} disabled={logoutDisabled} className="btn btn-danger">
                {logoutDisabled ? 'Keluar…' : 'Ya, Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
