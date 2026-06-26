/**
 * SubscriptionBanner — banner + overlay hard-block saat langganan company tidak aktif.
 *
 * Ditampilkan di dalam Layout saat `subscriptionBlocked === true`.
 * User tidak bisa berinteraksi dengan fitur data, tapi tombol Logout tetap bisa diklik.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchApi } from '../../lib/api';

interface SubscriptionStatus {
  ok: boolean;
  active: boolean;
  subscription: {
    planName: string;
    endsAt: string;
    status: string;
  } | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SubscriptionBanner() {
  const { subscriptionBlocked, logout } = useAuth();
  const [subDetail, setSubDetail] = useState<SubscriptionStatus['subscription'] | null>(null);

  useEffect(() => {
    if (!subscriptionBlocked) return;
    // Fetch detail langganan walau keblokir (/subscription/status exempt dari guard)
    fetchApi<SubscriptionStatus>('/subscription/status')
      .then((res) => setSubDetail(res.subscription))
      .catch(() => { /* silent */ });
  }, [subscriptionBlocked]);

  if (!subscriptionBlocked) return null;

  return (
    <>
      {/* Overlay — nutup konten utama */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          zIndex: 9998,
          pointerEvents: 'all',
        }}
        aria-hidden="true"
      />

      {/* Banner sticky */}
      <div
        role="alert"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: '#dc2626',
          color: '#fff',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <div>
          <strong>Langganan tidak aktif.</strong>{' '}
          {subDetail
            ? `Paket "${subDetail.planName}" berakhir pada ${formatDate(subDetail.endsAt)}. `
            : ''}
          Hubungi admin/penyedia layanan untuk mengaktifkan kembali.
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          style={{
            backgroundColor: '#fff',
            color: '#dc2626',
            border: 'none',
            borderRadius: '4px',
            padding: '0.4rem 1rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Logout
        </button>
      </div>
    </>
  );
}
