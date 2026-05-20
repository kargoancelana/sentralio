import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { BuyerPayment } from '../../types/order-detail';

interface BuyerPaymentSectionProps {
  buyerPayment: BuyerPayment;
}

/**
 * BuyerPaymentSection — displays "Pembayaran Pembeli" as a collapsible section.
 *
 * Collapsed by default (Requirement 7.2). On expand, shows:
 *   - Subtotal Pesanan
 *   - Ongkos Kirim
 *   - Voucher Shopee (displayed as negative, e.g. -Rp 10.000)
 *   - Voucher Toko (displayed as negative)
 *   - Biaya Layanan
 *   - Total Pembayaran Pembeli (bold)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export function BuyerPaymentSection({ buyerPayment }: BuyerPaymentSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section aria-label="Pembayaran Pembeli">
      {/* Collapsible header (Requirement 7.1) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="buyer-payment-body"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '14px 16px',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: expanded ? '8px 8px 0 0' : '8px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text1)',
          textAlign: 'left',
          transition: 'background .12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
      >
        <span>Pembayaran Pembeli</span>
        {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>

      {/* Expandable body (Requirement 7.3) */}
      {expanded && (
        <div
          id="buyer-payment-body"
          style={{
            padding: '16px',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            fontSize: '13px',
            color: 'var(--text2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Subtotal Pesanan */}
          <Row
            label="Subtotal Pesanan"
            value={formatRp(buyerPayment.productSubtotal)}
          />

          {/* Ongkos Kirim */}
          <Row
            label="Ongkos Kirim"
            value={formatRp(buyerPayment.shippingFee)}
          />

          {/* Voucher Shopee — displayed as negative (Requirement 7.5) */}
          <Row
            label="Voucher Shopee"
            value={formatRpNegative(buyerPayment.shopeeVoucher)}
          />

          {/* Voucher Toko — displayed as negative (Requirement 7.5) */}
          <Row
            label="Voucher Toko"
            value={formatRpNegative(buyerPayment.sellerVoucher)}
          />

          {/* Biaya Layanan */}
          <Row
            label="Biaya Layanan"
            value={formatRp(buyerPayment.serviceFee)}
          />

          {/* Divider before total */}
          <div
            style={{
              height: 1,
              background: 'var(--border)',
              margin: '4px 0',
            }}
            aria-hidden="true"
          />

          {/* Total Pembayaran Pembeli — bold (Requirement 7.4) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 700,
              color: 'var(--text1)',
            }}
          >
            <span>Total Pembayaran Pembeli</span>
            <span>{formatRp(buyerPayment.total)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a non-negative number as "Rp 10.000" using id-ID locale.
 * Null/undefined/NaN values are treated as 0.
 */
function formatRp(value: number | null | undefined): string {
  const n = (value == null || isNaN(value as number)) ? 0 : (value as number);
  return `Rp ${Math.abs(n).toLocaleString('id-ID')}`;
}

/**
 * Formats a voucher/deduction amount as a negative display value.
 * Per Requirement 7.5, voucher amounts are shown with a "-" prefix to indicate deduction.
 * e.g. value=10000 → "-Rp 10.000", value=0 → "-Rp 0"
 */
function formatRpNegative(value: number | null | undefined): string {
  const n = (value == null || isNaN(value as number)) ? 0 : (value as number);
  return `-Rp ${Math.abs(n).toLocaleString('id-ID')}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
