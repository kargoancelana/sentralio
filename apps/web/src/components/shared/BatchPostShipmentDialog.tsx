import { useState, useEffect } from 'react';
import { Printer, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { openPDFsInSingleTab } from '../../utils/pdf-merge';

/**
 * BatchPostShipmentDialog Component
 * 
 * Dialog shown after successful batch shipment arrangement.
 * Shows multiple tracking numbers with loading states and offers batch print option.
 */

interface OrderTrackingStatus {
  orderSn: string;
  trackingNumber?: string;
  loading: boolean;
  error?: string;
}

interface BatchPostShipmentDialogProps {
  isOpen: boolean;
  orderSns: string[];
  onClose: () => void;
  onPrintComplete?: () => void;
}

export function BatchPostShipmentDialog({
  isOpen,
  orderSns,
  onClose,
  onPrintComplete
}: BatchPostShipmentDialogProps) {
  const [printing, setPrinting] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState<OrderTrackingStatus[]>([]);
  const toast = useToast();

  // Initialize order statuses and start fetching tracking numbers
  useEffect(() => {
    if (isOpen && orderSns.length > 0) {
      // Initialize all orders with loading state
      const initialStatuses: OrderTrackingStatus[] = orderSns.map(orderSn => ({
        orderSn,
        loading: true
      }));
      setOrderStatuses(initialStatuses);
      setPrinting(false);
      
      // Start fetching tracking numbers for all orders
      fetchAllTrackingNumbers(orderSns);
    }
  }, [isOpen, orderSns]);

  const fetchAllTrackingNumbers = async (orderSnList: string[]) => {
    // Fetch tracking numbers concurrently
    const fetchPromises = orderSnList.map(async (orderSn) => {
      try {
        const result = await api.orderFetchTrackingNumber(orderSn);
        
        if (result.success && result.data?.trackingNumber) {
          // Update this order's status
          setOrderStatuses(prev => prev.map(status => 
            status.orderSn === orderSn
              ? { ...status, trackingNumber: result.data.trackingNumber, loading: false }
              : status
          ));
        } else {
          // Failed to get tracking number
          setOrderStatuses(prev => prev.map(status => 
            status.orderSn === orderSn
              ? { ...status, loading: false, error: 'Tracking number tidak tersedia' }
              : status
          ));
        }
      } catch (error: any) {
        console.error(`[BatchPostShipmentDialog] Error fetching tracking for ${orderSn}:`, error);
        setOrderStatuses(prev => prev.map(status => 
          status.orderSn === orderSn
            ? { ...status, loading: false, error: error.message || 'Gagal mengambil tracking number' }
            : status
        ));
      }
    });

    await Promise.all(fetchPromises);
  };

  if (!isOpen) return null;

  const allLoaded = orderStatuses.every(s => !s.loading);
  const successCount = orderStatuses.filter(s => s.trackingNumber).length;
  const failedCount = orderStatuses.filter(s => s.error).length;
  const canPrint = successCount > 0;

  const handlePrintNow = async () => {
    try {
      setPrinting(true);

      // Get order SNs that have tracking numbers
      const orderSnsWithTracking = orderStatuses
        .filter(s => s.trackingNumber)
        .map(s => s.orderSn);

      if (orderSnsWithTracking.length === 0) {
        toast('Tidak ada tracking number yang tersedia untuk dicetak', 'error');
        return;
      }

      // Fetch labels for all orders with tracking numbers
      const batchResult = await api.orderLabelsBatch(orderSnsWithTracking);

      if (batchResult.success && batchResult.data) {
        const { results } = batchResult.data;
        
        // Filter successful labels
        const successfulLabels = results
          .filter(r => r.success && r.url)
          .map(r => ({
            orderSn: r.orderSn,
            url: r.url!,
            format: r.format || 'pdf'
          }));

        if (successfulLabels.length > 0) {
          // Open all labels in single merged PDF
          const pdfUrls = successfulLabels.map(l => l.url);
          const orderSns = successfulLabels.map(l => l.orderSn);
          
          await openPDFsInSingleTab(pdfUrls, orderSns);
          
          toast(`Membuka ${successfulLabels.length} label`, 'success');
          onPrintComplete?.();
          onClose();
        } else {
          toast('Tidak ada label yang berhasil diambil', 'error');
        }
      } else {
        toast('Gagal mengambil label batch', 'error');
      }
    } catch (error: any) {
      console.error('[BatchPostShipmentDialog] Error printing labels:', error);
      toast(error.message || 'Gagal mencetak label', 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handleSkip = () => {
    toast(`Pengiriman berhasil diatur untuk ${orderSns.length} pesanan`, 'success');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20,
    }}>
      <div style={{
        background: 'var(--bg)',
        borderRadius: 'var(--radius)',
        padding: 24,
        maxWidth: 600,
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <h3 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text1)',
          }}>
            Pengiriman Batch Berhasil Diatur
          </h3>
          <button
            onClick={handleSkip}
            disabled={printing}
            style={{
              background: 'none',
              border: 'none',
              cursor: printing ? 'not-allowed' : 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text3)',
              opacity: printing ? 0.5 : 1,
            }}
            title="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          marginBottom: 24,
        }}>
          <p style={{
            margin: '0 0 16px 0',
            fontSize: 14,
            color: 'var(--text2)',
            lineHeight: 1.5,
          }}>
            Pengiriman untuk <strong>{orderSns.length} pesanan</strong> telah berhasil diatur.
          </p>

          {/* Summary */}
          {allLoaded && (
            <div style={{
              margin: '12px 0',
              padding: 12,
              background: 'var(--bg2)',
              borderRadius: 6,
              border: '1px solid var(--border)',
              display: 'flex',
              gap: 16,
              justifyContent: 'space-around',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#16A34A' }}>{successCount}</div>
                <div style={{ fontSize: 12, color: 'var(--text4)' }}>Berhasil</div>
              </div>
              {failedCount > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#DC2626' }}>{failedCount}</div>
                  <div style={{ fontSize: 12, color: 'var(--text4)' }}>Gagal</div>
                </div>
              )}
            </div>
          )}
          
          {/* Tracking Numbers List */}
          <div style={{
            margin: '16px 0',
            maxHeight: '300px',
            overflow: 'auto',
          }}>
            {orderStatuses.map((status, index) => (
              <div
                key={status.orderSn}
                style={{
                  padding: 12,
                  background: 'var(--bg2)',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  marginBottom: 8,
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text4)',
                    fontFamily: 'monospace',
                  }}>
                    #{status.orderSn}
                  </div>
                  {status.loading && (
                    <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />
                  )}
                  {status.trackingNumber && (
                    <CheckCircle2 size={14} style={{ color: '#16A34A' }} />
                  )}
                  {status.error && (
                    <XCircle size={14} style={{ color: '#DC2626' }} />
                  )}
                </div>
                
                {status.loading && (
                  <div style={{
                    fontSize: 13,
                    color: 'var(--text3)',
                    fontStyle: 'italic',
                  }}>
                    Mengambil tracking number...
                  </div>
                )}
                
                {status.trackingNumber && (
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text1)',
                    fontFamily: 'monospace',
                  }}>
                    {status.trackingNumber}
                  </div>
                )}
                
                {status.error && (
                  <div style={{
                    fontSize: 13,
                    color: '#DC2626',
                  }}>
                    {status.error}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <p style={{
            margin: '16px 0 0 0',
            fontSize: 14,
            color: 'var(--text3)',
            lineHeight: 1.5,
          }}>
            {!allLoaded 
              ? 'Menunggu tracking number...'
              : canPrint
              ? 'Apakah Anda ingin mencetak semua label sekarang?'
              : 'Tidak ada tracking number yang tersedia untuk dicetak.'}
          </p>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={handleSkip}
            disabled={printing}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              fontSize: 14,
              fontWeight: 600,
              cursor: printing ? 'not-allowed' : 'pointer',
              background: 'var(--bg2)',
              color: 'var(--text2)',
              transition: 'all .15s',
              opacity: printing ? 0.6 : 1,
            }}
          >
            Lewati
          </button>
          <button
            onClick={handlePrintNow}
            disabled={printing || !allLoaded || !canPrint}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: (printing || !allLoaded || !canPrint) ? 'not-allowed' : 'pointer',
              background: (printing || !allLoaded || !canPrint) ? 'var(--bg3)' : 'var(--accent)',
              color: (printing || !allLoaded || !canPrint) ? 'var(--text4)' : 'var(--accent-f)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              justifyContent: 'center',
              transition: 'all .15s',
              opacity: (printing || !allLoaded || !canPrint) ? 0.6 : 1,
            }}
            title={!allLoaded ? 'Menunggu tracking number...' : !canPrint ? 'Tidak ada tracking number tersedia' : 'Cetak semua label sekarang'}
          >
            {printing ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Printer size={16} />
            )}
            Cetak Semua Label
          </button>
        </div>
      </div>
    </div>
  );
}
