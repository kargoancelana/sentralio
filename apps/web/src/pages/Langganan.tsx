/**
 * Langganan — halaman self-service langganan untuk tenant.
 *
 * Standalone (BUKAN di dalam Layout) supaya SubscriptionBanner overlay tidak nutupin.
 * Accessible walau langganan belum aktif (route tidak dibungkus SubscriptionGate).
 *
 * State machine:
 *   - status.active === true  -> kartu "Langganan aktif"
 *   - tidak ada pending order -> tampilkan plan picker
 *   - pending + proofKey null -> form upload bukti
 *   - pending + proofKey ada  -> menunggu verifikasi
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError, type SubscriptionOrder, type SubscriptionPlan, type SubscriptionStatus } from '../lib/api';

const formatRupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'badge badge--pending',
    approved: 'badge badge--active',
    rejected: 'badge badge--inactive',
  };
  return map[status] ?? 'badge';
}

export function Langganan() {
  const { logout, refreshMe } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [orders, setOrders] = useState<SubscriptionOrder[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create order state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Checking status
  const [checking, setChecking] = useState(false);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, ordersRes, plansRes] = await Promise.all([
        api.subscriptionStatus().catch(() => null),
        api.subscriptionOrders().catch(() => ({ ok: true, orders: [] as SubscriptionOrder[] })),
        api.subscriptionPlans().catch(() => ({ ok: true, plans: [] as SubscriptionPlan[] })),
      ]);
      if (statusRes) setSubStatus(statusRes);
      setOrders((ordersRes as any).orders ?? []);
      setPlans((plansRes as any).plans ?? []);
    } catch {
      setError('Gagal memuat data langganan.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  async function handleSelectPlan(planId: number) {
    setCreatingOrder(true);
    setOrderError(null);
    try {
      await api.subscriptionCreateOrder(planId);
      await fetchAll();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // pending_order_exists — refetch
        await fetchAll();
      } else if (err instanceof ApiError && err.status === 404) {
        setOrderError('Paket tidak ditemukan.');
      } else {
        setOrderError('Terjadi kesalahan, coba lagi.');
      }
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleUpload(orderId: number) {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Pilih file bukti dulu.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await api.subscriptionUploadProof(orderId, file);
      await fetchAll();
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = err.message;
        if (msg === 'invalid_file_type') setUploadError('Format file harus JPG, PNG, atau PDF.');
        else if (msg === 'file_too_large') setUploadError('Ukuran file terlalu besar (maks 5MB).');
        else if (msg === 'file_required') setUploadError('Pilih file bukti dulu.');
        else if (msg === 'order_not_pending') setUploadError('Order ini sudah diproses.');
        else if (msg === 'storage_not_configured') setUploadError('Upload belum tersedia, hubungi admin.');
        else setUploadError('Terjadi kesalahan saat upload.');
      } else {
        setUploadError('Terjadi kesalahan saat upload.');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleCheckStatus() {
    setChecking(true);
    try {
      await refreshMe();
      // refreshMe update subscriptionActive; kalau sudah true, SubscriptionGate redirect ke /
      navigate('/');
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }

  const pendingOrder = orders.find((o) => o.status === 'pending') ?? null;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text3)' }}>Memuat…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg3)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ backgroundColor: 'var(--bg1)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src="/logo.png" alt="Sentralio" style={{ height: '36px' }} />
        <button type="button" className="btn" onClick={() => void logout()}>Logout</button>
      </header>

      <main style={{ flex: 1, maxWidth: '720px', margin: '0 auto', width: '100%', padding: '32px 24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>Langganan</h1>

        {error && <p style={{ color: 'var(--error)', marginBottom: '16px' }}>{error}</p>}

        {/* ── Status aktif ── */}
        {subStatus?.active && subStatus.subscription && (
          <div className="card" style={{ padding: '24px', marginBottom: '24px', border: '2px solid var(--success, #22c55e)' }}>
            <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px', color: 'var(--text1)' }}>
              ✅ Langganan aktif: {subStatus.subscription.planName}
            </p>
            <p style={{ color: 'var(--text3)', fontSize: '0.9rem', marginBottom: '16px' }}>
              Berlaku hingga {formatDate(subStatus.subscription.endsAt)}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
              Masuk ke aplikasi
            </button>
          </div>
        )}

        {/* ── Belum aktif ── */}
        {!subStatus?.active && (
          <>
            {/* Ada pending order + belum ada bukti */}
            {pendingOrder && !pendingOrder.proofKey && (
              <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>Upload Bukti Transfer</h2>
                <p style={{ color: 'var(--text3)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Paket: <strong>{pendingOrder.planName ?? '-'}</strong> — {formatRupiah(pendingOrder.amount)}
                </p>
                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label" htmlFor="proof-file">
                    File bukti transfer (JPG, PNG, atau PDF, maks 5MB)
                  </label>
                  <input
                    id="proof-file"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    ref={fileInputRef}
                    disabled={uploading}
                    className="form-input"
                    style={{ paddingTop: '6px' }}
                  />
                </div>
                {uploadError && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '10px' }}>{uploadError}</p>}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={uploading}
                  onClick={() => void handleUpload(pendingOrder.id)}
                >
                  {uploading ? 'Mengunggah…' : 'Upload Bukti'}
                </button>
              </div>
            )}

            {/* Ada pending order + sudah ada bukti */}
            {pendingOrder && pendingOrder.proofKey && (
              <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text1)' }}>Menunggu Verifikasi</h2>
                <p style={{ color: 'var(--text3)', fontSize: '0.9rem', marginBottom: '4px' }}>
                  Paket: <strong>{pendingOrder.planName ?? '-'}</strong> — {formatRupiah(pendingOrder.amount)}
                </p>
                <p style={{ color: 'var(--text3)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Bukti sudah dikirim. Admin akan memverifikasi pembayaran Anda.
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={checking}
                  onClick={() => void handleCheckStatus()}
                >
                  {checking ? 'Memeriksa…' : 'Cek status'}
                </button>
              </div>
            )}

            {/* Tidak ada pending order — tampilkan plan picker */}
            {!pendingOrder && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text1)' }}>Pilih Paket</h2>
                {orderError && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '12px' }}>{orderError}</p>}
                {plans.length === 0 ? (
                  <p style={{ color: 'var(--text3)' }}>Belum ada paket tersedia. Hubungi admin.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                    {plans.map((plan) => (
                      <div key={plan.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text1)', margin: 0 }}>{plan.name}</p>
                        <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary, #6366f1)', margin: 0 }}>{formatRupiah(plan.price)}</p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text3)', margin: 0 }}>{plan.durationDays} hari</p>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text3)', margin: 0 }}>{plan.maxShops} toko · {plan.maxUsers} user</p>
                        {plan.features && plan.features.length > 0 && (
                          <ul style={{ fontSize: '0.8rem', color: 'var(--text3)', paddingLeft: '16px', margin: 0 }}>
                            {plan.features.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ marginTop: '8px' }}
                          disabled={creatingOrder}
                          onClick={() => void handleSelectPlan(plan.id)}
                        >
                          Pilih paket
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Riwayat order ── */}
        {orders.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text1)' }}>Riwayat Order</h2>
            <table className="platform-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Paket</th>
                  <th>Jumlah</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.planName ?? '-'}</td>
                    <td>{formatRupiah(o.amount)}</td>
                    <td><span className={statusBadge(o.status)}>{o.status}</span></td>
                    <td>{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
