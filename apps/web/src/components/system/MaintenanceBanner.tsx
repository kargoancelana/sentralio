/**
 * MaintenanceBanner - konsumsi GET /system/status (publik, tanpa login).
 *
 * - level='off'    -> nggak render apa-apa
 * - level='banner' -> banner peringatan sticky (app tetap jalan)
 * - level='full'   -> overlay full-screen nutup app tenant
 *
 * Dimount HANYA di subtree tenant (TenantAuthLayout), jadi portal Super Admin
 * (/platform) nggak pernah keblok -> admin tetap bisa matiin maintenance.
 * Polling tiap 60 detik biar status nyusul perubahan dari portal.
 */

import { useEffect, useState } from 'react';
import { api, type MaintenanceLevel } from '../../lib/api';

const POLL_MS = 60_000;

export function MaintenanceBanner() {
  const [level, setLevel] = useState<MaintenanceLevel>('off');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const res = await api.systemStatus();
        if (!active) return;
        setLevel(res.maintenance?.level ?? 'off');
        setMessage(res.maintenance?.message ?? '');
      } catch {
        /* silent: jangan ganggu app kalau status gagal diambil */
      }
    }

    void check();
    const id = setInterval(() => void check(), POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (level === 'off') return null;

  if (level === 'full') {
    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(17,17,17,0.96)', color: '#fff',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: 24,
        }}
      >
        <h1 style={{ marginBottom: 12 }}>Sedang Maintenance</h1>
        <p style={{ maxWidth: 480 }}>
          {message || 'Aplikasi sedang dalam pemeliharaan. Silakan coba lagi nanti.'}
        </p>
      </div>
    );
  }

  // level === 'banner'
  return (
    <div
      role="alert"
      style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: '#fde68a', color: '#7c2d12',
        padding: '8px 16px', textAlign: 'center', fontSize: 14,
      }}
    >
      {message || 'Pemberitahuan: ada pemeliharaan terjadwal.'}
    </div>
  );
}
