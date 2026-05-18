import { useState, useEffect, useCallback, useRef } from 'react';
import { Printer, X, Loader2, Truck, Package, CheckCircle2, XCircle, ChevronDown, Palette, FileText } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { printCustomLabels, printOfficialLabels } from '../../utils/printLabel';
import { getOrderErrorMessage } from '../../utils/label-errors';
import type { LabelData } from '../../types/label';

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
  const [labelData, setLabelData] = useState<LabelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const toast = useToast();
  const abortRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('METHOD_SELECT');
      setTrackingNumber(null);
      setLabelData(null);
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
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (abortRef.current) return;

    if (!tracking) {
      // Tracking not found but ship was successful — still allow skip
      setTrackingNumber(null);
      setStep('READY');
      return;
    }

    // ── Step 3: Prefetch Label Data ──
    setStep('PREFETCHING_LABEL');
    try {
      const labelRes = await api.orderLabelData(orderSn);
      if (labelRes.success && labelRes.data) {
        setLabelData(labelRes.data);
      }
    } catch {
      // Label prefetch failed — still allow manual print later
    }

    if (abortRef.current) return;
    setStep('READY');
  }, [orderSn]);

  const handlePrint = async () => {
    setPrinting(true);
    setShowLabelMenu(false);
    try {
      let data = labelData;
      if (!data) {
        // Fallback: fetch now
        const result = await api.orderLabelData(orderSn);
        if (result.success && result.data) {
          data = result.data;
        } else {
          throw new Error((result as any).error || 'Gagal mengambil label');
        }
      }
      await printCustomLabels(data, () => {
        toast(`Label custom dibuka di tab baru untuk pesanan #${orderSn}`, 'success');
        onComplete();
        onClose();
      });
    } catch (err: any) {
      toast(getOrderErrorMessage(orderSn, err), 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintOfficial = async () => {
    setPrinting(true);
    setShowLabelMenu(false);
    try {
      const result = await api.orderShippingLabel(orderSn);
      if (result.success && result.data?.url) {
        await printOfficialLabels(result.data.url, orderSn, () => {
          toast(`Label asli dibuka di tab baru untuk pesanan #${orderSn}`, 'success');
          onComplete();
          onClose();
        });
      } else {
        throw new Error((result as any).error || 'Gagal mengambil label resmi');
      }
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
    READY: { icon: <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />, title: 'Pengiriman Berhasil!', desc: trackingNumber ? 'Label siap dicetak' : 'Tracking number belum tersedia, bisa diambil nanti' },
    ERROR: { icon: <XCircle size={20} style={{ color: 'var(--error)' }} />, title: 'Gagal Memproses', desc: error || '' },
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
              label="Pickup" desc="Kurir akan mengambil paket dari alamat Anda"
              onClick={() => runShipmentFlow('pickup')}
            />
            <MethodButton
              label="Dropoff" desc="Anda akan mengantar paket ke drop point"
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
            padding: 14, background: 'var(--bg2)', borderRadius: 8,
            border: '1px solid var(--border)', marginBottom: 4,
          }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--error)', lineHeight: 1.5 }}>{error}</p>
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
            <div style={{ position: 'relative', display: 'inline-block' }}
              onMouseEnter={() => setShowLabelMenu(true)}
              onMouseLeave={() => setShowLabelMenu(false)}
            >
              <button onClick={() => { setShowLabelMenu(false); handlePrint(); }} disabled={printing} style={btnStyle(true, printing)}>
                {printing ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
                Cetak Label
                <ChevronDown size={11} style={{ opacity: 0.6, marginLeft: 2 }} />
              </button>
              {showLabelMenu && !printing && (
                <div style={{
                  position: 'absolute', bottom: '100%', right: 0,
                  marginBottom: 4, background: 'var(--bg1, #fff)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  minWidth: 170, overflow: 'hidden', zIndex: 9999,
                }}>
                  <button onClick={() => { setShowLabelMenu(false); handlePrint(); }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Palette size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div>
                      <div>Label Custom</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>Ada info item & SKU</div>
                    </div>
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />
                  <button onClick={handlePrintOfficial} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <FileText size={14} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
                    <div>
                      <div>Label Asli</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>PDF resmi dari Shopee</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
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
  labelData?: LabelData;
  error?: string;
}

export function BatchShipmentProgressDialog({ isOpen, orderSns, onClose, onComplete }: BatchProps) {
  const [methodSelected, setMethodSelected] = useState(false);
  const [orders, setOrders] = useState<OrderProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const toast = useToast();
  const abortRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setMethodSelected(false);
      setOrders(orderSns.map(sn => ({ orderSn: sn, step: 'PENDING' })));
      setIsRunning(false);
      setPrinting(false);
      setCurrentChunk(0);
      setTotalChunks(0);
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

    // Split into chunks of 500 orders
    const CHUNK_SIZE = 500;
    const chunks: string[][] = [];
    for (let i = 0; i < orderSns.length; i += CHUNK_SIZE) {
      chunks.push(orderSns.slice(i, i + CHUNK_SIZE));
    }
    
    setTotalChunks(chunks.length);

    // Process chunks sequentially
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      if (abortRef.current) break;
      
      setCurrentChunk(chunkIdx + 1);
      const chunk = chunks[chunkIdx];

      // Call batch API for this chunk
      try {
        const batchResult = await api.orderShipBatch(chunk, method);
        
        if (batchResult.success && batchResult.data) {
          const { results } = batchResult.data;
          
          // Update order states based on batch results
          // Backend already fetches tracking numbers in batch!
          const readyOrderSns: string[] = [];
          for (const result of results) {
            if (result.success) {
              // If tracking number is available from batch API, use it directly
              if (result.trackingNumber) {
                updateOrder(result.orderSn, { 
                  step: 'READY', 
                  trackingNumber: result.trackingNumber 
                });
                readyOrderSns.push(result.orderSn);
              } else {
                // No tracking number yet, mark as FETCHING_TRACKING for polling
                updateOrder(result.orderSn, { step: 'FETCHING_TRACKING' });
              }
            } else {
              updateOrder(result.orderSn, { step: 'ERROR', error: result.error || 'Gagal' });
            }
          }

          // Batch prefetch label data for all ready orders (non-blocking)
          if (readyOrderSns.length > 0) {
            api.orderLabelDataBatch(readyOrderSns)
              .then(batchLabelRes => {
                if (batchLabelRes.success && batchLabelRes.data) {
                  for (const r of batchLabelRes.data.results) {
                    if (r.success && r.data) {
                      updateOrder(r.orderSn, { labelData: r.data });
                    }
                  }
                }
              })
              .catch(() => { /* ok — labels can be fetched later */ });
          }
        } else {
          // If batch API fails, mark all orders in chunk as error
          for (const sn of chunk) {
            updateOrder(sn, { step: 'ERROR', error: 'Batch API gagal' });
          }
        }
      } catch (err: any) {
        // Network error - mark all orders in chunk as error
        for (const sn of chunk) {
          updateOrder(sn, { step: 'ERROR', error: err.message || 'Network error' });
        }
      }

      // Delay between chunks (300ms to respect rate limits)
      if (chunkIdx < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (abortRef.current) { setIsRunning(false); return; }

    // Only poll for orders that don't have tracking numbers yet
    // This should be rare since backend fetches them in batch
    const ordersNeedingTracking = await new Promise<OrderProgress[]>(resolve => {
      setOrders(prev => { 
        resolve(prev.filter(o => o.step === 'FETCHING_TRACKING')); 
        return prev; 
      });
    });

    if (ordersNeedingTracking.length > 0) {
      console.log(`[BatchShipment] Polling ${ordersNeedingTracking.length} orders without tracking numbers`);
      
      // Poll for remaining tracking numbers (reduced attempts: 2 × 2s = 4s max)
      await Promise.all(ordersNeedingTracking.map(async (order) => {
        for (let i = 0; i < 2; i++) {
          if (abortRef.current) return;
          try {
            const res = await api.orderFetchTrackingNumber(order.orderSn);
            if (res.success && res.data?.trackingNumber) {
              updateOrder(order.orderSn, { step: 'READY', trackingNumber: res.data.trackingNumber });

              // Prefetch label data
              try {
                const labelRes = await api.orderLabelData(order.orderSn);
                if (labelRes.success && labelRes.data) {
                  updateOrder(order.orderSn, { labelData: labelRes.data });
                }
              } catch { /* ok */ }
              return; // Early exit on success
            }
          } catch { /* retry */ }
          
          // Only delay if not last attempt
          if (i < 1) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        // Timeout — still mark as ready without tracking
        updateOrder(order.orderSn, { step: 'READY' });
      }));
    }

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

      // Collect prefetched label data
      const withData = readyOrders.filter(o => o.labelData);
      const needFetch = readyOrders.filter(o => !o.labelData);
      const allLabelData: LabelData[] = withData.map(o => o.labelData!);

      // Fetch any missing labels
      if (needFetch.length > 0) {
        try {
          const batchResult = await api.orderLabelDataBatch(needFetch.map(o => o.orderSn));
          if (batchResult.success && batchResult.data) {
            for (const r of batchResult.data.results) {
              if (r.success && r.data) {
                allLabelData.push(r.data);
              }
            }
          }
        } catch { /* continue with whatever we have */ }
      }

      if (allLabelData.length > 0) {
        // Open in new tab — same flow as single
        await printCustomLabels(allLabelData, () => {
          toast(`${allLabelData.length} label custom dibuka di tab baru`, 'success');
          onComplete();
          onClose();
        });
      } else {
        toast('Tidak ada label yang berhasil diambil', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Gagal mencetak label', 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintAllOfficial = async () => {
    setPrinting(true);
    try {
      const readyOrders = orders.filter(o => o.step === 'READY' && o.trackingNumber);
      if (readyOrders.length === 0) {
        toast('Tidak ada pesanan yang siap dicetak', 'error');
        setPrinting(false);
        return;
      }

      // Use optimized batch endpoint
      const orderSnList = readyOrders.map(o => o.orderSn);
      const result = await api.orderShippingLabelBatch(orderSnList);

      if (result.success && (result.data?.url || result.data?.urls)) {
        const urls = result.data.urls || (result.data.url ? [result.data.url] : []);
        await printOfficialLabels(urls, orderSnList, () => {
          toast(`${orderSnList.length} label asli dibuka di tab baru`, 'success');
          onComplete();
          onClose();
        });

        if (result.data.failedOrders && result.data.failedOrders.length > 0) {
          toast(`${result.data.failedOrders.length} order gagal diambil labelnya`, 'warn');
        }
      } else {
        toast((result as any).error || 'Tidak ada label resmi yang berhasil diambil', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Gagal mencetak label resmi', 'error');
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
  const shippingCount = orders.filter(o => o.step === 'SHIPPING').length;
  const trackingCount = orders.filter(o => o.step === 'FETCHING_TRACKING').length;

  // Determine batch-level step for progress bar (same as single dialog)
  type BatchStep = 'METHOD_SELECT' | 'SHIPPING' | 'FETCHING_TRACKING' | 'READY' | 'ERROR';
  let batchStep: BatchStep = 'METHOD_SELECT';
  if (!methodSelected) batchStep = 'METHOD_SELECT';
  else if (shippingCount > 0) batchStep = 'SHIPPING';
  else if (trackingCount > 0 || (isRunning && doneCount < orderSns.length)) batchStep = 'FETCHING_TRACKING';
  else if (!isRunning) batchStep = 'READY';

  const progressSteps = ['SHIPPING', 'FETCHING_TRACKING', 'READY'];
  const currentIdx = progressSteps.indexOf(batchStep);

  // Step info — same structure as single dialog
  const batchStepInfo: Record<string, { icon: React.ReactNode; title: string; desc: string }> = {
    METHOD_SELECT: { icon: <Truck size={20} />, title: 'Atur Pengiriman Batch', desc: `${orderSns.length} pesanan akan diproses. Pilih metode pengiriman:` },
    SHIPPING: { icon: <Loader2 size={20} className="spin" />, title: 'Memproses Pengiriman...', desc: `Mengirim ${orderSns.length} pesanan ke Shopee` },
    FETCHING_TRACKING: { icon: <Loader2 size={20} className="spin" />, title: 'Mengambil Nomor Resi...', desc: 'Menunggu tracking number dari Shopee' },
    READY: { icon: <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />, title: `Batch Selesai`, desc: `${doneCount - errorCount} berhasil${errorCount > 0 ? `, ${errorCount} gagal` : ''}` },
    ERROR: { icon: <XCircle size={20} style={{ color: 'var(--error)' }} />, title: 'Gagal Memproses', desc: '' },
  };
  const info = batchStepInfo[batchStep];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 24,
        maxWidth: 500, width: '100%', maxHeight: '80vh',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header — same as single */}
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

        {/* Batch count badge */}
        <div style={{ fontSize: 12, color: 'var(--text4)', marginBottom: 12 }}>
          {orderSns.length} pesanan dipilih
        </div>

        {/* Progress bar — same as single */}
        {methodSelected && (
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

        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text3)', lineHeight: 1.5 }}>
          {info.desc}
        </p>

        {/* ── METHOD SELECT ── */}
        {!methodSelected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MethodButton label="Pickup" desc="Kurir mengambil dari alamat Anda" onClick={() => runBatchFlow('pickup')} />
            <MethodButton label="Dropoff" desc="Anda antar ke drop point" onClick={() => runBatchFlow('dropoff')} />
          </div>
        )}

        {/* ── LOADING INDICATOR ── */}
        {methodSelected && isRunning && (
          <div style={{
            padding: 16, background: 'var(--bg2)', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
          }}>
            <Loader2 size={18} className="spin" style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              {totalChunks > 1 && currentChunk > 0 && shippingCount === 0 && trackingCount === 0 && `Memproses chunk ${currentChunk} dari ${totalChunks} (${orderSns.length} pesanan)`}
              {shippingCount > 0 && `Mengirim pesanan ke Shopee... (${doneCount + errorCount + shippingCount}/${orderSns.length})`}
              {shippingCount === 0 && trackingCount > 0 && `Mengambil tracking number... (${readyCount}/${doneCount + trackingCount})`}
              {shippingCount === 0 && trackingCount === 0 && totalChunks <= 1 && 'Menyiapkan label...'}
            </span>
          </div>
        )}

        {/* ── ORDER LIST with tracking numbers ── */}
        {methodSelected && (
          <div style={{ maxHeight: 280, overflow: 'auto', marginBottom: 16 }}>
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
                    <div style={{ fontSize: 12, color: 'var(--error)', marginTop: 2 }}>{o.error}</div>
                  )}
                </div>
                <div>
                  {o.step === 'PENDING' && <span style={{ fontSize: 11, color: 'var(--text4)' }}>Menunggu</span>}
                  {(o.step === 'SHIPPING' || o.step === 'FETCHING_TRACKING') && (
                    <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />
                  )}
                  {o.step === 'READY' && o.trackingNumber && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                  {o.step === 'READY' && !o.trackingNumber && <CheckCircle2 size={14} style={{ color: 'var(--warning)' }} />}
                  {o.step === 'ERROR' && <XCircle size={14} style={{ color: 'var(--error)' }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SUMMARY ── */}
        {methodSelected && !isRunning && (
          <div style={{
            padding: 12, background: 'var(--bg2)', borderRadius: 6,
            border: '1px solid var(--border)', display: 'flex', gap: 20,
            justifyContent: 'center', marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>{readyCount}</div>
              <div style={{ fontSize: 11, color: 'var(--text4)' }}>Siap Cetak</div>
            </div>
            {errorCount > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--error)' }}>{errorCount}</div>
                <div style={{ fontSize: 11, color: 'var(--text4)' }}>Gagal</div>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIONS ── */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: methodSelected ? 0 : 16 }}>
          <button onClick={handleSkip} disabled={printing} style={btnStyle(false, printing)}>
            {methodSelected ? 'Lewati' : 'Batal'}
          </button>
          {methodSelected && readyCount > 0 && !isRunning && (
            <div style={{ position: 'relative', display: 'inline-block' }}
              onMouseEnter={(e) => {
                const dd = e.currentTarget.querySelector('.batch-label-dropdown') as HTMLElement;
                if (dd) dd.style.display = 'block';
              }}
              onMouseLeave={(e) => {
                const dd = e.currentTarget.querySelector('.batch-label-dropdown') as HTMLElement;
                if (dd) dd.style.display = 'none';
              }}
            >
              <button onClick={handlePrintAll} disabled={printing} style={btnStyle(true, printing)}>
                {printing ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
                Cetak Label ({readyCount})
                <ChevronDown size={11} style={{ opacity: 0.6, marginLeft: 2 }} />
              </button>
              {!printing && (
                <div className="batch-label-dropdown" style={{
                  display: 'none', position: 'absolute', bottom: '100%', right: 0,
                  marginBottom: 4, background: 'var(--bg1, #fff)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  minWidth: 170, overflow: 'hidden', zIndex: 9999,
                }}>
                  <button onClick={handlePrintAll} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Palette size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div>
                      <div>Label Custom</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>Ada info item & SKU</div>
                    </div>
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />
                  <button onClick={handlePrintAllOfficial} style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <FileText size={14} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
                    <div>
                      <div>Label Asli</div>
                      <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>PDF resmi dari Shopee</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared UI helpers ── */

function MethodButton({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) {
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
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{label}</div>
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
