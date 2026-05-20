import { useState } from 'react';
import { UserCircle, UserPlus, MessageCircle } from 'lucide-react';

interface BuyerInfoRowProps {
  /** Buyer username from the order detail response. Null when unavailable. */
  buyerUsername: string | null;
}

/**
 * BuyerInfoRow — displays buyer username between Informasi Pesanan and Informasi Pembayaran.
 * Shows visual-only "Ikuti" and "Chat Sekarang" buttons that display a
 * "Fitur belum tersedia" tooltip on click without performing any network action.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export function BuyerInfoRow({ buyerUsername }: BuyerInfoRowProps) {
  const [activeTooltip, setActiveTooltip] = useState<'ikuti' | 'chat' | null>(null);

  const handleButtonClick = (btn: 'ikuti' | 'chat') => {
    // Toggle tooltip; clicking the same button again dismisses it
    setActiveTooltip(prev => (prev === btn ? null : btn));
  };

  const dismissTooltip = () => setActiveTooltip(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
      }}
      // Clicking outside the buttons dismisses any open tooltip
      onClick={dismissTooltip}
    >
      {/* Buyer avatar icon */}
      <UserCircle size={28} style={{ color: 'var(--text3)', flexShrink: 0 }} />

      {/* Username */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text1)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {buyerUsername ?? '—'}
      </span>

      {/* Visual-only action buttons */}
      <div
        style={{ display: 'flex', gap: 8, flexShrink: 0 }}
        // Stop propagation so clicking a button doesn't also trigger the row's dismissTooltip
        onClick={e => e.stopPropagation()}
      >
        {/* Ikuti */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label="Ikuti pembeli"
            onClick={() => handleButtonClick('ikuti')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'transparent',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            <UserPlus size={13} />
            Ikuti
          </button>
          {activeTooltip === 'ikuti' && (
            <UnavailableTooltip onDismiss={dismissTooltip} />
          )}
        </div>

        {/* Chat Sekarang */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label="Chat dengan pembeli"
            onClick={() => handleButtonClick('chat')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text2)',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            <MessageCircle size={13} />
            Chat Sekarang
          </button>
          {activeTooltip === 'chat' && (
            <UnavailableTooltip onDismiss={dismissTooltip} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Tooltip shown when a visual-only button is clicked (Requirement 4.3). */
function UnavailableTooltip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="tooltip"
      aria-live="polite"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        right: 0,
        background: 'var(--bg1, #1e1e2e)',
        color: 'var(--text1)',
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        border: '1px solid var(--border)',
        zIndex: 10,
        cursor: 'default',
      }}
      onClick={e => { e.stopPropagation(); onDismiss(); }}
    >
      Fitur belum tersedia
      {/* Caret pointing down */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -5,
          right: 14,
          width: 8,
          height: 8,
          background: 'var(--bg1, #1e1e2e)',
          border: '1px solid var(--border)',
          borderTop: 'none',
          borderLeft: 'none',
          transform: 'rotate(45deg)',
        }}
      />
    </div>
  );
}
