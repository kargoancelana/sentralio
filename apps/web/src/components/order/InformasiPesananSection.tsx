import { useState } from 'react';
import { Copy, Check, MapPin, Truck, Package, ImageOff } from 'lucide-react';
import type { RecipientAddress, Package as OrderPackage } from '../../types/order-detail';

interface InformasiPesananSectionProps {
  orderSn: string;
  recipientAddress: RecipientAddress;
  packages: OrderPackage[];
}

// ── Copy-to-clipboard button ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Tersalin!' : 'Salin nomor pesanan'}
      aria-label={copied ? 'Tersalin!' : 'Salin nomor pesanan'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        background: copied ? 'var(--bg3)' : 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        cursor: 'pointer',
        color: copied ? 'var(--success)' : 'var(--text3)',
        fontSize: '12px',
        fontFamily: 'inherit',
        transition: 'all .15s',
        flexShrink: 0,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Tersalin' : 'Salin'}
    </button>
  );
}

// ── Product thumbnail with placeholder fallback ───────────────────────────────

function ProductThumbnail({ imageUrl, alt }: { imageUrl: string | null; alt: string }) {
  const [error, setError] = useState(false);

  if (!imageUrl || error) {
    return (
      <div
        role="img"
        aria-label="Gambar produk tidak tersedia"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '6px',
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text4)',
          flexShrink: 0,
        }}
      >
        <ImageOff size={16} />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      onError={() => setError(true)}
      style={{
        width: '40px',
        height: '40px',
        borderRadius: '6px',
        objectFit: 'cover',
        border: '1px solid var(--border)',
        flexShrink: 0,
        background: 'var(--bg3)',
      }}
    />
  );
}

// ── Address formatting helper ─────────────────────────────────────────────────

function buildAddressLines(addr: RecipientAddress): string[] {
  const lines: string[] = [];
  if (addr.fullAddress) lines.push(addr.fullAddress);
  const cityParts = [addr.district, addr.city].filter(Boolean).join(', ');
  if (cityParts) lines.push(cityParts);
  const regionParts = [addr.state, addr.region].filter(Boolean).join(', ');
  if (regionParts) lines.push(regionParts);
  if (addr.zipcode) lines.push(addr.zipcode);
  return lines;
}

// ── Package block ─────────────────────────────────────────────────────────────

function PackageBlock({ pkg }: { pkg: OrderPackage }) {
  const itemCount = pkg.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
      }}
    >
      {/* Package header: label + courier badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Package size={13} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text1)' }}>
            {pkg.label}
          </span>
        </div>

        <span
          style={{
            fontSize: '12px',
            color: 'var(--text3)',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {pkg.courierService}
        </span>
      </div>

      {/* Product count */}
      <div style={{ fontSize: '11.5px', color: 'var(--text4)', marginBottom: '8px' }}>
        {itemCount} produk
      </div>

      {/* Product thumbnails */}
      {pkg.items.length > 0 && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
          aria-label={`Produk dalam ${pkg.label}`}
        >
          {pkg.items.map((item) => (
            <ProductThumbnail
              key={`${item.itemId}:${item.modelId}`}
              imageUrl={item.imageUrl}
              alt={item.itemName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * InformasiPesananSection
 *
 * Displays:
 * - Section title "Informasi Pesanan"
 * - Order SN with copy-to-clipboard action
 * - "Alamat Pengiriman" with masked recipient name, phone, and full address
 * - "Informasi Jasa Kirim" with per-package label, courier service, product
 *   count, and product thumbnails (placeholder shown when imageUrl is null or
 *   the image fails to load)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 13.3, 13.4
 */
export function InformasiPesananSection({
  orderSn,
  recipientAddress,
  packages,
}: InformasiPesananSectionProps) {
  const addressLines = buildAddressLines(recipientAddress);

  return (
    <section aria-labelledby="informasi-pesanan-title">
      {/* Section title — Requirement 3.1 */}
      <h3
        id="informasi-pesanan-title"
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text1)',
          marginBottom: '16px',
          paddingBottom: '10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        Informasi Pesanan
      </h3>

      {/* Order number with copy action — Requirement 3.2 */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text4)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
          }}
        >
          Nomor Pesanan
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <code
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              color: 'var(--text1)',
              background: 'var(--bg3)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              wordBreak: 'break-all',
            }}
          >
            {orderSn}
          </code>
          <CopyButton text={orderSn} />
        </div>
      </div>

      {/* Shipping address — Requirements 3.3, 3.5 */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text2)',
            marginBottom: '8px',
          }}
        >
          <MapPin size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          Alamat Pengiriman
        </div>

        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
          }}
        >
          {/* Masked recipient name — displayed verbatim as returned by Shopee */}
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text1)',
              marginBottom: '2px',
            }}
          >
            {recipientAddress.name}
          </div>

          {/* Masked phone — displayed verbatim */}
          <div style={{ fontSize: '12.5px', color: 'var(--text3)', marginBottom: '6px' }}>
            {recipientAddress.phone}
          </div>

          {/* Address lines */}
          {addressLines.map((line, i) => (
            <div
              key={i}
              style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: '1.5' }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Shipping service / packages — Requirements 3.4, 3.6, 13.3, 13.4 */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text2)',
            marginBottom: '8px',
          }}
        >
          <Truck size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
          Informasi Jasa Kirim
        </div>

        {packages.length === 0 ? (
          <div
            style={{
              fontSize: '12.5px',
              color: 'var(--text4)',
              fontStyle: 'italic',
              padding: '8px 0',
            }}
          >
            Tidak ada informasi paket.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {packages.map((pkg) => (
              <PackageBlock key={pkg.label} pkg={pkg} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
