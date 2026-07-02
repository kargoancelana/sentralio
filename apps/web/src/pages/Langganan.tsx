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
import { api, ApiError, type PaymentInfo, type SubscriptionOrder, type SubscriptionPlan, type SubscriptionStatus } from '../lib/api';
import { ImpersonationNotice } from '../components/impersonation/ImpersonationNotice';

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
  const { state, logout, refreshMe } = useAuth();
  const navigate = useNavigate();

  // Check if this is an impersonation session (Fase 7.2).
  const isImpersonating =
    state.status === 'authenticated' && state.user.impersonatorId !== null;

  const [loading, setLoading] = useState(true);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [orders, setOrders] = useState<SubscriptionOrder[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create order state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponValid, setCouponValid] = useState<boolean | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponFinalAmount, setCouponFinalAmount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  // Checking status
  const [checking, setChecking] = useState(false);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, ordersRes, plansRes, paymentRes] = await Promise.all([
        api.subscriptionStatus().catch(() => null),
        api.subscriptionOrders().catch(() => ({ ok: true, orders: [] as SubscriptionOrder[] })),
        api.subscriptionPlans().catch(() => ({ ok: true, plans: [] as SubscriptionPlan[] })),
        api.subscriptionPaymentInfo().catch(() => null),
      ]);
      if (statusRes) setSubStatus(statusRes);
      setOrders((ordersRes as any).orders ?? []);
      setPlans((plansRes as any).plans ?? []);
      setPaymentInfo(paymentRes ? ((paymentRes as any).paymentInfo ?? null) : null);
    } catch {
      setError('Gagal memuat data langganan.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  async function handleValidateCoupon(planId: number, code: string) {
    if (!code.trim()) {
      setCouponValid(null);
      setCouponMessage('');
      return;
    }
    
    setValidatingCoupon(true);
    setCouponValid(null);
    setCouponMessage('');
    try {
      const res = await api.subscriptionValidateCoupon(planId, code.trim());
      if (res.valid) {
        setCouponValid(true);
        setCouponDiscount(res.discountAmount ?? 0);
        setCouponFinalAmount(res.finalAmount ?? 0);
        setCouponMessage('Kupon valid!');
      } else {
        setCouponValid(false);
        setCouponDiscount(0);
        setCouponFinalAmount(0);
        const reasonMap: Record<string, string> = {
          not_found: 'Kode kupon tidak ditemukan',
          inactive: 'Kupon tidak aktif',
          expired: 'Kupon sudah kadaluarsa',
          not_started: 'Kupon belum berlaku',
          max_uses_reached: 'Kupon sudah mencapai batas penggunaan',
          plan_mismatch: 'Kupon tidak berlaku untuk paket ini',
        };
        setCouponMessage(res.reason ? reasonMap[res.reason] ?? res.message ?? 'Kupon tidak valid' : res.message ?? 'Kupon tidak valid');
      }
    } catch {
      setCouponValid(false);
      setCouponMessage('Gagal memvalidasi kupon');
    } finally {
      setValidatingCoupon(false);
    }
  }

  async function handleSelectPlan(planId: number, withCoupon = false) {
    setCreatingOrder(true);
    setOrderError(null);
    try {
      const coupon = withCoupon && couponCode.trim() ? couponCode.trim() : undefined;
      await api.subscriptionCreateOrder(planId, coupon);
      await fetchAll();
      // Reset coupon state
      setCouponCode('');
      setCouponValid(null);
      setSelectedPlanId(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          await fetchAll();
        } else if (err.status === 404) {
          setOrderError('Paket tidak ditemukan.');
        } else if (err.status === 400) {
          // Display backend error message directly for all 400 errors
          setOrderError(err.message);
        } else {
          setOrderError('Terjadi kesalahan, coba lagi.');
        }
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
            {/* Fase 7.2: Show notice during impersonation */}
            {isImpersonating && (
              <ImpersonationNotice message="Anda tidak dapat membuat order atau mengubah langganan selama mode impersonation aktif." />
            )}

            {/* Info pembayaran (rekening tujuan transfer) */}
            {paymentInfo && (paymentInfo.bankName || paymentInfo.accountNumber || paymentInfo.instructions) && (
              <div className="card" style={{ marginBottom: 16 }}>
                <h2 style={{ marginTop: 0 }}>Info Pembayaran</h2>
                {paymentInfo.bankName && <p>Bank: <strong>{paymentInfo.bankName}</strong></p>}
                {paymentInfo.accountNumber && <p>No. Rekening: <strong>{paymentInfo.accountNumber}</strong></p>}
                {paymentInfo.accountHolder && <p>Atas Nama: <strong>{paymentInfo.accountHolder}</strong></p>}
                {paymentInfo.instructions && <p style={{ whiteSpace: 'pre-wrap' }}>{paymentInfo.instructions}</p>}
                {paymentInfo.note && <p style={{ whiteSpace: 'pre-wrap' }}><em>{paymentInfo.note}</em></p>}
                {paymentInfo.supportContact && <p>Bantuan: {paymentInfo.supportContact}</p>}
              </div>
            )}
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
                    disabled={uploading || isImpersonating}
                    className="form-input"
                    style={{ paddingTop: '6px' }}
                  />
                </div>
                {uploadError && <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginBottom: '10px' }}>{uploadError}</p>}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={uploading || isImpersonating}
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
                
                {/* Coupon input section */}
                {selectedPlanId && (
                  <div className="card" style={{ padding: '20px', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text1)' }}>Punya Kode Kupon?</h3>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Masukkan kode kupon"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          // Reset validation state when user edits
                          setCouponValid(null);
                          setCouponMessage('');
                        }}
                        disabled={validatingCoupon || creatingOrder}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={!couponCode.trim() || validatingCoupon || creatingOrder}
                        onClick={() => void handleValidateCoupon(selectedPlanId, couponCode)}
                      >
                        {validatingCoupon ? 'Cek...' : 'Terapkan'}
                      </button>
                    </div>
                    {couponMessage && (
                      <p style={{ fontSize: '0.85rem', margin: 0, color: couponValid ? 'var(--success, #22c55e)' : 'var(--error)' }}>
                        {couponMessage}
                      </p>
                    )}
                    {couponValid && (
                      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'var(--bg3)', borderRadius: '4px' }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text2)' }}>
                          Harga asli: <span style={{ textDecoration: 'line-through' }}>{formatRupiah(plans.find(p => p.id === selectedPlanId)?.price ?? 0)}</span>
                        </p>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success, #22c55e)' }}>
                          Diskon: -{formatRupiah(couponDiscount)}
                        </p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text1)' }}>
                          Total: {formatRupiah(couponFinalAmount)}
                        </p>
                      </div>
                    )}
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setSelectedPlanId(null);
                          setCouponCode('');
                          setCouponValid(null);
                          setCouponMessage('');
                        }}
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={creatingOrder || isImpersonating || (couponCode.trim() !== '' && !couponValid)}
                        onClick={() => void handleSelectPlan(selectedPlanId, couponValid === true)}
                        style={{ flex: 1 }}
                      >
                        {creatingOrder ? 'Memproses...' : 'Konfirmasi Order'}
                      </button>
                    </div>
                  </div>
                )}

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
                          disabled={creatingOrder || isImpersonating || selectedPlanId !== null}
                          onClick={() => setSelectedPlanId(plan.id)}
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
