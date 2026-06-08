/**
 * Pengaturan (Settings) — hub page combining account-related settings.
 *
 * Tabs:
 *   - Ubah Password: any authenticated user can change their own password.
 *   - Manajemen Pengguna: admin-only user management (create/list/toggle).
 *
 * The Manajemen Pengguna tab is only shown to admins.
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/ui/Icon';
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm';
import { StaffPermissions } from '../components/settings/StaffPermissions';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { UsersAdmin } from './UsersAdmin';

type Tab = 'password' | 'appearance' | 'users' | 'permissions';

export function Pengaturan() {
  const { state } = useAuth();
  const isAdmin = state.status === 'authenticated' && state.user.role === 'admin';

  const [tab, setTab] = useState<Tab>('password');

  const tabs: { id: Tab; label: string; icon: string; show: boolean }[] = [
    { id: 'password', label: 'Ubah Password', icon: 'lock', show: true },
    { id: 'appearance', label: 'Tampilan & Aksesibilitas', icon: 'sun', show: true },
    { id: 'users', label: 'Manajemen Pengguna', icon: 'users', show: isAdmin },
    { id: 'permissions', label: 'Akses Staff', icon: 'settings', show: isAdmin },
  ];

  return (
    <div className="wms-page animate-fade-in">
      <div style={{ maxWidth: '1000px' }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Pengaturan</h1>
            <p className="page-subtitle">Kelola akun dan preferensi</p>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'inherit',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
                background: 'none',
                cursor: 'pointer',
                color: tab === t.id ? 'var(--text1)' : 'var(--text3)',
                marginBottom: '-1px',
              }}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'password' && <ChangePasswordForm />}
        {tab === 'appearance' && <AppearanceSettings />}
        {tab === 'users' && isAdmin && <UsersAdmin />}
        {tab === 'permissions' && isAdmin && <StaffPermissions />}
      </div>
    </div>
  );
}
