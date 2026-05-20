import type { Adjustment } from '../../types/order-detail';

interface AdjustmentSectionProps {
  adjustments: Adjustment[];
}

/**
 * AdjustmentSection — displays "Biaya Penyesuaian" section.
 *
 * - Shows placeholder text when adjustments array is empty or null.
 * - Renders each adjustment entry with its reason and formatted amount.
 * - Amounts are formatted using id-ID locale with Rp prefix.
 * - Negative amounts are displayed as "-Rp <value>" per id-ID convention.
 *
 * Requirements: 6.1, 6.2, 6.3
 */
export function AdjustmentSection({ adjustments }: AdjustmentSectionProps) {
  const hasAdjustments = adjustments != null && adjustments.length > 0;

  return (
    <section aria-label="Biaya Penyesuaian">
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text1)',
        }}
      >
        Biaya Penyesuaian
      </h3>

      <div
        style={{
          padding: '16px',
          background: 'var(--bg2)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          fontSize: '13px',
          color: 'var(--text2)',
        }}
      >
        {!hasAdjustments ? (
          /* Requirement 6.2: placeholder when no adjustments */
          <p
            style={{ margin: 0, color: 'var(--text4)', fontSize: '13px' }}
            data-testid="adjustment-empty-placeholder"
          >
            Belum ada biaya penyesuaian untuk pesanan ini
          </p>
        ) : (
          /* Requirement 6.3: render each adjustment entry */
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {adjustments.map((adj, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
                data-testid={`adjustment-entry-${i}`}
              >
                {/* Reason */}
                <span
                  style={{
                    color: 'var(--text3)',
                    flex: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {adj.reason}
                </span>

                {/* Amount — preserves sign from Shopee; negative shown as "-Rp ..." */}
                <span
                  style={{
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    color: adj.amount < 0 ? 'var(--error)' : 'var(--text1)',
                  }}
                  data-testid={`adjustment-amount-${i}`}
                >
                  {formatRp(adj.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
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
