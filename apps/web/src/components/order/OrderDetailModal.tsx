import { useEffect, useRef, useCallback } from 'react';
import { X, AlertCircle, RefreshCw } from 'lucide-react';
import { useOrderDetail } from '../../hooks/useOrderDetail';
import type { OrderDetailResponse } from '../../types/order-detail';

// Sub-section components — imported lazily once created; for now we forward-declare
// placeholders so the modal shell compiles and renders correctly.
// Each section will be replaced by its real component in subsequent tasks.
import { InformasiPesananSection } from './InformasiPesananSection';
import { BuyerInfoRow } from './BuyerInfoRow';
import { IncomeBreakdownSection } from './IncomeBreakdownSection';
import { AdjustmentSection } from './AdjustmentSection';
import { FinalEarningsRow } from './FinalEarningsRow';
import { BuyerPaymentSection } from './BuyerPaymentSection';

interface OrderDetailModalProps {
  /** The order SN to load. Pass null to keep modal unmounted. */
  orderSn: string | null;
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the modal should close (backdrop, Escape, close button). */
  onClose: () => void;
}

/**
 * OrderDetailModal — main modal shell.
 *
 * Responsibilities (Requirements 2.1–2.6, 10.1–10.4):
 * - Renders a portal-style overlay with the modal box.
 * - Displays header "Rincian Pesanan" + close button.
 * - Closes on backdrop click, Escape key, or close button.
 * - Traps keyboard focus within the modal while open.
 * - Prevents background scroll while open.
 * - Shows loading skeleton while data is loading.
 * - Shows error card with "Coba Lagi" button on error.
 * - Responsive: max-width min(960px, 100vw - 32px); single-column below 768px.
 * - Renders all required sections in order when data is available.
 */
export function OrderDetailModal({ orderSn, open, onClose }: OrderDetailModalProps) {
  const { data, loading, error, refresh, retry } = useOrderDetail(open ? orderSn : null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalBoxRef = useRef<HTMLDivElement>(null);

  // ── Background scroll prevention (Requirement 2.5) ──
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Focus management: focus close button on open, restore on close ──
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      // Remember the element that triggered the modal
      triggerRef.current = document.activeElement;
      // Focus the close button after the modal renders
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    } else {
      // Restore focus to the triggering element
      if (triggerRef.current && (triggerRef.current as HTMLElement).focus) {
        (triggerRef.current as HTMLElement).focus();
      }
      triggerRef.current = null;
    }
  }, [open]);

  // ── Focus trap (Requirement 2.4) ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const modal = modalBoxRef.current;
      if (!modal) return;

      const focusable = modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      const focusableArr = Array.from(focusable);
      if (focusableArr.length === 0) return;

      const first = focusableArr[0];
      const last = focusableArr[focusableArr.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Backdrop click (Requirement 2.3) ──
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Rincian Pesanan"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn .15s ease',
        overflowY: 'auto',
      }}
    >
      <div
        ref={modalBoxRef}
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          width: '100%',
          maxWidth: 'min(960px, calc(100vw - 32px))',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp .18s ease',
        }}
      >
        {/* ── Header (Requirement 2.1) ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            background: 'var(--bg)',
            zIndex: 1,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text1)',
            }}
          >
            Rincian Pesanan
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Tutup modal"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '6px',
              color: 'var(--text3)',
              transition: 'background .12s, color .12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg3)';
              e.currentTarget.style.color = 'var(--text1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text3)';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '24px', flex: 1 }}>
          {loading && <ModalLoadingSkeleton />}

          {!loading && error && (
            <ModalErrorCard
              message={error.message}
              canRetry={error.canRetry}
              onRetry={retry}
            />
          )}

          {!loading && !error && data && (
            <ModalContent
              data={data}
              onRefresh={refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Loading Skeleton (Requirement 10.1) ──────────────────────────────────────

function ModalLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Memuat rincian pesanan"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      {/* Simulate section blocks */}
      {[120, 80, 200, 60, 60].map((height, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: '8px',
            background: 'var(--bg3)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ── Error Card (Requirement 10.3, 10.4) ─────────────────────────────────────

interface ModalErrorCardProps {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}

function ModalErrorCard({ message, canRetry, onRetry }: ModalErrorCardProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <AlertCircle size={40} style={{ color: 'var(--error)' }} />
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--text2)',
          lineHeight: 1.5,
          maxWidth: '400px',
        }}
      >
        {message}
      </p>
      {canRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 20px',
            background: 'var(--accent)',
            color: 'var(--accent-f)',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'opacity .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <RefreshCw size={14} />
          Coba Lagi
        </button>
      )}
    </div>
  );
}

// ── Modal Content (Requirement 2.2) ─────────────────────────────────────────

interface ModalContentProps {
  data: OrderDetailResponse;
  onRefresh: () => void;
}

function ModalContent({ data, onRefresh }: ModalContentProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Refresh button — top-right corner */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onRefresh}
          title="Refresh data pesanan"
          aria-label="Refresh data pesanan"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--text3)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background .12s, color .12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg3)';
            e.currentTarget.style.color = 'var(--text1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text3)';
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Section 1: Informasi Pesanan (Requirement 3) */}
      <InformasiPesananSection
        orderSn={data.orderSn}
        recipientAddress={data.recipientAddress}
        packages={data.packages}
      />

      {/* Section 2: Buyer Info Row (Requirement 4) */}
      <BuyerInfoRow buyerUsername={data.buyerUsername} />

      {/* Section 3: Informasi Pembayaran / Rincian Penghasilan (Requirement 5, 12) */}
      <IncomeBreakdownSection
        incomeBreakdown={data.incomeBreakdown}
        orderStatus={data.orderStatus}
      />

      {/* Section 4: Biaya Penyesuaian (Requirement 6.1–6.3) */}
      <AdjustmentSection adjustments={data.adjustments} />

      {/* Section 5: Penghasilan Akhir (Requirement 6.4–6.6) */}
      <FinalEarningsRow finalEarnings={data.finalEarnings} />

      {/* Section 6: Pembayaran Pembeli — collapsible (Requirement 7) */}
      <BuyerPaymentSection buyerPayment={data.buyerPayment} />
    </div>
  );
}
