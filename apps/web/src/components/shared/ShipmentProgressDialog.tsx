import { useState, useEffect, useCallback, useRef } from 'react';
import { Printer, X, Loader2, Truck, Package, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { openPrintDialog } from '../../utils/print';
import { getOrderErrorMessage } from '../../utils/label-errors';

/**
 * ShipmentProgressDialog — Unified dialog for shipping + tracking + label printing.
 *
 * Flow: Method Select → Ship Order (~2s) → Fetch Tracking (async) → Prefetch Label → Ready
 * User can "Lewati" (skip) at any time.
 */

type DialogStep = 'METHOD_SELECT' | 'SHIPPING' | 'FETCHING_TRACKING' | 'PREFETCHING_LABEL' | 'READY' | 'ERROR';

interface Props {
  isOpen: boolean;
  orderSn: string;
  onClose: () => void;
  onComplete: () => void;   // refetch order list
}

export function ShipmentProgressDialog({ isOpen, orderSn, onClose, onComplete }: Props) {
  const [step, setStep] = useState<DialogStep>('METHOD_SELECT');
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [labelFormat, setLabelFormat] = useState<'pdf' | 'png' | 'jpg'>('pdf');
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const toast = useToast();
  const abortRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('METHOD_SELECT');
      setTrackingNumber(null);
      setLabelUrl(null);
      setError(null);
      setPrinting(false);
      abortRef.current = false;
    }
  }, [isOpen]);

  const runShipmentFlow = useCallback(async (method: 'pickup' | 'dropoff') => {
    abortRef.current = false;

    // ── Step 1: Ship Order ──
    setStep('SHIPPING');
    try {
      const shipResult = await api.orderShip(orderSn, method);
      if (!shipResult.success) {
        throw new Error(shipResult.message || 'Gagal mengatur pengiriman');
      }
    } catch (err: any) {
      if (abortRef.current) return;
      setError(err.message || 'Gagal mengatur pengiriman');
      setStep('ERROR');
      return;
    }

    if (abortRef.current) return;

    // ── Step 2: Fetch Tracking Number (polling) ──
    setStep('FETCHING_TRACKING');
    let tracking: string | null = null;
    const maxAttempts = 8;

    for (let i = 0; i < maxAttempts; i++) {
      if (abortRef.current) return;
      try {
        const res = await api.orderFetchTrackingNumber(orderSn);
        if (res.success && res.data?.trackingNumber) {
          tracking = res.data.trackingNumber;
          setTrackingNumber(tracking);
          break;
        }
      } catch { /* ignore and retry */ }

      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    if (abortRef.current) return;

    if (!tracking) {
      // Tracking not found but ship was successful — still allow skip
      setTrackingNumber(null);
      setStep('READY');
      return;
    }

    // ── Step 3: Prefetch Label ──
    setStep('PREFETCHING_LABEL');
    try {
      const labelRes = await api.orderLabel(orderSn);
      if (labelRes.success && labelRes.data) {
        setLabelUrl(labelRes.data.url);
        setLabelFormat(labelRes.data.format);
      }
    } catch {
      // Label prefetch failed — still allow manual print later
    }

    if (abortRef.current) return;
    setStep('READY');
  }, [orderSn]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      if (labelUrl) {
        // Already prefetched — instant!
        openPrintDialog(labelUrl, labelFormat);
        toast(`Label berhasil dicetak untuk pesanan #${orderSn}`, 'success');
      } else {
        // Fallback: fetch now
        const result = await api.orderLabel(orderSn);
        if (result.success && result.data) {
          openPrintDialog(result.data.url, result.data.format);
          toast(`Label berhasil dicetak untuk pesanan #${orderSn}`, 'success');
        } else {
          throw new Error(result.message || 'Gagal mengambil label');
        }
      }
      onComplete();
      onClose();
    } catch (err: any) {
      toast(getOrderErrorMessage(orderSn, err), 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handleSkip = () => {
    abortRef.current = true;
    if (step !== 'METHOD_SELECT') {
      toast(`Pengiriman berhasil diatur untuk pesanan #${orderSn}`, 'success');
      onComplete();
    }
    onClose();
  };

  const handleRetry = () => {
    setError(null);
    setStep('METHOD_SELECT');
  };

  if (!isOpen) return null;

  const stepInfo: Record<DialogStep, { icon: React.ReactNode; title: string; desc: string }> = {
    METHOD_SELECT: { icon: <Truck size={20} />, title: 'Pilih Metode Pengiriman', desc: 'Pilih bagaimana pesanan akan dikirim:' },
    SHIPPING: { icon: <Loader2 size={20} className="spin" />, title: 'Memproses Pengiriman...', desc: 'Mengirim permintaan pengiriman ke Shopee' },
    FETCHING_TRACKING: { icon: <Loader2 size={20} className="spin" />, title: 'Mengambil Nomor Resi...', desc: 'Menunggu tracking number dari Shopee' },
    PREFETCHING_LABEL: { icon: <Loader2 size={20} className="spin" />, title: 'Menyiapkan Label...', desc: 'Mengunduh label pengiriman' },
    READY: { icon: <CheckCircle2 size={20} style={{ color: '#16A34A' }} />, title: 'Pengiriman Berhasil!', desc: trackingNumber ? 'Label siap dicetak' : 'Tracking number belum tersedia, bisa diambil nanti' },
    ERROR: { icon: <XCircle size={20} style={{ color: '#DC2626' }} />, title: 'Gagal Memproses', desc: error || '' },
  };

  const info = stepInfo[step];

  // Progress dots
  const progressSteps = ['SHIPPING', 'FETCHING_TRACKING', 'PREFETCHING_LABEL', 'READY'];
  const currentIdx = progressSteps.indexOf(step);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 24,
        maxWidth: 440, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--accent)' }}>{info.icon}</span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text1)' }}>{info.title}</h3>
          </div>
          <button onClick={handleSkip} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            display: 'flex', alignItems: 'center', color: 'var(--text3)',
          }} title="Tutup">
            <X size={20} />
          </button>
        </div>

        {/* Order SN */}
        <div style={{ fontSize: 12, color: 'var(--text4)', fontFamily: 'monospace', marginBottom: 12 }}>
          Pesanan #{orderSn}
        </div>

        {/* Progress bar (only show after method select) */}
        {step !== 'METHOD_SELECT' && step !== 'ERROR' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {progressSteps.map((s, i) => (
              <div key={s} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= currentIdx ? 'var(--accent)' : 'var(--bg3)',
                transition: 'background .3s ease',
              }} />
            ))}
          </div>
        )}

        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text3)', lineHeight: 1.5 }}>
          {info.desc}
        </p>

        {/* ── METHOD SELECT ── */}
        {step === 'METHOD_SELECT' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MethodButton
              emoji="🚚" label="Pickup" desc="Kurir akan mengambil paket dari alamat Anda"
              onClick={() => runShipmentFlow('pickup')}
            />
            <MethodButton
              emoji="📦" label="Dropoff" desc="Anda akan mengantar paket ke drop point"
              onClick={() => runShipmentFlow('dropoff')}
            />
          </div>
        )}

        {/* ── SHIPPING / FETCHING / PREFETCH ── */}
        {(step === 'SHIPPING' || step === 'FETCHING_TRACKING' || step === 'PREFETCHING_LABEL') && (
          <div style={{
            padding: 16, background: 'var(--bg2)', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4,
          }}>
            <Loader2 size={18} className="spin" style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              {step === 'SHIPPING' && 'Mengirim permintaan ke Shopee...'}
              {step === 'FETCHING_TRACKING' && 'Polling tracking number dari Shopee...'}
              {step === 'PREFETCHING_LABEL' && 'Mengunduh label pengiriman...'}
            </span>
          </div>
        )}

        {/* ── TRACKING NUMBER DISPLAY ── */}
        {trackingNumber && (step === 'READY' || step === 'PREFETCHING_LABEL') && (
          <div style={{
            margin: '12px 0', padding: 12, background: 'var(--bg2)',
            borderRadius: 6, border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 4 }}>Nomor Resi:</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', fontFamily: 'monospace' }}>
              {trackingNumber}
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'ERROR' && (
          <div style={{
            padding: 14, background: '#FEF2F2', borderRadius: 8,
            border: '1px solid #FECACA', marginBottom: 4,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: '#991B1B', lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* ── ACTIONS ── */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          {step === 'ERROR' && (
            <button onClick={handleRetry} style={btnStyle(false, false)}>Coba Lagi</button>
          )}
          {step !== 'METHOD_SELECT' && (
            <button onClick={handleSkip} disabled={printing} style={btnStyle(false, printing)}>
              Lewati
            </button>
          )}
          {step === 'METHOD_SELECT' && (
            <button onClick={handleSkip} style={btnStyle(false, false)}>Batal</button>
          )}
          {step === 'READY' && trackingNumber && (
            <button onClick={handlePrint} disabled={printing} style={btnStyle(true, printing)}>
              {printing ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
              Cetak Label
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Batch version ── */

interface BatchProps {
  isOpen: boolean;
  orderSns: string[];
  onClose: () => void;
  onComplete: () => void;
}

interface OrderProgress {
  orderSn: string;
  step: 'PENDING' | 'SHIPPING' | 'FETCHING_TRACKING' | 'READY' | 'ERROR';
  trackingNumber?: string;
  labelUrl?: string;
  labelFormat?: 'pdf' | 'png' | 'jpg';
  error?: string;
}

export function BatchShipmentProgressDialog({ isOpen, orderSns, onClose, onComplete }: BatchProps) {
  const [methodSelected, setMethodSelected] = useState(false);
  const [orders, setOrders] = useState<OrderProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const toast = useToast();
  const abortRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setMethodSelected(false);
      setOrders(orderSns.map(sn => ({ orderSn: sn, step: 'PENDING' })));
      setIsRunning(false);
      setPrinting(false);
      abortRef.current = false;
    }
  }, [isOpen, orderSns]);

  const updateOrder = (sn: string, update: Partial<OrderProgress>) => {
    setOrders(prev => prev.map(o => o.orderSn === sn ? { ...o, ...update } : o));
  };

  const runBatchFlow = useCallback(async (method: 'pickup' | 'dropoff') => {
    setMethodSelected(true);
    setIsRunning(true);
    abortRef.current = false;

    // Ship orders sequentially (avoid rate limit)
    for (const sn of orderSns) {
      if (abortRef.current) break;

      updateOrder(sn, { step: 'SHIPPING' });

      try {
        const result = await api.orderShip(sn, method);
        if (!result.success) {
          updateOrder(sn, { step: 'ERROR', error: result.message || 'Gagal' });
          continue;
        }
        updateOrder(sn, { step: 'FETCHING_TRACKING' });
      } catch (err: any) {
        updateOrder(sn, { step: 'ERROR', error: err.message || 'Network error' });
        continue;
      }

      // Small delay between ship calls
      if (orderSns.indexOf(sn) < orderSns.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (abortRef.current) { setIsRunning(false); return; }

    // Fetch tracking numbers in parallel for all successfully shipped orders
    const shippedSns = orderSns.filter(sn => {
      const o = orders.find(x => x.orderSn === sn);
      // Check current state from the latest closure - we need to use a ref or just check not ERROR
      return true; // We'll handle inside
    });

    await Promise.all(orderSns.map(async (sn) => {
      // Get current state
      const currentOrders = await new Promise<OrderProgress[]>(resolve => {
        setOrders(prev => { resolve(prev); return prev; });
      });
      const order = currentOrders.find(o => o.orderSn === sn);
      if (!order || order.step === 'ERROR' || order.step === 'PENDING') return;

      // Poll for tracking number
      for (let i = 0; i < 6; i++) {
        if (abortRef.current) return;
        try {
          const res = await api.orderFetchTrackingNumber(sn);
          if (res.success && res.data?.trackingNumber) {
            updateOrder(sn, { step: 'READY', trackingNumber: res.data.trackingNumber });

            // Prefetch label
            try {
              const labelRes = await api.orderLabel(sn);
              if (labelRes.success && labelRes.data) {
                updateOrder(sn, { labelUrl: labelRes.data.url, labelFormat: labelRes.data.format });
              }
            } catch { /* ok */ }
            return;
          }
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 3000));
      }

      // Timeout — still mark as ready without tracking
      updateOrder(sn, { step: 'READY' });
    }));

    setIsRunning(false);
  }, [orderSns]);

  const handlePrintAll = async () => {
    setPrinting(true);
    try {
      const readyOrders = orders.filter(o => o.step === 'READY' && o.trackingNumber);
      if (readyOrders.length === 0) {
        toast('Tidak ada pesanan yang siap dicetak', 'error');
        return;
      }

      // Split: orders with locally prefetched labels vs. ones that need API
      const withLabel = readyOrders.filter(o => o.labelUrl);
      const needFetch = readyOrders.filter(o => !o.labelUrl);
      
      let allLabels: { orderSn: string; url: string }[] = withLabel.map(o => ({
        orderSn: o.orderSn, url: o.labelUrl!,
      }));

      // Fetch any missing labels from backend (should be fast — cache hit)
      if (needFetch.length > 0) {
        try {
          const batchResult = await api.orderLabelsBatch(needFetch.map(o => o.orderSn));
          if (batchResult.success && batchResult.data) {
            for (const r of batchResult.data.results) {
              if (r.success && r.url) {
                allLabels.push({ orderSn: r.orderSn, url: r.url });
              }
            }
          }
        } catch { /* continue with whatever we have */ }
      }

      if (allLabels.length > 0) {
        const { openPDFsInSingleTab } = await import('../../utils/pdf-merge');
        await openPDFsInSingleTab(
          allLabels.map(l => l.url),
          allLabels.map(l => l.orderSn)
        );
        toast(`Membuka ${allLabels.length} label`, 'success');
        onComplete();
        onClose();
      } else {
        toast('Tidak ada label yang berhasil diambil', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Gagal mencetak label', 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handleSkip = () => {
    abortRef.current = true;
    const shipped = orders.filter(o => o.step !== 'PENDING' && o.step !== 'ERROR').length;
    if (shipped > 0 || methodSelected) {
      toast(`Pengiriman diproses untuk ${shipped} pesanan`, 'success');
      onComplete();
    }
    onClose();
  };

  if (!isOpen) return null;

  const readyCount = orders.filter(o => o.step === 'READY' && o.trackingNumber).length;
  const errorCount = orders.filter(o => o.step === 'ERROR').length;
  const doneCount = orders.filter(o => o.step === 'READY').length;
  const totalShipped = orders.filter(o => o.step !== 'PENDING' && o.step !== 'ERROR').length;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 24,
        maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text1)' }}>
            {!methodSelected ? 'Atur Pengiriman Batch' :
             isRunning ? 'Memproses Pengiriman...' :
             `Batch Selesai — ${doneCount}/${orderSns.length}`}
          </h3>
          <button onClick={handleSkip} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            display: 'flex', alignItems: 'center', color: 'var(--text3)',
          }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text3)' }}>
          {!methodSelected
            ? `${orderSns.length} pesanan akan diproses. Pilih metode pengiriman:`
            : isRunning
            ? 'Sedang memproses...'
            : `${doneCount - errorCount} berhasil, ${errorCount} gagal`}
        </p>

        {/* Method select */}
        {!methodSelected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MethodButton emoji="🚚" label="Pickup" desc="Kurir mengambil dari alamat Anda" onClick={() => runBatchFlow('pickup')} />
            <MethodButton emoji="📦" label="Dropoff" desc="Anda antar ke drop point" onClick={() => runBatchFlow('dropoff')} />
          </div>
        )}

        {/* Order progress list */}
        {methodSelected && (
          <div style={{ maxHeight: 320, overflow: 'auto', marginBottom: 16 }}>
            {orders.map(o => (
              <div key={o.orderSn} style={{
                padding: '10px 12px', background: 'var(--bg2)', borderRadius: 6,
                border: '1px solid var(--border)', marginBottom: 6,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text4)' }}>#{o.orderSn}</div>
                  {o.trackingNumber && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', fontFamily: 'monospace', marginTop: 2 }}>
                      {o.trackingNumber}
                    </div>
                  )}
                  {o.error && (
                    <div style={{ fontSize: 12, color: '#DC2626', marginTop: 2 }}>{o.error}</div>
                  )}
                </div>
                <div>
                  {o.step === 'PENDING' && <span style={{ fontSize: 11, color: 'var(--text4)' }}>Menunggu</span>}
                  {(o.step === 'SHIPPING' || o.step === 'FETCHING_TRACKING') && (
                    <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />
                  )}
                  {o.step === 'READY' && o.trackingNumber && <CheckCircle2 size={14} style={{ color: '#16A34A' }} />}
                  {o.step === 'READY' && !o.trackingNumber && <CheckCircle2 size={14} style={{ color: '#F59E0B' }} />}
                  {o.step === 'ERROR' && <XCircle size={14} style={{ color: '#DC2626' }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {methodSelected && !isRunning && (
          <div style={{
            padding: 12, background: 'var(--bg2)', borderRadius: 6,
            border: '1px solid var(--border)', display: 'flex', gap: 20,
            justifyContent: 'center', marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A' }}>{readyCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text4)' }}>Siap Cetak</div>
            </div>
            {errorCount > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#DC2626' }}>{errorCount}</div>
                <div style={{ fontSize: 11, color: 'var(--text4)' }}>Gagal</div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: methodSelected ? 0 : 16 }}>
          <button onClick={handleSkip} disabled={printing} style={btnStyle(false, printing)}>
            {methodSelected ? 'Lewati' : 'Batal'}
          </button>
          {methodSelected && readyCount > 0 && !isRunning && (
            <button onClick={handlePrintAll} disabled={printing} style={btnStyle(true, printing)}>
              {printing ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
              Cetak Label ({readyCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared UI helpers ── */

function MethodButton({ emoji, label, desc, onClick }: { emoji: string; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)',
        fontSize: 14, fontWeight: 500, cursor: 'pointer', background: 'var(--bg2)',
        color: 'var(--text1)', textAlign: 'left', transition: 'all .15s', display: 'block', width: '100%',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--accent)';
        e.currentTarget.style.color = 'var(--accent-f)';
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg2)';
        e.currentTarget.style.color = 'var(--text1)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{emoji} {label}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{desc}</div>
    </button>
  );
}

function btnStyle(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', borderRadius: 6,
    border: primary ? 'none' : '1px solid var(--border)',
    fontSize: 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'var(--bg3)' : primary ? 'var(--accent)' : 'var(--bg2)',
    color: disabled ? 'var(--text4)' : primary ? 'var(--accent-f)' : 'var(--text2)',
    display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center',
    transition: 'all .15s', opacity: disabled ? 0.6 : 1,
  };
}
