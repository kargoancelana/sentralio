import { Info } from 'lucide-react';

interface LihatRincianButtonProps {
  orderSn: string;
  shopId: number;
  onClick: () => void;
}

/**
 * Secondary action button that opens the Order Detail Modal.
 * Displayed below primary action buttons (Atur Pengiriman / Cetak Label)
 * only for orders in the "Perlu Dikirim" tab with status READY_TO_SHIP or PROCESSED.
 *
 * Requirements: 1.4, 1.6, 1.7
 */
export function LihatRincianButton({ orderSn: _orderSn, shopId: _shopId, onClick }: LihatRincianButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Lihat rincian pesanan"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        border: 'none',
        background: 'transparent',
        color: 'var(--accent, #2563eb)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        borderRadius: 4,
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        transition: 'opacity .15s',
        minHeight: '32px',
        minWidth: '44px',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.75'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
    >
      <Info size={12} aria-hidden="true" />
      <span>Lihat Rincian</span>
    </button>
  );
}
