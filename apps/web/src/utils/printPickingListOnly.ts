/**
 * printPickingListOnly — Picking-list-only print flow
 *
 * Opens a new browser tab containing only the aggregated picking list,
 * with no shipping-label pages. Does NOT call markAsPrinted.
 *
 * Picking lists only need item-level data (SKU, name, variant, qty), so this
 * helper builds them locally from the orders already loaded on the page —
 * no API call to `/orders/label-data/batch` is made. This matters because that
 * batch endpoint requires every order to have a tracking number, which
 * `READY_TO_SHIP` orders do not have yet. Using local data lets users print a
 * picking list for any order regardless of shipping status.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.10, 6.12
 */

import { aggregatePickingItems, buildPickingListHtml } from './printLabel';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Minimum shape needed to build a picking list. Mirrors the relevant fields
 * from the order list response (`apps/api/src/modules/order/order.route.ts`)
 * and from cached `LabelData`.
 */
export interface PickingOrderInput {
  orderSn: string;
  items?: Array<{
    /** SKU used for grouping. Maps to `modelSku` from `shopeeOrderItems`. */
    sku?: string | null;
    modelSku?: string | null;
    /** Display name. Maps to `itemName` from `shopeeOrderItems`. */
    name?: string | null;
    itemName?: string | null;
    /** Variant. Maps to `modelName` from `shopeeOrderItems`. */
    variantName?: string | null;
    modelName?: string | null;
    qty: number;
  }>;
}

export interface PrintPickingListResult {
  /** Total orders requested */
  total: number;
  /** How many orders contributed at least one item to the picking list */
  successful: number;
  /** How many orders had no item data and were skipped */
  failed: number;
  /** Number of aggregated picking items (including "Belum di mapping" when present) */
  itemCount: number;
  /** true if a new tab was opened */
  opened: boolean;
}

export interface PrintPickingListOptions {
  /**
   * Reserved for future API-based flows. Not used by the local builder.
   * @deprecated The picking-list flow no longer calls the label-data API.
   */
  chunkSize?: number;
  /**
   * Reserved for future API-based flows. Not used by the local builder.
   * @deprecated The picking-list flow no longer calls the label-data API.
   */
  delayMs?: number;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

/**
 * Picking-list-only CSS subset — no .label-container styles.
 * Uses 4in × 6in page size.
 */
const PICKING_LIST_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, Helvetica, sans-serif; background: white; }

.picking-list-container { width:4in; height:6in; background:white; border:1px solid black; padding:20px; page-break-after:always; }
.picking-list-container:last-child { page-break-after:avoid; }
.picking-list-title { font-size:24px; font-weight:900; text-align:center; margin-bottom:20px; border-bottom:3px solid black; padding-bottom:10px; }
.picking-list-items { font-size:12px; line-height:1.6; }
.picking-list-item { padding:4px 0; }
.picking-item-name { font-weight:bold; }
.picking-item-qty { font-weight:bold; color:#333; }
.picking-list-total { font-size:14px; font-weight:900; margin-top:14px; padding-top:10px; border-top:2px solid black; text-align:right; }
.picking-total-label { font-weight:900; }
.picking-total-qty { font-weight:900; }
.picking-unmapped { margin-top:12px; padding-top:12px; border-top:2px solid #ddd; color:#999; }

@page { size: 4in 6in; margin: 0; }
@media print {
  body { background:white; padding:0; margin:0; }
  * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .print-fab, .label-count { display: none !important; }
  .picking-list-container { box-shadow:none; }
}
`;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Normalize a picking-input order into the shape expected by
 * `aggregatePickingItems` / `buildPickingListHtml` (i.e. the LabelData shape).
 */
function normalizeOrder(o: PickingOrderInput): { items: Array<{ sku: string; name: string; variantName: string; qty: number }> } {
  const items = (o.items || []).map((it) => ({
    sku: (it.sku ?? it.modelSku ?? '').toString(),
    name: (it.name ?? it.itemName ?? '').toString(),
    variantName: (it.variantName ?? it.modelName ?? it.name ?? it.itemName ?? '').toString(),
    qty: Number(it.qty) || 0,
  }));
  return { items };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build an HTML document containing only the aggregated picking list and open
 * it in a new browser tab.
 *
 * Behaviour summary:
 * 1. Empty input → return early with all-zero result, no work done (Req 6.10)
 * 2. Normalize every input order into `{ items: [...] }` (no API call)
 * 3. Treat orders that contribute at least one item as successful, others as failed
 * 4. If no successful items aggregated → throw `Error('Tidak ada data picking list')` (Req 6.12)
 * 5. Build HTML with picking-list CSS subset and `@page 4in 6in` (Req 6.3, 6.4, 6.6)
 * 6. `window.open(blobUrl, '_blank')` → throw `Error('Popup blocked')` if `null` (Req 6.7, 6.8)
 * 7. Return result counts (Req 6.2, 6.5)
 */
export async function printPickingListOnly(
  orders: PickingOrderInput[],
  _options?: PrintPickingListOptions,
): Promise<PrintPickingListResult> {
  // Req 6.10: empty input no-op
  if (!orders || orders.length === 0) {
    return { total: 0, successful: 0, failed: 0, itemCount: 0, opened: false };
  }

  const total = orders.length;
  const allLabelData: Array<{ items: Array<{ sku: string; name: string; variantName: string; qty: number }> }> = [];
  let successful = 0;
  let failed = 0;

  for (const o of orders) {
    const normalized = normalizeOrder(o);
    if (normalized.items.length === 0) {
      failed++;
      continue;
    }
    allLabelData.push(normalized);
    successful++;
  }

  // Req 6.12: no data → throw
  if (allLabelData.length === 0) {
    throw new Error('Tidak ada data picking list');
  }

  // Req 6.2, 6.5: aggregate using shared helper
  const pickingItems = aggregatePickingItems(allLabelData);
  const itemCount = pickingItems.length;

  // Req 6.3, 6.4, 6.6: build HTML — no .label-container, only picking list
  const pickingListHtml = buildPickingListHtml(allLabelData);

  const fullHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Picking List (${successful} pesanan)</title>
  <style>${PICKING_LIST_CSS}
    body { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; background: #f3f4f6; }
    .picking-list-container { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .print-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: #2563eb; color: white; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s, box-shadow .15s;
    }
    .print-fab:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    .print-fab:active { transform: scale(0.95); }
    .print-fab svg { width: 24px; height: 24px; }
    .label-count {
      position: fixed; bottom: 24px; left: 24px; z-index: 9999;
      background: rgba(0,0,0,0.7); color: white; padding: 8px 16px;
      border-radius: 20px; font-size: 13px; font-weight: 500;
    }
  </style>
</head>
<body>
  ${pickingListHtml}
  <div class="label-count">${successful} pesanan · ${itemCount} item</div>
  <button class="print-fab" onclick="window.print()" title="Cetak Picking List" aria-label="Cetak Picking List">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
  </button>
</body>
</html>`;

  // Req 6.7: open in new tab via blob URL
  const htmlBlob = new Blob([fullHtml], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(htmlBlob);

  const printWindow = window.open(blobUrl, '_blank');

  // Req 6.8: throw if popup blocked
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl);
    throw new Error('Popup blocked');
  }

  printWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(blobUrl));

  return { total, successful, failed, itemCount, opened: true };
}
