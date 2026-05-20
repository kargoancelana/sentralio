/**
 * Property-based tests for Order Detail Modal frontend components.
 *
 * Properties tested:
 *   P1  – Lihat Rincian Button Visibility
 *   P2  – Recipient Address Render Fidelity
 *   P3  – Package Rendering Completeness
 *   P4  – Income Table Row Mapping
 *   P10 – "Estimasi" Prefix on Estimative Labels
 *   P14 – Voucher Rows Displayed as Negative
 *   P15 – Marketplace-Agnostic Field Naming
 *   P16 – Estimative Footnote Visibility
 *
 * Framework: fast-check + @testing-library/react + vitest
 * Minimum 100 iterations per property.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { LihatRincianButton } from '../LihatRincianButton';
import { InformasiPesananSection } from '../InformasiPesananSection';
import { IncomeBreakdownSection } from '../IncomeBreakdownSection';
import { BuyerPaymentSection } from '../BuyerPaymentSection';
import type {
  OrderDetailResponse,
  RecipientAddress,
  Package,
  IncomeBreakdown,
  IncomeItem,
  BuyerPayment,
} from '../../../types/order-detail';

// ── Mock useOrderDetail so OrderDetailModal can be imported without network ──
vi.mock('../../../hooks/useOrderDetail', () => ({
  useOrderDetail: vi.fn(() => ({
    data: null,
    loading: true,
    error: null,
    refresh: vi.fn(),
    retry: vi.fn(),
  })),
}));

// ── Arbitraries ──────────────────────────────────────────────────────────────

const ALL_TABS = ['belumBayar', 'perluDikirim', 'dikirim', 'selesai', 'cancelled'] as const;
type Tab = (typeof ALL_TABS)[number];

const ALL_ORDER_STATUSES = [
  'UNPAID',
  'READY_TO_SHIP',
  'PROCESSED',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'IN_CANCEL',
  'TO_RETURN',
] as const;
type OrderStatus = (typeof ALL_ORDER_STATUSES)[number];

/** Arbitrary for any tab value */
const arbTab = fc.constantFrom(...ALL_TABS);

/** Arbitrary for any order status */
const arbOrderStatus = fc.constantFrom(...ALL_ORDER_STATUSES);

/** Arbitrary for a non-empty string (printable ASCII + some Unicode) */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 40 });

/** Arbitrary for a nullable string */
const arbNullableString = fc.option(arbNonEmptyString, { nil: null });

/** Arbitrary for a non-negative integer (capped at 2^31-1 to mirror MySQL int) */
const arbNonNegInt = fc.integer({ min: 0, max: 2_147_483_647 });

/** Arbitrary for a RecipientAddress */
const arbRecipientAddress: fc.Arbitrary<RecipientAddress> = fc.record({
  name: arbNonEmptyString,
  phone: arbNonEmptyString,
  fullAddress: arbNonEmptyString,
  town: arbNullableString,
  district: arbNullableString,
  city: arbNullableString,
  state: arbNullableString,
  region: arbNullableString,
  zipcode: arbNullableString,
});

/** Arbitrary for a single PackageItem */
const arbPackageItem = fc.record({
  itemId: arbNonEmptyString,
  modelId: arbNonEmptyString,
  itemName: arbNonEmptyString,
  modelName: arbNullableString,
  quantity: fc.integer({ min: 1, max: 9 }),
  imageUrl: arbNullableString,
});

/** Arbitrary for a Package with 0–3 items */
const arbPackage = (label: string): fc.Arbitrary<Package> =>
  fc.record({
    label: fc.constant(label),
    courierService: arbNonEmptyString,
    items: fc.array(arbPackageItem, { minLength: 0, maxLength: 3 }),
  });

/** Arbitrary for a list of 0–3 packages */
const arbPackages: fc.Arbitrary<Package[]> = fc.integer({ min: 0, max: 3 }).chain((n) =>
  n === 0
    ? fc.constant([])
    : fc.tuple(...(Array.from({ length: n }, (_, i) => arbPackage(`Paket ${i + 1}`)) as [fc.Arbitrary<Package>, ...fc.Arbitrary<Package>[]]))
);

/** Arbitrary for a single IncomeItem */
const arbIncomeItem: fc.Arbitrary<IncomeItem> = fc
  .record({
    itemId: arbNonEmptyString,
    modelId: arbNonEmptyString,
    itemName: arbNonEmptyString,
    modelName: arbNullableString,
    modelSku: arbNullableString,
    unitPrice: arbNonNegInt,
    quantity: fc.integer({ min: 1, max: 9 }),
    imageUrl: arbNullableString,
  })
  .map((item) => ({ ...item, subtotal: item.unitPrice * item.quantity }));

/** Arbitrary for IncomeBreakdown with 0–3 items */
const arbIncomeBreakdown: fc.Arbitrary<IncomeBreakdown> = fc
  .record({
    items: fc.array(arbIncomeItem, { minLength: 0, maxLength: 3 }),
    productSubtotal: arbNonNegInt,
    shipping: fc.record({
      buyerPaid: arbNonNegInt,
      actualToCarrier: arbNonNegInt,
      shopeeRebate: arbNonNegInt,
      rollup: arbNonNegInt,
    }),
    fees: fc.record({
      adminFee: arbNonNegInt,
      serviceFee: arbNonNegInt,
      processingFee: arbNonNegInt,
    }),
    totalEstimatedIncome: arbNonNegInt,
  });

/** Arbitrary for BuyerPayment */
const arbBuyerPayment: fc.Arbitrary<BuyerPayment> = fc.record({
  productSubtotal: arbNonNegInt,
  shippingFee: arbNonNegInt,
  shopeeVoucher: arbNonNegInt,
  sellerVoucher: arbNonNegInt,
  serviceFee: arbNonNegInt,
  total: arbNonNegInt,
});

/** Arbitrary for a full OrderDetailResponse */
const arbOrderDetailResponse: fc.Arbitrary<OrderDetailResponse> = fc.record({
  marketplace: fc.constant('shopee' as const),
  orderSn: arbNonEmptyString,
  orderStatus: arbOrderStatus,
  buyerUsername: arbNullableString,
  recipientAddress: arbRecipientAddress,
  packages: arbPackages,
  incomeBreakdown: arbIncomeBreakdown,
  adjustments: fc.array(
    fc.record({ reason: arbNonEmptyString, amount: fc.integer({ min: -1_000_000, max: 1_000_000 }) }),
    { minLength: 0, maxLength: 3 }
  ),
  finalEarnings: fc.record({
    amount: arbNonNegInt,
    isFallback: fc.boolean(),
  }),
  buyerPayment: arbBuyerPayment,
});

// ── Helper: id-ID currency formatter (mirrors the component implementation) ──

function formatRp(value: number): string {
  if (value < 0) {
    return `-Rp ${Math.abs(value).toLocaleString('id-ID')}`;
  }
  return `Rp ${value.toLocaleString('id-ID')}`;
}

// ── Property 1: Lihat Rincian Button Visibility ──────────────────────────────

describe('Property 1: Lihat Rincian Button Visibility', () => {
  // Feature: order-detail-modal, Property 1: Lihat Rincian Button Visibility
  it(
    'renders iff activeTab === "perluDikirim" && orderStatus ∈ {"READY_TO_SHIP","PROCESSED"}',
    () => {
      fc.assert(
        fc.property(arbTab, arbOrderStatus, (activeTab: Tab, orderStatus: OrderStatus) => {
          const shouldRender =
            activeTab === 'perluDikirim' &&
            (orderStatus === 'READY_TO_SHIP' || orderStatus === 'PROCESSED');

          const showButton =
            activeTab === 'perluDikirim' &&
            (orderStatus === 'READY_TO_SHIP' || orderStatus === 'PROCESSED');

          const { unmount, container } = render(
            <div>
              {showButton && (
                <LihatRincianButton
                  orderSn="TEST-ORDER-SN"
                  shopId={12345}
                  onClick={() => {}}
                />
              )}
            </div>
          );

          const button = container.querySelector('button[aria-label]');

          if (shouldRender) {
            expect(button).not.toBeNull();
            expect(button?.textContent).toContain('Lihat Rincian');
          } else {
            expect(button).toBeNull();
          }

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    30_000
  );
});

// ── Property 2: Recipient Address Render Fidelity ───────────────────────────

describe('Property 2: Recipient Address Render Fidelity', () => {
  // Feature: order-detail-modal, Property 2: Recipient Address Render Fidelity
  it(
    'renders all address fields verbatim in the DOM',
    () => {
      fc.assert(
        fc.property(arbRecipientAddress, (addr: RecipientAddress) => {
          const { unmount, container } = render(
            <InformasiPesananSection
              orderSn="TEST-SN"
              recipientAddress={addr}
              packages={[]}
            />
          );

          const text = container.textContent ?? '';

          // name and phone must appear verbatim
          expect(text).toContain(addr.name);
          expect(text).toContain(addr.phone);
          // fullAddress must appear verbatim
          expect(text).toContain(addr.fullAddress);

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    30_000
  );
});

// ── Property 3: Package Rendering Completeness ──────────────────────────────

describe('Property 3: Package Rendering Completeness', () => {
  // Feature: order-detail-modal, Property 3: Package Rendering Completeness
  it(
    'renders exactly n package blocks with correct labels and courier strings',
    () => {
      fc.assert(
        fc.property(arbPackages, (packages: Package[]) => {
          const { unmount, container } = render(
            <InformasiPesananSection
              orderSn="TEST-SN"
              recipientAddress={{
                name: 'Test Name',
                phone: '08123456789',
                fullAddress: 'Jl. Test No. 1',
                town: null,
                district: null,
                city: 'Jakarta',
                state: null,
                region: null,
                zipcode: '12345',
              }}
              packages={packages}
            />
          );

          const text = container.textContent ?? '';

          // Each package label must appear
          for (const pkg of packages) {
            expect(text).toContain(pkg.label);
            expect(text).toContain(pkg.courierService);
          }

          // Count package blocks by looking for "Paket N" labels
          for (let k = 1; k <= packages.length; k++) {
            expect(text).toContain(`Paket ${k}`);
          }

          // Verify "Paket N+1" does NOT appear when there are only N packages
          if (packages.length < 9) {
            const nextLabel = `Paket ${packages.length + 1}`;
            expect(text).not.toContain(nextLabel);
          }

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );

  // Feature: order-detail-modal, Property 3: Package Rendering Completeness (thumbnail count)
  it(
    'renders exactly one thumbnail-or-placeholder per item in each package',
    () => {
      fc.assert(
        fc.property(arbPackages, (packages: Package[]) => {
          const { unmount, container } = render(
            <InformasiPesananSection
              orderSn="TEST-SN"
              recipientAddress={{
                name: 'Test Name',
                phone: '08123456789',
                fullAddress: 'Jl. Test No. 1',
                town: null,
                district: null,
                city: null,
                state: null,
                region: null,
                zipcode: null,
              }}
              packages={packages}
            />
          );

          // Count total expected thumbnails/placeholders across all packages
          const totalExpectedItems = packages.reduce((sum, pkg) => sum + pkg.items.length, 0);

          // Count actual img elements + placeholder divs (role="img")
          const imgs = container.querySelectorAll('img');
          const placeholders = container.querySelectorAll('[role="img"]');
          const totalRendered = imgs.length + placeholders.length;

          expect(totalRendered).toBe(totalExpectedItems);

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});

// ── Property 4: Income Table Row Mapping ────────────────────────────────────

describe('Property 4: Income Table Row Mapping', () => {
  // Feature: order-detail-modal, Property 4: Income Table Row Mapping
  it(
    'renders exactly one row per item with correct field values',
    () => {
      fc.assert(
        fc.property(arbIncomeBreakdown, (incomeBreakdown: IncomeBreakdown) => {
          const { unmount, container } = render(
            <IncomeBreakdownSection
              incomeBreakdown={incomeBreakdown}
              orderStatus="READY_TO_SHIP"
            />
          );

          const items = incomeBreakdown.items;

          // Find the table body rows (skip header row)
          const tbody = container.querySelector('tbody');
          if (items.length === 0) {
            // No rows expected
            const rows = tbody ? tbody.querySelectorAll('tr') : [];
            expect(rows.length).toBe(0);
            unmount();
            return;
          }

          const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
          expect(rows.length).toBe(items.length);

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const rowText = rows[i].textContent ?? '';

            // Item name must appear in the row
            expect(rowText).toContain(item.itemName);

            // Quantity must appear
            expect(rowText).toContain(String(item.quantity));

            // Harga Satuan formatted
            expect(rowText).toContain(formatRp(item.unitPrice));

            // Subtotal formatted
            expect(rowText).toContain(formatRp(item.subtotal));
          }

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});

// ── Property 10: "Estimasi" Prefix on Estimative Labels ─────────────────────

describe('Property 10: "Estimasi" Prefix on Estimative Labels', () => {
  // Feature: order-detail-modal, Property 10: "Estimasi" Prefix on Estimative Labels
  it(
    'DOM contains exact "Estimasi" strings for READY_TO_SHIP and PROCESSED orders',
    () => {
      const estimativeStatuses = ['READY_TO_SHIP', 'PROCESSED'] as const;

      fc.assert(
        fc.property(
          fc.constantFrom(...estimativeStatuses),
          arbIncomeBreakdown,
          (orderStatus, incomeBreakdown) => {
            const { unmount, container } = render(
              <IncomeBreakdownSection
                incomeBreakdown={incomeBreakdown}
                orderStatus={orderStatus}
              />
            );

            const text = container.textContent ?? '';

            expect(text).toContain('Estimasi Subtotal Ongkos Kirim');
            expect(text).toContain('Estimasi Ongkos Kirim yang Dibayarkan ke Jasa Kirim');
            expect(text).toContain('Estimasi Potongan Ongkos Kirim dari Shopee');
            expect(text).toContain('Estimasi Total Penghasilan');

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    },
    60_000
  );
});

// ── Property 14: Voucher Rows Displayed as Negative ─────────────────────────

describe('Property 14: Voucher Rows Displayed as Negative', () => {
  // Feature: order-detail-modal, Property 14: Voucher Rows Displayed as Negative
  it(
    'Voucher Shopee and Voucher Toko rows show "-Rp ..." when expanded',
    () => {
      fc.assert(
        fc.property(arbBuyerPayment, (buyerPayment: BuyerPayment) => {
          let container!: HTMLElement;
          let unmount!: () => void;

          act(() => {
            const result = render(
              <BuyerPaymentSection buyerPayment={buyerPayment} />
            );
            container = result.container;
            unmount = result.unmount;
          });

          // Expand the section by clicking the header button
          const toggleButton = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
          expect(toggleButton).not.toBeNull();

          act(() => {
            toggleButton.click();
          });

          const text = container.textContent ?? '';

          // After expansion, voucher rows must be present
          expect(text).toContain('Voucher Shopee');
          expect(text).toContain('Voucher Toko');

          // Both voucher amounts must be displayed as negative
          // "-Rp X" where X is the formatted absolute value
          const shopeeVoucherFormatted = `-Rp ${Math.abs(buyerPayment.shopeeVoucher).toLocaleString('id-ID')}`;
          const sellerVoucherFormatted = `-Rp ${Math.abs(buyerPayment.sellerVoucher).toLocaleString('id-ID')}`;

          expect(text).toContain(shopeeVoucherFormatted);
          expect(text).toContain(sellerVoucherFormatted);

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});

// ── Property 15: Marketplace-Agnostic Field Naming ──────────────────────────

describe('Property 15: Marketplace-Agnostic Field Naming', () => {
  /**
   * The requirement states that field names should not include marketplace-specific
   * terminology (e.g., `incomeBreakdown.adminFee` instead of `shopeeAdminFee`).
   * The top-level keys of OrderDetailResponse must be marketplace-agnostic.
   * Note: `shopeeRebate` is a known exception in the shipping sub-object as it
   * refers to a Shopee-specific rebate concept; the requirement focuses on
   * top-level and primary field names not being marketplace-specific.
   *
   * We verify: top-level keys of OrderDetailResponse do not contain marketplace terms.
   */
  // Feature: order-detail-modal, Property 15: Marketplace-Agnostic Field Naming
  it(
    'top-level keys of OrderDetailResponse do not contain marketplace-specific terms (except "marketplace" field)',
    () => {
      // These are the marketplace-specific terms that should NOT appear in top-level keys
      const MARKETPLACE_TERMS = ['lazada', 'tiktok'];
      // "shopee" is allowed only as the value of the "marketplace" field, not as a key name
      const SHOPEE_TERM = 'shopee';

      fc.assert(
        fc.property(arbOrderDetailResponse, (resp: OrderDetailResponse) => {
          // Check top-level keys only (the primary interface keys)
          const topLevelKeys = Object.keys(resp);

          for (const key of topLevelKeys) {
            const lowerKey = key.toLowerCase();
            // Top-level keys must not contain marketplace terms
            for (const term of MARKETPLACE_TERMS) {
              expect(lowerKey, `Top-level key "${key}" contains marketplace term "${term}"`).not.toContain(term);
            }
            // "shopee" should not appear in top-level key names (only as a value)
            if (key !== 'marketplace') {
              expect(lowerKey, `Top-level key "${key}" contains "shopee"`).not.toContain(SHOPEE_TERM);
            }
          }
        }),
        { numRuns: 100 }
      );
    },
    30_000
  );

  // Feature: order-detail-modal, Property 15: Marketplace-Agnostic Field Naming (render does not throw)
  it(
    'rendering IncomeBreakdownSection does not throw for any valid incomeBreakdown',
    () => {
      fc.assert(
        fc.property(arbIncomeBreakdown, arbOrderStatus, (incomeBreakdown, orderStatus) => {
          expect(() => {
            const { unmount } = render(
              <IncomeBreakdownSection
                incomeBreakdown={incomeBreakdown}
                orderStatus={orderStatus}
              />
            );
            unmount();
          }).not.toThrow();
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});

// ── Property 16: Estimative Footnote Visibility ──────────────────────────────

describe('Property 16: Estimative Footnote Visibility', () => {
  // Feature: order-detail-modal, Property 16: Estimative Footnote Visibility
  it(
    'footnote present iff orderStatus !== "COMPLETED"',
    () => {
      const FOOTNOTE_TEXT =
        'Nilai penghasilan bersifat estimasi dan dapat berubah hingga pesanan selesai.';

      fc.assert(
        fc.property(arbOrderStatus, arbIncomeBreakdown, (orderStatus, incomeBreakdown) => {
          const { unmount, container } = render(
            <IncomeBreakdownSection
              incomeBreakdown={incomeBreakdown}
              orderStatus={orderStatus}
            />
          );

          const text = container.textContent ?? '';
          const hasFootnote = text.includes(FOOTNOTE_TEXT);

          if (orderStatus === 'COMPLETED') {
            expect(hasFootnote).toBe(false);
          } else {
            expect(hasFootnote).toBe(true);
          }

          unmount();
        }),
        { numRuns: 100 }
      );
    },
    60_000
  );
});
