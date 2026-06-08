/**
 * StaffPermissions — admin UI to configure which features the `staff` role can
 * access. Renders a themed toggle per configurable feature.
 *
 * Auto-save: flipping a toggle persists immediately via PUT /auth/permissions.
 * The row shows a saving indicator while in flight and reverts on error.
 * Admin always has full access; some features (user management, Shopee
 * integration) are admin-only and not shown here.
 */

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../ui/Icon';

/** Friendly labels + descriptions for configurable features. */
const FEATURE_META: Record<string, { label: string; desc: string; icon: string }> = {
  orders: { label: 'Pesanan Saya', desc: 'Lihat, proses pesanan & cetak label', icon: 'orders' },
  cetak_label: { label: 'Cetak Label', desc: 'Cetak label pengiriman', icon: 'orders' },
  master_produk: { label: 'Master Produk', desc: 'Kelola data master produk & HPP', icon: 'master' },
  produk_channel: { label: 'Produk Channel', desc: 'Kelola listing produk channel', icon: 'products' },
  laporan_keuangan: { label: 'Laporan Keuangan', desc: 'Lihat laporan laba rugi', icon: 'reports' },
};

/**
 * Features that are not shown as their own row because they're an inseparable
 * part of another feature. `cetak_label` lives inside the Pesanan Saya page
 * (the batch "Cetak Label" action), so it's folded into the `orders` toggle:
 * flipping Pesanan Saya flips cetak_label to match.
 */
const HIDDEN_FEATURES = new Set<string>(['cetak_label']);

/** Features that should mirror the state of `orders` when it's toggled. */
const ORDERS_LINKED_FEATURES = ['cetak_label'] as const;

interface Row {
  feature: string;
  enabled: boolean;
}

export function StaffPermissions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .permissionsList()
      .then((res) => {
        if (alive) setRows(res.permissions);
      })
      .catch(() => {
        if (alive) setError('Gagal memuat pengaturan izin.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Auto-save: optimistically flip, persist, revert on failure. */
  async function toggle(feature: string) {
    if (savingFeature !== null) return;

    const current = rows.find((r) => r.feature === feature);
    if (!current) return;
    const nextEnabled = !current.enabled;

    // `cetak_label` is part of the Pesanan Saya page, so the `orders` toggle
    // controls both. Flipping orders flips its linked features to match.
    const linked = feature === 'orders' ? [...ORDERS_LINKED_FEATURES] : [];
    const affected = new Set<string>([feature, ...linked]);

    // Optimistic update.
    setRows((prev) => prev.map((r) => (affected.has(r.feature) ? { ...r, enabled: nextEnabled } : r)));
    setSavingFeature(feature);
    setError(null);

    try {
      const payload = rows.map((r) => (affected.has(r.feature) ? { ...r, enabled: nextEnabled } : r));
      const res = await api.permissionsUpdate(payload);
      setRows(res.permissions);
    } catch {
      // Revert on error.
      setRows((prev) => prev.map((r) => (affected.has(r.feature) ? { ...r, enabled: current.enabled } : r)));
      setError('Gagal menyimpan perubahan. Coba lagi.');
    } finally {
      setSavingFeature(null);
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text3)', padding: '12px 0' }}>Memuat…</div>;
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text1)', marginBottom: '4px' }}>
          Akses Fitur Staff
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text3)' }}>
          Tentukan fitur apa saja yang dapat diakses oleh pengguna dengan peran <strong>staff</strong>.
          Perubahan tersimpan otomatis. Admin selalu memiliki akses penuh. Dashboard, ganti password,
          dan keluar selalu tersedia untuk staff.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: 'var(--danger-bg, rgba(220,38,38,0.1))',
            color: 'var(--danger, #dc2626)',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '0.875rem',
            marginBottom: '12px',
          }}
        >
          {error}
        </div>
      )}

      <div className="card" style={{ padding: '4px 0' }}>
        {rows.filter((row) => !HIDDEN_FEATURES.has(row.feature)).map((row, idx) => {
          const meta = FEATURE_META[row.feature] ?? {
            label: row.feature,
            desc: '',
            icon: 'dashboard',
          };
          const saving = savingFeature === row.feature;
          const disabled = savingFeature !== null;
          return (
            <div
              key={row.feature}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '14px 16px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                opacity: disabled && !saving ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'var(--text3)', display: 'flex' }}>
                  <Icon name={meta.icon} size={18} />
                </span>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text1)' }}>
                    {meta.label}
                  </div>
                  {meta.desc && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>{meta.desc}</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {saving && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Menyimpan…</span>
                )}
                {/* Themed toggle switch */}
                <button
                  role="switch"
                  aria-checked={row.enabled}
                  aria-label={`${meta.label}: ${row.enabled ? 'aktif' : 'nonaktif'}`}
                  onClick={() => toggle(row.feature)}
                  disabled={disabled}
                  style={{
                    position: 'relative',
                    width: '44px',
                    height: '24px',
                    borderRadius: '999px',
                    border: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                    background: row.enabled ? 'var(--accent)' : 'var(--border)',
                    transition: 'background 0.18s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: row.enabled ? '22px' : '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#fff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                      transition: 'left 0.18s ease',
                    }}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
