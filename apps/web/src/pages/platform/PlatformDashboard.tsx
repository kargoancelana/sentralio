/**
 * PlatformDashboard - landing portal Super Admin (/platform).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatformAuth } from '../../context/PlatformAuthContext';
import { platformOrderApi } from '../../lib/platformApi';

export function PlatformDashboard() {
  const { state } = usePlatformAuth();
  const name = state.status === 'authenticated' ? state.admin.name : '';
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    platformOrderApi.pendingCount()
      .then((res) => setPendingCount(res.count))
      .catch(() => setPendingCount(0));
  }, []);

  return (
    <section>
      <h1>Dashboard Platform</h1>
      <p style={{ marginBottom: '24px' }}>Selamat datang, {name}.</p>

      {/* Kartu order menunggu review */}
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '20px 24px',
          borderRadius: '8px',
          border: pendingCount && pendingCount > 0 ? '2px solid #dc2626' : '1px solid var(--border)',
          background: 'var(--bg1)',
          minWidth: '220px',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text3)' }}>
          Order menunggu review
        </p>
        <p
          style={{
            margin: 0,
            fontSize: '2rem',
            fontWeight: 700,
            color: pendingCount && pendingCount > 0 ? '#dc2626' : 'var(--text1)',
          }}
        >
          {pendingCount === null ? '…' : pendingCount}
        </p>
        <Link
          to="/platform/orders"
          className="btn btn-primary"
          style={{ textAlign: 'center', display: 'block', marginTop: '4px' }}
        >
          Lihat antrian
        </Link>
      </div>
    </section>
  );
}
