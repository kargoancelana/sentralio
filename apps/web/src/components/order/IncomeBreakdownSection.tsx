import { useState, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import type { IncomeBreakdown, IncomeItem } from '../../types/order-detail';

interface IncomeBreakdownSectionProps {
  incomeBreakdown: IncomeBreakdown;
  orderStatus: string;
}

// ── Currency formatter (id-ID locale, Requirement 5.8) ──────────────────────

function formatRp(value: number | null | undefined): string {
  const n = value == null || isNaN(value as number) ? 0 : (value as number);
  if (n < 0) {
    return `-Rp ${Math.abs(n).toLocaleString('id-ID')}`;
  }
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function formatRpNegative(value: number | null | undefined): string {
  const n = value == null || isNaN(value as number) ? 0 : (value as number);
  // Always display as negative (cost to seller)
  return `-Rp ${Math.abs(n).toLocaleString('id-ID')}`;
}

// ── Tooltip component ────────────────────────────────────────────────────────

interface TooltipProps {
  text: string;
}

function InfoTooltip({ text }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  };

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '4px' }}
    >
      <button
        type="button"
        aria-label="Informasi"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={show}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--text4)',
          lineHeight: 1,
        }}
      >
        <HelpCircle size={13} />
      </button>
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            background: 'var(--bg-tooltip, #333)',
            color: '#fff',
            fontSize: '11px',
            lineHeight: 1.4,
            padding: '6px 10px',
            borderRadius: '6px',
            whiteSpace: 'normal',
            width: '220px',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ── Row helpers ──────────────────────────────────────────────────────────────

interface SummaryRowProps {
  label: React.ReactNode;
  value: string;
  bold?: boolean;
  indent?: boolean;
  color?: string;
}

function SummaryRow({ label, value, bold, indent, color }: SummaryRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: indent ? '16px' : 0,
        paddingTop: '4px',
        paddingBottom: '4px',
      }}
    >
      <span
        style={{
          fontSize: '13px',
          color: color ?? 'var(--text3)',
          fontWeight: bold ? 600 : 400,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '13px',
          color: color ?? 'var(--text2)',
          fontWeight: bold ? 600 : 400,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Product table ────────────────────────────────────────────────────────────

const PLACEHOLDER_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239ca3af'%3E%3F%3C/text%3E%3C/svg%3E";

interface ProductTableProps {
  items: IncomeItem[];
}

function ProductTable({ items }: ProductTableProps) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          color: 'var(--text2)',
        }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--bg3)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <th style={thStyle}>No</th>
            <th style={{ ...thStyle, textAlign: 'left', minWidth: '200px' }}>Produk</th>
            <th style={thStyle}>Harga Satuan</th>
            <th style={thStyle}>Jumlah</th>
            <th style={thStyle}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <ProductRow key={`${item.itemId}:${item.modelId}`} item={item} index={idx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 600,
  color: 'var(--text3)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

interface ProductRowProps {
  item: IncomeItem;
  index: number;
}

function ProductRow({ item, index }: ProductRowProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {/* No */}
      <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text4)' }}>
        {index + 1}
      </td>

      {/* Produk */}
      <td style={{ ...tdStyle, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <img
            src={!imgError && item.imageUrl ? item.imageUrl : PLACEHOLDER_IMG}
            alt={item.itemName}
            onError={() => setImgError(true)}
            style={{
              width: 40,
              height: 40,
              objectFit: 'cover',
              borderRadius: '4px',
              flexShrink: 0,
              border: '1px solid var(--border)',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontWeight: 500, color: 'var(--text1)', lineHeight: 1.3 }}>
              {item.itemName}
            </span>
            {item.modelName && (
              <span style={{ color: 'var(--text4)', fontSize: '11px' }}>
                Variasi: {item.modelName}
              </span>
            )}
            {item.modelSku && (
              <span style={{ color: 'var(--text4)', fontSize: '11px' }}>
                SKU: {item.modelSku}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Harga Satuan */}
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {formatRp(item.unitPrice)}
      </td>

      {/* Jumlah */}
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        {item.quantity}
      </td>

      {/* Subtotal */}
      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {formatRp(item.subtotal)}
      </td>
    </tr>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '10px',
  verticalAlign: 'middle',
};

// ── Main component ───────────────────────────────────────────────────────────

/**
 * IncomeBreakdownSection — "Informasi Pembayaran" / "Rincian Penghasilan"
 *
 * Requirements: 5.1–5.10, 12.1–12.7
 */
export function IncomeBreakdownSection({
  incomeBreakdown,
  orderStatus,
}: IncomeBreakdownSectionProps) {
  const isEstimative = orderStatus !== 'COMPLETED';
  const { items, productSubtotal, shipping, fees, totalEstimatedIncome } = incomeBreakdown;

  return (
    <section aria-label="Informasi Pembayaran">
      {/* Section title (Requirement 5.1) */}
      <h3
        style={{
          margin: '0 0 2px',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text1)',
        }}
      >
        Informasi Pembayaran
      </h3>
      <p
        style={{
          margin: '0 0 14px',
          fontSize: '12px',
          color: 'var(--text3)',
        }}
      >
        Rincian Penghasilan
      </p>

      {/* Product table (Requirement 5.2) */}
      <ProductTable items={items} />

      {/* Summary rows */}
      <div
        style={{
          padding: '12px 14px',
          background: 'var(--bg2)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {/* Subtotal Pesanan (Requirement 5.3) */}
        <SummaryRow
          label="Subtotal Pesanan (Harga Produk)"
          value={formatRp(productSubtotal)}
        />

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />

        {/* Estimasi Subtotal Ongkos Kirim rollup (Requirement 5.4) */}
        <SummaryRow
          label={
            <span style={{ fontWeight: 500, color: 'var(--text2)' }}>
              Estimasi Subtotal Ongkos Kirim
            </span>
          }
          value={formatRp(shipping.rollup)}
          bold
        />

        {/* Child rows (Requirement 5.5) */}
        <SummaryRow
          label="Ongkir Dibayar Pembeli"
          value={formatRp(shipping.buyerPaid)}
          indent
        />
        <SummaryRow
          label="Estimasi Ongkos Kirim yang Dibayarkan ke Jasa Kirim"
          value={formatRpNegative(shipping.actualToCarrier)}
          indent
        />
        <SummaryRow
          label="Estimasi Potongan Ongkos Kirim dari Shopee"
          value={formatRp(shipping.shopeeRebate)}
          indent
        />

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />

        {/* Biaya Lainnya group (Requirement 5.6) */}
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text3)',
            paddingBottom: '2px',
          }}
        >
          Biaya Lainnya
        </span>

        {/* Biaya Administrasi (Requirement 5.6, 12.3, 12.4) */}
        <SummaryRow
          label={
            <>
              Biaya Administrasi
              <InfoTooltip text="Komisi/biaya administrasi yang dipotong Shopee dari nilai pesanan sebagai biaya penggunaan platform marketplace." />
            </>
          }
          value={formatRpNegative(fees.adminFee)}
        />

        {/* Biaya Layanan (Requirement 5.6, 12.3, 12.5) */}
        <SummaryRow
          label={
            <>
              Biaya Layanan
              <InfoTooltip text="Biaya layanan platform yang dibebankan ke seller atas penggunaan fitur dan layanan Shopee." />
            </>
          }
          value={formatRpNegative(fees.serviceFee)}
        />

        {/* Biaya Proses Pesanan (Requirement 5.6, 12.3, 12.6) */}
        <SummaryRow
          label={
            <>
              Biaya Proses Pesanan
              <InfoTooltip text="Biaya proses pesanan yang dibebankan per pesanan untuk memproses dan mengelola transaksi di platform Shopee." />
            </>
          }
          value={formatRpNegative(fees.processingFee)}
        />

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />

        {/* Estimasi Total Penghasilan (Requirement 5.7) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '4px',
            paddingBottom: '4px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text1)',
            }}
          >
            Estimasi Total Penghasilan
          </span>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#e05c00',
            }}
          >
            {formatRp(totalEstimatedIncome)}
          </span>
        </div>
      </div>

      {/* Estimative disclosure footnote (Requirement 12.1, 12.2, 12.7) */}
      {isEstimative && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: '11px',
            color: 'var(--text4)',
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          Nilai penghasilan bersifat estimasi dan dapat berubah hingga pesanan selesai.
        </p>
      )}
    </section>
  );
}
