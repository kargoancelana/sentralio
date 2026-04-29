import { useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { openPrintDialog } from '../../utils/print';
import { getOrderErrorMessage } from '../../utils/label-errors';
import './PrintLabelButton.css';

/**
 * PrintLabelButton Component
 * 
 * Button component for printing shipping labels for individual orders.
 * Shows in order card when status is PROCESSED.
 * 
 * **Validates: Requirements 2.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
 */

interface PrintLabelButtonProps {
  orderSn: string;
  disabled?: boolean;
  onPrintStart?: () => void;
  onPrintComplete?: () => void;
  onPrintError?: (error: string) => void;
}

export function PrintLabelButton({
  orderSn,
  disabled = false,
  onPrintStart,
  onPrintComplete,
  onPrintError
}: PrintLabelButtonProps) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handlePrint = async () => {
    try {
      setLoading(true);
      onPrintStart?.();

      console.log('[PrintLabelButton] Fetching label for order:', orderSn);

      // Call API to get label
      const result = await api.orderLabel(orderSn);

      console.log('[PrintLabelButton] API response:', {
        success: result.success,
        hasData: !!result.data,
        url: result.data?.url ? `${result.data.url.substring(0, 50)}...` : 'none',
        format: result.data?.format,
        urlLength: result.data?.url?.length,
        isDataUrl: result.data?.url?.startsWith('data:'),
        isBlobUrl: result.data?.url?.startsWith('blob:')
      });

      if (result.success && result.data) {
        // Open print dialog with label
        console.log('[PrintLabelButton] Opening print dialog with format:', result.data.format);
        openPrintDialog(result.data.url, result.data.format);

        // Show success toast
        toast(`Label berhasil dicetak untuk pesanan #${orderSn}`, 'success');

        onPrintComplete?.();
      } else {
        throw new Error(result.message || 'Gagal mengambil label');
      }
    } catch (error: any) {
      console.error('[PrintLabelButton] Error:', error);
      
      // Map error to user-friendly message
      const errorMessage = getOrderErrorMessage(orderSn, error);

      toast(errorMessage, 'error');
      onPrintError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePrint}
      disabled={disabled || loading}
      title="Cetak Label Pengiriman"
      aria-label="Cetak Label Pengiriman"
      className="print-label-button"
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: 'none',
        fontSize: 12,
        fontWeight: 600,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        background: (disabled || loading) ? 'var(--bg3)' : 'var(--accent)',
        color: (disabled || loading) ? 'var(--text4)' : 'var(--accent-f)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'center',
        transition: 'all .15s',
        opacity: (disabled || loading) ? 0.6 : 1,
        minHeight: '44px',
        minWidth: '44px',
      }}
    >
      {loading ? (
        <Loader2 size={12} className="spin" />
      ) : (
        <Printer size={12} />
      )}
      <span className="print-label-button-text">
        Cetak Label
      </span>
    </button>
  );
}
