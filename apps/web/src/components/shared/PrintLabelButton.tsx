import { useState, useRef, useEffect } from 'react';
import { Printer, Loader2, Check, ChevronDown, FileText, Palette } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { api } from '../../lib/api';
import { printCustomLabels, printOfficialLabels } from '../../utils/printLabel';
import { getOrderErrorMessage } from '../../utils/label-errors';
import './PrintLabelButton.css';

interface PrintLabelButtonProps {
  orderSn: string;
  disabled?: boolean;
  labelPrinted?: boolean;
  onPrintStart?: () => void;
  onPrintComplete?: (printed: boolean) => void;
  onPrintError?: (error: string) => void;
}

export function PrintLabelButton({
  orderSn,
  disabled = false,
  labelPrinted = false,
  onPrintStart,
  onPrintComplete,
  onPrintError
}: PrintLabelButtonProps) {
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<'custom' | 'official' | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowDropdown(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setShowDropdown(false);
    }, 250);
  };

  // Toggle dropdown on click (NOT print directly)
  const handleButtonClick = () => {
    setShowDropdown(prev => !prev);
  };

  // Print Custom Label — directly opens new tab
  const handlePrintCustom = async () => {
    setShowDropdown(false);
    try {
      setLoading(true);
      setLoadingType('custom');
      onPrintStart?.();

      const result = await api.orderLabelData(orderSn);

      if (result.success && result.data) {
        await printCustomLabels(result.data, () => {
          toast(`Label custom dibuka di tab baru untuk pesanan #${orderSn}`, 'success');
          onPrintComplete?.(true);
        });
      } else {
        throw new Error((result as any).error || 'Gagal mengambil data label');
      }
    } catch (error: any) {
      console.error('[PrintLabelButton] Error:', error);
      const errorMessage = getOrderErrorMessage(orderSn, error);
      toast(errorMessage, 'error');
      onPrintError?.(errorMessage);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  // Print Official Shopee Label — directly opens new tab
  const handlePrintOfficial = async () => {
    setShowDropdown(false);
    try {
      setLoading(true);
      setLoadingType('official');
      onPrintStart?.();

      const result = await api.orderShippingLabel(orderSn);

      if (result.success && result.data?.url) {
        await printOfficialLabels(result.data.url, orderSn, () => {
          toast(`Label asli dibuka di tab baru untuk pesanan #${orderSn}`, 'success');
          onPrintComplete?.(true);
        });
      } else {
        throw new Error((result as any).error || 'Gagal mengambil label resmi');
      }
    } catch (error: any) {
      console.error('[PrintLabelButton] Official label error:', error);
      const errorMessage = getOrderErrorMessage(orderSn, error);
      toast(errorMessage, 'error');
      onPrintError?.(errorMessage);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="print-label-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {/* Main button — click toggles dropdown, does NOT print */}
      <button
        onClick={handleButtonClick}
        disabled={disabled || loading}
        title={labelPrinted ? "Cetak Ulang Label Pengiriman" : "Cetak Label Pengiriman"}
        aria-label={labelPrinted ? "Cetak Ulang Label Pengiriman" : "Cetak Label Pengiriman"}
        className="print-label-button"
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: 'none',
          fontSize: 12,
          fontWeight: 600,
          cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
          background: (disabled || loading) ? 'var(--bg3)' : labelPrinted ? 'var(--success)' : 'var(--accent)',
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
        ) : labelPrinted ? (
          <Check size={12} />
        ) : (
          <Printer size={12} />
        )}
        <span className="print-label-button-text">
          {loading
            ? loadingType === 'official' ? 'Mengambil...' : 'Mencetak...'
            : labelPrinted ? 'Cetak Ulang' : 'Cetak Label'}
        </span>
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>

      {/* Dropdown Menu — fixed positioning to avoid clipping */}
      {showDropdown && !loading && !disabled && (
        <div
          className="print-label-dropdown"
          style={{ position: 'fixed', zIndex: 9999 }}
          ref={(el) => {
            if (el && dropdownRef.current) {
              const btn = dropdownRef.current.querySelector('.print-label-button');
              if (btn) {
                const rect = btn.getBoundingClientRect();
                const dropdownHeight = 110;
                const spaceBelow = window.innerHeight - rect.bottom;

                if (spaceBelow < dropdownHeight + 10) {
                  el.style.top = `${rect.top - dropdownHeight - 4}px`;
                } else {
                  el.style.top = `${rect.bottom + 4}px`;
                }
                el.style.left = `${rect.left}px`;
              }
            }
          }}
        >
          <div style={{
            background: 'var(--bg1, #fff)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            minWidth: 170,
            overflow: 'hidden',
          }}>
            <button
              onClick={handlePrintCustom}
              className="print-label-dropdown-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
              }}
            >
              <Palette size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                <div>Label Custom</div>
                <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>Ada info item & SKU</div>
              </div>
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />
            <button
              onClick={handlePrintOfficial}
              className="print-label-dropdown-item"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--text1)', textAlign: 'left',
              }}
            >
              <FileText size={14} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
              <div>
                <div>Label Asli</div>
                <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 1 }}>PDF resmi dari Shopee</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
