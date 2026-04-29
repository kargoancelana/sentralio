import { useState, useEffect } from 'react';
import { Printer, X, Loader2 } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { openPrintDialog } from '../../utils/print';
import { getOrderErrorMessage } from '../../utils/label-errors';

/**
 * PostShipmentDialog Component
 * 
 * Dialog shown after successful single shipment arrangement.
 * Offers option to print label immediately after order status changes to PROCESSED.
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */

interface PostShipmentDialogProps {
  isOpen: boolean;
  orderSn: string;
  trackingNumber?: string;
  onClose: () => void;
  onPrintComplete?: () => void;
}

export function PostShipmentDialog({
  isOpen,
  orderSn,
  trackingNumber: initialTrackingNumber,
  onClose,
  onPrintComplete
}: PostShipmentDialogProps) {
  const [printing, setPrinting] = useState(false);
  const [waitingForStatus, setWaitingForStatus] = useState(false);
  const [fetchingTrackingNumber, setFetchingTrackingNumber] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState<string | undefined>(initialTrackingNumber);
  const toast = useToast();

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPrinting(false);
      setWaitingForStatus(false);
      setFetchingTrackingNumber(false);
      setTrackingNumber(initialTrackingNumber);
      
      // Start fetching tracking number if not provided
      if (!initialTrackingNumber) {
        fetchTrackingNumberWithPolling();
      }
    }
  }, [isOpen, initialTrackingNumber]);

  const fetchTrackingNumberWithPolling = async () => {
    setFetchingTrackingNumber(true);
    
    const maxAttempts = 6; // 30 seconds total (6 * 5s)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        // Use new endpoint to fetch tracking number
        const result = await api.orderFetchTrackingNumber(orderSn);
        
        if (result.success && result.data?.trackingNumber) {
          setTrackingNumber(result.data.trackingNumber);
          setFetchingTrackingNumber(false);
          return;
        }
      } catch (pollErr) {
        console.warn('[PostShipmentDialog] Error polling tracking number:', pollErr);
      }

      // Wait 5 seconds before next attempt
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }
    
    // Timeout - tracking number not available yet
    setFetchingTrackingNumber(false);
    console.warn('[PostShipmentDialog] Tracking number not available after 30 seconds');
  };

  if (!isOpen) return null;

  const hasTrackingNumber = !!trackingNumber;

  const handlePrintNow = async () => {
    try {
      setPrinting(true);
      setWaitingForStatus(true);

      // Wait for order status to change to PROCESSED
      // Poll the order status with a timeout
      const maxAttempts = 10; // 10 attempts = 10 seconds max wait
      let attempts = 0;
      let orderProcessed = false;

      while (attempts < maxAttempts && !orderProcessed) {
        try {
          // Fetch order list to check status
          const ordersResult = await api.orderList();
          
          if (ordersResult.success && ordersResult.data) {
            const order = ordersResult.data.find((o: any) => o.orderSn === orderSn);
            
            if (order && order.orderStatus === 'PROCESSED') {
              orderProcessed = true;
              break;
            }
          }
        } catch (pollErr) {
          console.warn('[PostShipmentDialog] Error polling order status:', pollErr);
        }

        // Wait 1 second before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      if (!orderProcessed) {
        throw new Error('Timeout menunggu status pesanan berubah. Silakan coba cetak label dari daftar pesanan.');
      }

      setWaitingForStatus(false);

      // Now fetch and print the label
      const result = await api.orderLabel(orderSn);

      if (result.success && result.data) {
        // Open print dialog with label
        openPrintDialog(result.data.url, result.data.format);

        // Show success toast
        toast(`Label berhasil dicetak untuk pesanan #${orderSn}`, 'success');

        onPrintComplete?.();
        onClose();
      } else {
        throw new Error(result.message || 'Gagal mengambil label');
      }
    } catch (error: any) {
      // Map error to user-friendly message
      const errorMessage = getOrderErrorMessage(orderSn, error);

      toast(errorMessage, 'error');
    } finally {
      setPrinting(false);
      setWaitingForStatus(false);
    }
  };

  const handleSkip = () => {
    toast(`Pengiriman berhasil diatur untuk pesanan #${orderSn}`, 'success');
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
        maxWidth: 480,
        width: '100%',
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
            Pengiriman Berhasil Diatur
          </h3>
          <button
            onClick={handleSkip}
            disabled={printing || fetchingTrackingNumber}
            style={{
              background: 'none',
              border: 'none',
              cursor: (printing || fetchingTrackingNumber) ? 'not-allowed' : 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text3)',
              opacity: (printing || fetchingTrackingNumber) ? 0.5 : 1,
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
            margin: '0 0 12px 0',
            fontSize: 14,
            color: 'var(--text2)',
            lineHeight: 1.5,
          }}>
            Pengiriman untuk pesanan <strong>#{orderSn}</strong> telah berhasil diatur.
          </p>
          
          {/* Tracking Number Display */}
          {hasTrackingNumber && (
            <div style={{
              margin: '12px 0',
              padding: 12,
              background: 'var(--bg2)',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: 12,
                color: 'var(--text4)',
                marginBottom: 4,
              }}>
                Nomor Resi:
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text1)',
                fontFamily: 'monospace',
              }}>
                {trackingNumber}
              </div>
            </div>
          )}
          
          <p style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--text3)',
            lineHeight: 1.5,
          }}>
            {hasTrackingNumber 
              ? 'Apakah Anda ingin mencetak label pengiriman sekarang?'
              : 'Tracking number sedang diproses. Anda dapat mencetak label setelah tracking number tersedia.'}
          </p>
        </div>

        {/* Loading indicator for tracking number */}
        {fetchingTrackingNumber && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--bg2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <Loader2 size={16} className="spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>
              Mengambil tracking number...
            </span>
          </div>
        )}

        {/* Loading indicator for status change */}
        {waitingForStatus && (
          <div style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--bg2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <Loader2 size={16} className="spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>
              Menunggu status pesanan berubah...
            </span>
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={handleSkip}
            disabled={printing || fetchingTrackingNumber}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              fontSize: 14,
              fontWeight: 600,
              cursor: (printing || fetchingTrackingNumber) ? 'not-allowed' : 'pointer',
              background: 'var(--bg2)',
              color: 'var(--text2)',
              transition: 'all .15s',
              opacity: (printing || fetchingTrackingNumber) ? 0.6 : 1,
            }}
          >
            Lewati
          </button>
          <button
            onClick={handlePrintNow}
            disabled={printing || fetchingTrackingNumber || !hasTrackingNumber}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: (printing || fetchingTrackingNumber || !hasTrackingNumber) ? 'not-allowed' : 'pointer',
              background: (printing || fetchingTrackingNumber || !hasTrackingNumber) ? 'var(--bg3)' : 'var(--accent)',
              color: (printing || fetchingTrackingNumber || !hasTrackingNumber) ? 'var(--text4)' : 'var(--accent-f)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              justifyContent: 'center',
              transition: 'all .15s',
              opacity: (printing || fetchingTrackingNumber || !hasTrackingNumber) ? 0.6 : 1,
            }}
            title={!hasTrackingNumber ? 'Menunggu tracking number...' : 'Cetak label sekarang'}
          >
            {printing ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Printer size={16} />
            )}
            Cetak Label Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
