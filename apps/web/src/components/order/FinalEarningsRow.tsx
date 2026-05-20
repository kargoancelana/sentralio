import { AlertCircle } from 'lucide-react';
import type { FinalEarnings } from '../../types/order-detail';

interface FinalEarningsRowProps {
  finalEarnings: FinalEarnings;
}

/**
 * FinalEarningsRow — displays "Penghasilan Akhir" as a visually highlighted row.
 *
 * - Shows the final earnings amount from `escrow_amount_after_adjustment`.
 * - When `isFallback` is true (i.e. `escrow_amount_after_adjustment` was null/absent),
 *   displays a footnote indicating the value is the unadjusted estimate.
 * - Amount is formatted using id-ID locale with Rp prefix.
 *
 * Requirements: 6.4, 6.5, 6.6
 */
export function FinalEarningsRow({ finalEarnings }: FinalEarningsRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        background: 'var(--bg2)',
        borderRadius: '10px',
        border: '2px solid var(--success, #22c55e)',
        gap: '12px',
      }}
      data-testid="final-earnings-row"
    >
      {/* Label + optional fallback footnote */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--text1)',
            letterSpacing: '0.01em',
          }}
        >
          Penghasilan Akhir
        </span>

        {/* Requirement 6.6: footnote when isFallback is true */}
        {finalEarnings.isFallback && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: 'var(--text4)',
              fontStyle: 'italic',
            }}
            data-testid="final-earnings-fallback-note"
          >
            <AlertCircle size={11} aria-hidden="true" />
            Nilai estimasi — penyesuaian final belum tersedia
          </span>
        )}
      </div>

      {/* Amount */}
      <span
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--success, #22c55e)',
          whiteSpace: 'nowrap',
        }}
        data-testid="final-earnings-amount"
      >
        {formatRp(finalEarnings.amount)}
      </span>
    </div>
  );
}

/**
 * Formats a number as Indonesian Rupiah.
 * Negative values are rendered as "-Rp <abs_value>" with id-ID thousand separators.
 * Null/undefined values render as "Rp 0".
 */
function formatRp(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n < 0) {
    return `-Rp ${Math.abs(n).toLocaleString('id-ID')}`;
  }
  return `Rp ${n.toLocaleString('id-ID')}`;
}
