/**
 * PlatformOrders — halaman antrian order langganan global (portal Super Admin).
 *
 * Fitur: filter status, preview bukti (modal), approve (konfirmasi), reject (alasan).
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import {
  platformOrderApi,
  type PlatformOrder,
  type PlatformOrderStatus,
  PlatformApiError,
} from '../../lib/platformApi';

const formatRupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadgeClass(status: PlatformOrderStatus): string {
  const map: Record<PlatformOrderStatus, string> = {
    pending: 'badge badge--pending',
    approved: 'badge badge--active',
    rejected: 'badge badge--inactive',
  };
  return map[status] ?? 'badge';
}

type FilterValue = PlatformOrderStatus | '';

const FILTER_OPTIONS: { label: string; value: FilterValue }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Semua', value: '' },
];

export function PlatformOrders() {
  const toast = useToast();
  const [filter, setFilter] = useState<FilterValue>('pending');
  const [orders, setOrders] = useState<PlatformOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Proof preview modal
  const [proofOrder, setProofOrder] = useState<PlatformOrder | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  // Approve modal
  const [approveTarget, setApproveTarget] = useState<PlatformOrder | null>(null);
  const [approving, setApproving] = useState(false);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<PlatformOrder | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (status: FilterValue) => {
    setOrders(null);
    setLoadError(null);
    try {
      const res = await platformOrderApi.list(status || undefined);
      setOrders(res.orders);
    } catch {
      setLoadError('Gagal memuat daftar order.');
    }
  }, []);

  useEffect(() => {
    void fetchOrders(filter);
  }, [filter, fetchOrders]);

  async function handleOpenProof(order: PlatformOrder) {
    setProofOrder(order);
    setProofUrl(null);
    setProofError(null);
    setProofLoading(true);
    try {
      const res = await platformOrderApi.proofUrl(order.id);
      setProofUrl(res.url);
    } catch (err) {
      if (err instanceof PlatformApiError) {
        if (err.status === 404) setProofError('Tenant belum upload bukti transfer.');
        else if (err.status === 503) setProofError('Storage belum dikonfigurasi. Hubungi developer.');
        else setProofError('Gagal memuat bukti transfer.');
      } else {
        setProofError('Gagal memuat bukti transfer.');
      }
    } finally {
      setProofLoading(false);
    }
  }

  function isImage(key: string | null): boolean {
    if (!key) return false;
    return /\.(jpg|jpeg|png)$/i.test(key);
  }

  async function handleApprove() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await platformOrderApi.approve(approveTarget.id);
      toast('Order berhasil di-approve. Langganan company telah aktif.', 'success');
      setApproveTarget(null);
      void fetchOrders(filter);
    } catch (err) {
      if (err instanceof PlatformApiError) {
        toast(err.message || 'Gagal approve order.', 'error');
      } else {
        toast('Gagal approve order.', 'error');
      }
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      setRejectError('Alasan reject wajib diisi.');
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      await platformOrderApi.reject(rejectTarget.id, rejectNote.trim());
      toast('Order berhasil di-reject.', 'success');
      setRejectTarget(null);
      setRejectNote('');
      void fetchOrders(filter);
    } catch (err) {
      if (err instanceof PlatformApiError) {
        if (err.status === 400) {
          setRejectError(err.message || 'Alasan reject wajib diisi.');
        } else {
          setRejectError(err.message || 'Gagal reject order.');
        }
      } else {
        setRejectError('Gagal reject order.');
      }
    } finally {
      setRejecting(false);
    }
  }

  return (
    <section className="platform-orders">
      <h1>Order Langganan</h1>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`btn${filter === opt.value ? ' btn-primary' : ''}`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loadError && <p className="platform-error">{loadError}</p>}
      {orders === null && !loadError && <p className="platform-loading">Memuat…</p>}

      {orders !== null && orders.length === 0 && (
        <p className="platform-empty">Tidak ada order{filter ? ` dengan status ${filter}` : ''}.</p>
      )}

      {orders !== null && orders.length > 0 && (
        <table className="platform-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Plan</th>
              <th>Nominal</th>
              <th>Tanggal</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.companyName ?? '-'}</td>
                <td>{o.planName ?? '-'}</td>
                <td>{formatRupiah(o.amount)}</td>
                <td>{formatDate(o.createdAt)}</td>
                <td>
                  <span className={statusBadgeClass(o.status)}>{o.status}</span>
                  {o.status === 'rejected' && o.note && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '4px' }}>
                      {o.note}
                    </div>
                  )}
                  {(o.status === 'approved' || o.status === 'rejected') && o.reviewedAt && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                      {formatDate(o.reviewedAt)}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {o.proofKey && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void handleOpenProof(o)}
                      >
                        Lihat bukti
                      </button>
                    )}
                    {o.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setApproveTarget(o)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => { setRejectTarget(o); setRejectNote(''); setRejectError(null); }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal: Preview Bukti */}
      <Modal
        open={proofOrder !== null}
        onClose={() => { setProofOrder(null); setProofUrl(null); setProofError(null); }}
        title="Bukti Transfer"
        footer={
          <button className="btn btn-ghost btn-sm" onClick={() => { setProofOrder(null); setProofUrl(null); setProofError(null); }}>
            Tutup
          </button>
        }
      >
        {proofLoading && <p className="platform-loading">Memuat bukti…</p>}
        {proofError && <p className="platform-error">{proofError}</p>}
        {proofUrl && proofOrder && (
          isImage(proofOrder.proofKey) ? (
            <img
              src={proofUrl}
              alt="Bukti transfer"
              style={{ maxWidth: '100%', borderRadius: '4px' }}
            />
          ) : (
            <div>
              <embed
                src={proofUrl}
                type="application/pdf"
                style={{ width: '100%', height: '480px', borderRadius: '4px' }}
              />
              <p style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                  Buka PDF di tab baru ↗
                </a>
              </p>
            </div>
          )
        )}
      </Modal>

      {/* Modal: Approve */}
      <Modal
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        title="Approve Order"
        footer={
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={approving}
              onClick={() => void handleApprove()}
            >
              {approving ? 'Memproses…' : 'Ya, Approve'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setApproveTarget(null)}
              disabled={approving}
            >
              Batal
            </button>
          </>
        }
      >
        {approveTarget && (
          <p>
            Approve order <strong>{approveTarget.companyName ?? `#${approveTarget.id}`}</strong> paket{' '}
            <strong>{approveTarget.planName ?? '-'}</strong>?{' '}
            Langganan company akan langsung aktif.
          </p>
        )}
      </Modal>

      {/* Modal: Reject */}
      <Modal
        open={rejectTarget !== null}
        onClose={() => { setRejectTarget(null); setRejectNote(''); setRejectError(null); }}
        title="Reject Order"
        footer={
          <>
            <button
              type="button"
              className="btn"
              disabled={rejecting || !rejectNote.trim()}
              onClick={() => void handleReject()}
            >
              {rejecting ? 'Memproses…' : 'Reject'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setRejectTarget(null); setRejectNote(''); setRejectError(null); }}
              disabled={rejecting}
            >
              Batal
            </button>
          </>
        }
      >
        {rejectTarget && (
          <div>
            <p style={{ marginBottom: '12px' }}>
              Reject order <strong>{rejectTarget.companyName ?? `#${rejectTarget.id}`}</strong>?
            </p>
            <label className="form-label" htmlFor="reject-note">Alasan reject (wajib)</label>
            <textarea
              id="reject-note"
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              disabled={rejecting}
              placeholder="Tuliskan alasan penolakan…"
              style={{ display: 'block', width: '100%', marginTop: '6px' }}
            />
            {rejectError && (
              <p style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '6px' }}>
                {rejectError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
