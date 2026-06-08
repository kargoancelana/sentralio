/**
 * UsersAdmin — Admin-only user management page.
 *
 * - Lists all users (email, name, role, is_active).
 * - Create User form (POST /users) with friendly Indonesian field errors.
 * - Per-row activate/deactivate with confirmation + self-lockout / last-admin
 *   guards enforced server-side.
 *
 * Uses shared theme tokens/classes (.card, .form-input, .btn, .wms-table,
 * .badge, .modal-*) so it renders correctly in light and dark mode.
 */

import { type FormEvent, useEffect, useState } from 'react';
import { fetchApi, ApiError } from '../lib/api';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Icon } from '../components/ui/Icon';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  isActive?: boolean | number;
  is_active?: boolean | number;
}

interface CreateUserErrors {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
  general?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUserActive(user: User): boolean {
  const v = user.isActive ?? user.is_active;
  return v === true || v === 1;
}

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <span role="alert" style={{ fontSize: '0.78rem', color: 'var(--error)', marginTop: '4px', display: 'block' }}>
      {msg}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsersAdmin() {
  const { state } = useAuth();
  const currentUserId = state.status === 'authenticated' ? state.user.id : null;

  const [users, setUsers] = useState<User[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<User | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<CreateUserErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    fetchApi<User[]>('/users')
      .then((data) => {
        if (!cancelled) {
          setUsers(data);
          setListLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setListError(err instanceof ApiError ? err.message : 'Gagal memuat daftar pengguna.');
          setListLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Raw fetch so we can read the full { errors: {...} } body on 400.
  async function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (formSubmitting) return;

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    setFormErrors({});
    setCreateSuccess(false);
    setFormSubmitting(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmedEmail, name: trimmedName, role, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 201) {
        setUsers((prev) => [...prev, data as User]);
        setEmail('');
        setName('');
        setRole('staff');
        setPassword('');
        setFormErrors({});
        setCreateSuccess(true);
      } else if (res.status === 400 && data?.errors) {
        setFormErrors(data.errors as CreateUserErrors);
      } else if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('wms.session-expired'));
        setFormErrors({ general: 'Sesi habis. Silakan masuk kembali.' });
      } else if (res.status === 403) {
        setFormErrors({ general: 'Anda tidak memiliki akses untuk membuat pengguna.' });
      } else {
        setFormErrors({ general: data?.message || 'Gagal membuat pengguna. Silakan coba lagi.' });
      }
    } catch {
      setFormErrors({ general: 'Terjadi kesalahan jaringan. Silakan coba lagi.' });
    } finally {
      setFormSubmitting(false);
    }
  }

  function handleToggleClick(user: User) {
    if (togglingId !== null) return;
    setToggleError(null);
    if (isUserActive(user)) {
      setConfirmTarget(user);
    } else {
      void performToggle(user, true);
    }
  }

  async function performToggle(user: User, newActive: boolean) {
    setTogglingId(user.id);
    setToggleError(null);

    try {
      const res = await fetch(`/api/users/${user.id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: newActive }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isActive: newActive, is_active: newActive } : u)),
        );
        setConfirmTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) window.dispatchEvent(new CustomEvent('wms.session-expired'));
        setToggleError((data && (data.message || data.error)) || 'Gagal mengubah status pengguna.');
        setConfirmTarget(null);
      }
    } catch {
      setToggleError('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setTogglingId(null);
    }
  }

  async function performDelete(user: User) {
    setDeletingId(user.id);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        setDeleteTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) window.dispatchEvent(new CustomEvent('wms.session-expired'));
        setDeleteError((data && (data.message || data.error)) || 'Gagal menghapus pengguna.');
        setDeleteTarget(null);
      }
    } catch {
      setDeleteError('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '960px' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text1)', marginBottom: '4px' }}>
        Manajemen Pengguna
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: '20px' }}>
        Kelola akun pengguna WMS
      </p>

      {/* ── Create User Form ── */}
      <section className="card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text1)', marginBottom: '16px' }}>
          Buat Pengguna Baru
        </h3>

        {createSuccess && (
          <div
            role="status"
            style={{
              padding: '11px 14px',
              backgroundColor: 'var(--bg2)',
              border: '1px solid var(--success)',
              color: 'var(--success)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}
          >
            Pengguna berhasil dibuat.
          </div>
        )}

        {formErrors.general && (
          <div
            role="alert"
            style={{
              padding: '11px 14px',
              backgroundColor: 'var(--bg2)',
              border: '1px solid var(--error)',
              color: 'var(--error)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}
          >
            {formErrors.general}
          </div>
        )}

        <form onSubmit={handleCreateSubmit} noValidate>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div>
              <label htmlFor="create-email" className="form-label">Email</label>
              <input
                id="create-email"
                type="email"
                autoComplete="off"
                maxLength={254}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={formSubmitting}
                className="form-input"
                style={formErrors.email ? { borderColor: 'var(--error)' } : undefined}
                placeholder="email@contoh.com"
              />
              <FieldError msg={formErrors.email} />
            </div>

            <div>
              <label htmlFor="create-name" className="form-label">Nama</label>
              <input
                id="create-name"
                type="text"
                autoComplete="off"
                maxLength={100}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={formSubmitting}
                className="form-input"
                style={formErrors.name ? { borderColor: 'var(--error)' } : undefined}
                placeholder="Nama lengkap"
              />
              <FieldError msg={formErrors.name} />
            </div>

            <div>
              <label htmlFor="create-role" className="form-label">Peran</label>
              <select
                id="create-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
                disabled={formSubmitting}
                className="form-input"
                style={{ cursor: formSubmitting ? 'not-allowed' : 'pointer' }}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
              <FieldError msg={formErrors.role} />
            </div>

            <div>
              <label htmlFor="create-password" className="form-label">Password</label>
              <PasswordInput
                id="create-password"
                autoComplete="new-password"
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={formSubmitting}
                style={formErrors.password ? { borderColor: 'var(--error)' } : undefined}
                placeholder="Min. 8 karakter"
              />
              <FieldError msg={formErrors.password} />
              {!formErrors.password && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text4)', marginTop: '4px', display: 'block' }}>
                  Minimal 8 karakter, ada huruf kapital dan karakter khusus.
                </span>
              )}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
            {formSubmitting ? 'Menyimpan…' : 'Buat Pengguna'}
          </button>
        </form>
      </section>

      {/* ── User List ── */}
      <section className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text1)', margin: 0 }}>
            Daftar Pengguna
          </h3>
        </div>

        {listLoading && <div className="empty-state">Memuat data pengguna…</div>}

        {listError && !listLoading && (
          <div role="alert" style={{ padding: '20px', color: 'var(--error)', fontSize: '0.875rem' }}>
            {listError}
          </div>
        )}

        {!listLoading && !listError && users.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-text">Belum ada pengguna terdaftar.</div>
          </div>
        )}

        {!listLoading && !listError && users.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="wms-table">
              <thead>
                <tr>
                  {(['Email', 'Nama', 'Peran', 'Status', 'Aksi'] as const).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const active = isUserActive(user);
                  const toggling = togglingId === user.id;
                  return (
                    <tr key={user.id}>
                      <td style={{ color: 'var(--text1)', wordBreak: 'break-all' }}>{user.email}</td>
                      <td style={{ color: 'var(--text1)' }}>
                        {user.name || <span style={{ color: 'var(--text4)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${user.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${active ? 'badge-green' : 'badge-red'}`}>
                          {active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>
                        {user.id === currentUserId ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text4)' }}>(Anda)</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleToggleClick(user)}
                              disabled={toggling || togglingId !== null || deletingId !== null}
                              className={`btn btn-xs ${active ? 'btn-danger' : 'btn-ghost'}`}
                              aria-label={active ? `Nonaktifkan ${user.email}` : `Aktifkan ${user.email}`}
                            >
                              {toggling ? '…' : active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button
                              onClick={() => {
                                if (deletingId !== null || togglingId !== null) return;
                                setDeleteError(null);
                                setDeleteTarget(user);
                              }}
                              disabled={deletingId !== null || togglingId !== null}
                              className="btn btn-xs btn-danger"
                              title={`Hapus ${user.email}`}
                              aria-label={`Hapus ${user.email}`}
                              style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px' }}
                            >
                              {deletingId === user.id ? '…' : <Icon name="trash" size={14} />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {toggleError && (
        <div
          role="alert"
          style={{
            marginTop: '16px',
            padding: '11px 14px',
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
          }}
        >
          {toggleError}
        </div>
      )}

      {deleteError && (
        <div
          role="alert"
          style={{
            marginTop: '16px',
            padding: '11px 14px',
            backgroundColor: 'var(--bg2)',
            border: '1px solid var(--error)',
            color: 'var(--error)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
          }}
        >
          {deleteError}
        </div>
      )}

      {/* Deactivation confirmation modal */}
      {confirmTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi nonaktifkan pengguna"
          onClick={() => togglingId === null && setConfirmTarget(null)}
        >
          <div className="modal-box" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text1)', marginBottom: '8px' }}>
                Nonaktifkan pengguna?
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text3)' }}>
                <strong style={{ color: 'var(--text1)' }}>{confirmTarget.name || confirmTarget.email}</strong>{' '}
                tidak akan bisa login sampai diaktifkan kembali.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmTarget(null)} disabled={togglingId !== null} className="btn btn-ghost">
                Batal
              </button>
              <button
                onClick={() => confirmTarget && performToggle(confirmTarget, false)}
                disabled={togglingId !== null}
                className="btn btn-danger"
              >
                {togglingId !== null ? 'Memproses…' : 'Ya, Nonaktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi hapus pengguna"
          onClick={() => deletingId === null && setDeleteTarget(null)}
        >
          <div className="modal-box" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text1)', marginBottom: '8px' }}>
                Hapus pengguna?
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text3)' }}>
                <strong style={{ color: 'var(--text1)' }}>{deleteTarget.name || deleteTarget.email}</strong>{' '}
                akan dihapus permanen beserta sesi loginnya. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeleteTarget(null)} disabled={deletingId !== null} className="btn btn-ghost">
                Batal
              </button>
              <button
                onClick={() => deleteTarget && performDelete(deleteTarget)}
                disabled={deletingId !== null}
                className="btn btn-danger"
              >
                {deletingId !== null ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
