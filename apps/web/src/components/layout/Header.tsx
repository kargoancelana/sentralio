import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../context/AuthContext';

const pageMeta: Record<string, { label: string }> = {
  dashboard:    { label: 'Dashboard' },
  integrations: { label: 'Integrasi Toko' },
  channel:      { label: 'Produk Channel' },
  master:       { label: 'Master Produk' },
  settings:     { label: 'Pengaturan' },
  orders:       { label: 'Pesanan Saya' },
  laporan:      { label: 'Laporan' },
};

/** 10-second timeout for the logout request. */
const LOGOUT_TIMEOUT_MS = 10_000;

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
  const local = email.split('@')[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

export function TopBar({ active }: { active: string }) {
  const meta = pageMeta[active] || {};
  const auth = useAuth();
  const { state } = auth;

  const [showMenu, setShowMenu] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [logoutDisabled, setLogoutDisabled] = useState(false);

  const user = state.status === 'authenticated' ? state.user : null;
  const primaryLabel = user ? (user.name?.trim() || user.email) : '';
  const roleLabel = user?.role ?? '';
  const initials = user ? computeInitials(user.name ?? '', user.email) : 'WA';

  async function handleLogout() {
    if (logoutDisabled) return;
    setLogoutDisabled(true);
    const timeoutId = setTimeout(() => setLogoutDisabled(false), LOGOUT_TIMEOUT_MS);
    try {
      await auth.logout();
    } finally {
      clearTimeout(timeoutId);
      setLogoutDisabled(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="bc-root">Hubsentra</span>
        <span className="bc-sep">›</span>
        <span className="bc-curr">{meta.label}</span>
      </div>
      <div className="topbar-right">
        <button className="ic-btn" style={{ position: 'relative' }}>
          <Icon name="bell" size={16} />
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 6, height: 6, borderRadius: '50%',
            background: '#EF4444', border: '2px solid var(--bg)',
          }} />
        </button>

        {/* Account avatar — click to open the account menu (logout) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => user && setShowMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={showMenu}
            title="Menu akun"
            style={{
              border: 'none', background: 'none', padding: 0, cursor: user ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Avatar initials={initials} color="#374151" size={30} />
          </button>

          {showMenu && user && (
            <>
              {/* click-away overlay */}
              <div
                onClick={() => setShowMenu(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  minWidth: '200px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  padding: '6px',
                  zIndex: 41,
                }}
              >
                {/* Identity header */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {primaryLabel}
                  </div>
                  {roleLabel && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', textTransform: 'capitalize' }}>
                      {roleLabel}
                    </div>
                  )}
                </div>

                <button
                  role="menuitem"
                  onClick={() => { setShowMenu(false); setShowConfirm(true); }}
                  disabled={logoutDisabled}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                    padding: '9px 10px', border: 'none', borderRadius: '7px', background: 'none',
                    cursor: 'pointer', font: 'inherit', fontSize: '0.875rem',
                    color: 'var(--danger, #dc2626)', textAlign: 'left',
                  }}
                >
                  <Icon name="logout" size={16} />
                  <span>{logoutDisabled ? 'Keluar…' : 'Keluar'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Logout confirmation modal */}
      {showConfirm && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi keluar"
          onClick={() => !logoutDisabled && setShowConfirm(false)}
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
              <button onClick={() => setShowConfirm(false)} disabled={logoutDisabled} className="btn btn-ghost">
                Batal
              </button>
              <button onClick={handleLogout} disabled={logoutDisabled} className="btn btn-danger">
                {logoutDisabled ? 'Keluar…' : 'Ya, Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
