/**
 * Print Label Utilities
 *
 * Direct-to-tab print flow for both Custom and Official labels.
 * No preview modal — clicking the menu item opens a new tab with the rendered
 * label and auto-triggers the browser print dialog.
 *
 * Two entry points:
 * - printCustomLabels(labels) — render HTML labels with barcode/QR + picking list
 * - printOfficialLabels(pdfUrls, orderSns) — merge PDFs + append picking list pages
 *
 * Both auto-mark orders as printed via API.
 */

import { api } from '../lib/api';
import type { LabelData } from '../types/label';
import type { PDFDocument as PDFDoc } from 'pdf-lib';
// Task 5: bundle barcode/QR libraries locally instead of loading from CDN
import jsBarcodeSource from 'jsbarcode/dist/JsBarcode.all.min.js?raw';
import qriousSource from 'qrious/dist/qrious.min.js?raw';

// ─── Shared types ──────────────────────────────────
export interface PickingItem {
  sku: string;
  variantName: string;
  qty: number;
}

/**
 * Sentinel SKU value used to group items with empty or "-" SKU under a single
 * "Belum di mapping" picking-list entry. Items keyed with this sentinel are
 * always placed at the end of the aggregated picking list (when present).
 */
export const UNMAPPED_SKU_SENTINEL = '__unmapped__';

// ─── Common helpers ──────────────────────────────
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Mark orders as printed (fire-and-forget, non-critical)
 */
async function markAsPrinted(orderSns: string[]): Promise<void> {
  if (orderSns.length === 0) return;
  try {
    if (orderSns.length === 1) {
      await api.orderMarkLabelPrinted(orderSns[0], true);
    } else {
      await api.orderMarkLabelPrintedBatch(orderSns, true);
    }
  } catch (err) {
    console.warn('[printLabel] Failed to mark as printed (non-critical):', err);
  }
}


/**
 * Aggregate items by SKU into a sorted picking list.
 *
 * Items with an empty or "-" SKU are merged into a single trailing entry keyed
 * by `UNMAPPED_SKU_SENTINEL` and labeled "Belum di mapping". When that entry
 * exists, it is always placed as the LAST element of the returned list so that
 * downstream renderers can show it after the mapped SKUs.
 */
export function aggregatePickingItems(dataList: any[]): PickingItem[] {
  const skuMap = new Map<string, PickingItem>();
  let unmappedQty = 0;

  for (const label of dataList) {
    for (const item of (label.items || [])) {
      const sku = (item.sku || '').toLowerCase().trim();
      if (!sku || sku === '-') {
        unmappedQty += item.qty;
        continue;
      }
      if (skuMap.has(sku)) {
        skuMap.get(sku)!.qty += item.qty;
      } else {
        skuMap.set(sku, {
          sku: item.sku,
          variantName: item.variantName || item.name || sku,
          qty: item.qty,
        });
      }
    }
  }

  const pickingItems = Array.from(skuMap.values()).sort((a, b) =>
    a.variantName.localeCompare(b.variantName)
  );
  if (unmappedQty > 0) {
    pickingItems.push({ sku: UNMAPPED_SKU_SENTINEL, variantName: 'Belum di mapping', qty: unmappedQty });
  }
  return pickingItems;
}

// ─── CUSTOM LABEL: HTML generation ──────────────────────
const LABEL_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, Helvetica, sans-serif; background: white; }

.label-container { width:4in; height:6in; background:white; border:1px solid black; padding:4px; page-break-after:always; }
.label-container:last-child { page-break-after:avoid; }

.recipient-section img {
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
  image-rendering: high-quality;
}

.header { display:grid; grid-template-columns:1.3fr 1fr 1.2fr; border-bottom:1px solid black; height:0.65in; }
.logo-section { border-right:1px solid black; padding:8px 10px; display:flex; flex-direction:column; justify-content:center; align-items:center; }
.spx-text { font-size:32px; font-weight:900; letter-spacing:2px; line-height:0.9; }
.express-text { font-size:9px; font-weight:bold; letter-spacing:1px; margin-top:-2px; }
.service-type { border-right:1px solid black; padding:6px 8px; display:flex; align-items:center; justify-content:center; }
.std-label { font-size:32px; font-weight:900; letter-spacing:3px; }
.order-info { padding:6px 8px; display:flex; flex-direction:column; justify-content:center; }
.order-label { font-size:7px; margin-bottom:2px; }
.order-number { font-size:13px; font-weight:bold; letter-spacing:0.5px; margin-bottom:2px; }
.order-date { font-size:10px; }

.barcode-section { padding:6px 12px 1px; border-bottom:1px dashed black; }
.barcode-top { display:flex; gap:6px; margin-bottom:3px; justify-content:space-between; }
.sort-code-box { border:1px solid black; padding:3px 6px; text-align:center; display:flex; align-items:center; justify-content:center; min-width:60px; }
.sort-value { font-size:10px; font-weight:bold; letter-spacing:0.4px; }
.tracking-box { border:1px solid black; padding:4px 8px; display:flex; align-items:center; }
.tracking-text { font-size:9px; font-weight:bold; letter-spacing:0.3px; }
.barcode-main { display:flex; align-items:center; gap:8px; height:55px; }
.batch-code-box { border:1px solid black; padding:0 10px; text-align:center; flex-shrink:0; width:80px; display:flex; align-items:center; justify-content:center; height:100%; }
.batch-value { font-size:12px; font-weight:bold; letter-spacing:0.5px; }
.barcode { flex:1; height:100%; margin-left:8px; }
.barcode svg { width:100%; height:100%; }

.recipient-section { padding:6px 12px 3px; border-bottom:1px solid black; display:grid; grid-template-columns:1fr auto; gap:10px; align-items:start; }
.recipient-header { display:flex; justify-content:flex-start; align-items:center; margin-bottom:2px; gap:4px; }
.recipient-label { font-size:8px; font-weight:bold; }
.contact-info { font-size:8px; line-height:1.4; margin-bottom:2px; }
.address { display:flex; gap:4px; align-items:flex-start; }
.sender-info { margin-top:2px; padding-top:2px; }
.sender-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; gap:8px; }
.sender-label { font-size:8px; font-weight:bold; margin-right:6px; }
.sender-name { font-size:9px; font-weight:bold; }
.sender-city { font-size:8px; }
.recipient-qr { flex-shrink:0; padding-right:0; margin-left:auto; padding-left:12px; }
.qr-code { width:80px; height:80px; padding:0; background:transparent; }
.qr-code canvas { width:100% !important; height:100% !important; }

.order-details { margin:2px 12px; }
.details-header { background:black; color:white; padding:3px 6px; font-size:8px; font-weight:bold; letter-spacing:0.4px; }
.details-table { width:100%; border-collapse:collapse; font-size:9px; border:1px solid black; border-top:none; }
.details-table th { background:white; border:1px solid black; padding:2px 2px; font-weight:bold; text-align:center; font-size:8px; }
.details-table td { border:1px solid black; padding:2px 2px; text-align:center; line-height:1.2; }
.details-table td:first-child { width:8%; }
.details-table td:nth-child(2) { width:50%; text-align:left; max-height:2.4em; overflow:hidden; }
.details-table td:nth-child(3) { width:28%; text-align:left; }
.details-table td:last-child { width:14%; }

.footer-section { display:grid; grid-template-columns:1.1fr 1.2fr 0.7fr; gap:6px; padding:0 12px 2px; margin-bottom:2px; }
.shipping-info { display:flex; flex-direction:column; gap:6px; }
.weight-box, .deadline-box { border:1px solid black; border-radius:4px; padding:4px 6px; }
.weight-label, .deadline-label { font-size:7px; font-weight:bold; margin-bottom:2px; }
.weight-value { font-size:11px; font-weight:bold; display:flex; align-items:center; gap:4px; }
.deadline-box .deadline-label { background:black; color:white; margin:-4px -6px 4px -6px; padding:3px 6px; text-align:center; border-radius:3px 3px 0 0; font-size:8px; }
.deadline-value { font-size:11px; font-weight:bold; line-height:1.3; margin-bottom:2px; }
.deadline-note { font-size:7px; line-height:1.2; }
.warning-box { border:1px solid black; border-radius:4px; padding:4px 5px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.warning-icon { font-size:18px; filter:grayscale(100%) contrast(200%); margin-bottom:1px; }
.warning-title { font-size:9px; font-weight:bold; margin-bottom:1px; }
.warning-text { font-size:10px; font-weight:bold; margin-bottom:2px; }
.warning-note { font-size:8px; line-height:1.3; }
.total-qty { border:1px solid black; border-radius:4px; padding:5px; text-align:center; display:flex; flex-direction:column; justify-content:center; }
.qty-label { font-size:7px; font-weight:bold; margin-bottom:1px; }
.qty-number { font-size:36px; font-weight:900; line-height:1; }
.qty-unit { font-size:9px; font-weight:bold; }
.bottom-message { text-align:center; font-size:10px; font-weight:bold; padding:2px; border-top:1px solid black; border-bottom:1px solid black; }

.picking-list-container { width:4in; height:6in; background:white; border:1px solid black; padding:20px; page-break-after:avoid; }
.picking-list-title { font-size:24px; font-weight:900; text-align:center; margin-bottom:20px; border-bottom:3px solid black; padding-bottom:10px; }
.picking-list-items { font-size:12px; line-height:1.6; }
.picking-list-item { padding:4px 0; }
.picking-item-name { font-weight:bold; }
.picking-item-qty { font-weight:bold; color:#333; }
.picking-unmapped { margin-top:12px; padding-top:12px; border-top:2px solid #ddd; color:#999; }
.picking-list-total { font-size:14px; font-weight:900; margin-top:14px; padding-top:10px; border-top:2px solid black; text-align:right; }
.picking-total-label { font-weight:900; }
.picking-total-qty { font-weight:900; }

@page { size: 4in 6in; margin: 0; }
@media print {
  body { background:white; padding:0; margin:0; }
  .label-container { box-shadow:none; }
  * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
`;


function buildLabelHtml(data: any): string {
  const { recipient, sender, items } = data;

  const recipientNameHtml = recipient.nameImg && recipient.nameImg.trim() !== ''
    ? `<img src="${recipient.nameImg}" style="max-width:200px;height:auto;object-fit:contain;vertical-align:middle;image-rendering:high-quality;display:inline-block;" />`
    : '<span style="font-size:9px;font-weight:bold;">N/A</span>';

  const recipientAddressHtml = recipient.addressImg && recipient.addressImg.trim() !== ''
    ? `<img src="${recipient.addressImg}" style="height:auto;max-width:100%;object-fit:contain;image-rendering:high-quality;" />`
    : '<span>Alamat tidak tersedia</span>';

  const itemsHtml = items.length > 0
    ? items.map((item: any, i: number) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(item.name)}</td>
          <td>${esc(item.variantName)}</td>
          <td>${item.qty}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:8px;">Tidak ada item</td></tr>';

  return `
<div class="label-container">
  <div class="header">
    <div class="logo-section">
      <div class="spx-logo"><div class="spx-text">SPX</div><div class="express-text">EXPRESS</div></div>
    </div>
    <div class="service-type"><div class="std-label">${esc(data.serviceType)}</div></div>
    <div class="order-info">
      <div class="order-label">No. Pesanan</div>
      <div class="order-number">${esc(data.orderSn)}</div>
      <div class="order-date">${esc(data.orderDate)}</div>
    </div>
  </div>

  <div class="barcode-section">
    <div class="barcode-top">
      <div class="sort-code-box"><div class="sort-value">${esc(data.batchCode || '-')}</div></div>
      <div class="tracking-box"><span class="tracking-text">Nomor Resi : ${esc(data.trackingNumber || '-')}</span></div>
    </div>
    <div class="barcode-main">
      <div class="batch-code-box"><div class="batch-value">${esc(data.sortCode || '-')}</div></div>
      <div class="barcode"><svg id="bc-${esc(data.orderSn)}" data-value="${esc(data.trackingNumber)}"></svg></div>
    </div>
  </div>

  <div class="recipient-section">
    <div class="recipient-info">
      <div class="recipient-header"><span class="recipient-label">PENERIMA</span>${recipientNameHtml}</div>
      <div class="contact-info"><div class="address-text">${recipientAddressHtml}</div></div>
      <div class="sender-info">
        <div class="sender-header">
          <div><span class="sender-label">PENGIRIM</span><span class="sender-name">${esc(sender.name)}</span></div>
        </div>
        <div class="sender-city">${esc(sender.city)}</div>
      </div>
    </div>
    <div class="recipient-qr">
      <div class="qr-code"><canvas id="qr-${esc(data.orderSn)}" data-value="${esc(data.trackingNumber)}"></canvas></div>
    </div>
  </div>

  <div class="order-details">
    <div class="details-header">DAFTAR PRODUK</div>
    <table class="details-table">
      <thead><tr><th>#</th><th>Nama Produk</th><th>SKU / Variasi</th><th>Qty</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>

  <div class="footer-section">
    <div class="shipping-info">
      <div class="weight-box">
        <div class="weight-label">⚖ BERAT</div>
        <div class="weight-value">${esc(data.weight || '-')}</div>
      </div>
      <div class="deadline-box">
        <div class="deadline-label">⏰ BATAS KIRIM</div>
        <div class="deadline-value">${esc(data.shipByDate || '-')}</div>
        <div class="deadline-note">${esc(data.shipByTime || '')}</div>
      </div>
    </div>
    <div class="warning-box">
      <div class="warning-icon">📹</div>
      <div class="warning-title">PERINGATAN</div>
      <div class="warning-text">WAJIB VIDEO UNBOXING</div>
      <div class="warning-note">Tanpa video unboxing, komplain / retur tidak dapat kami proses</div>
    </div>
    <div class="total-qty">
      <div class="qty-label">TOTAL</div>
      <div class="qty-number">${data.totalQty}</div>
      <div class="qty-unit">PCS</div>
    </div>
  </div>

  <div class="bottom-message">Terima kasih sudah berbelanja! 🛍</div>
</div>`;
}


export function buildPickingListHtml(dataList: any[]): string {
  const allItems = aggregatePickingItems(dataList);
  if (allItems.length === 0) return '';

  const ITEMS_PER_PAGE = 20;
  const pages: PickingItem[][] = [];
  for (let i = 0; i < allItems.length; i += ITEMS_PER_PAGE) {
    pages.push(allItems.slice(i, i + ITEMS_PER_PAGE));
  }

  // Aggregate total pcs across ALL items, shown only on the last page so the
  // user reads it once after walking through every variant. Showing it per
  // page would be confusing — it's a per-batch grand total, not per-page.
  const totalQty = allItems.reduce((sum, it) => sum + it.qty, 0);

  return pages.map((pageItems, pageIdx) => {
    const itemsHtml = pageItems.map(item => {
      const isUnmapped = item.sku === UNMAPPED_SKU_SENTINEL;
      return `<div class="picking-list-item${isUnmapped ? ' picking-unmapped' : ''}">
        <span class="picking-item-name">${esc(item.variantName)} : </span><span class="picking-item-qty">${item.qty}pcs</span>
      </div>`;
    }).join('');
    const pageLabel = pages.length > 1 ? ` (${pageIdx + 1}/${pages.length})` : '';
    const isLastPage = pageIdx === pages.length - 1;
    const totalHtml = isLastPage
      ? `<div class="picking-list-total"><span class="picking-total-label">Total</span> : <span class="picking-total-qty">${totalQty}pcs</span></div>`
      : '';
    return `<div class="picking-list-container">
  <div class="picking-list-title">PICKING LIST${pageLabel}</div>
  <div class="picking-list-items">${itemsHtml}</div>
  ${totalHtml}
</div>`;
  }).join('\n');
}


// ─── PUBLIC: Custom Label Print ──────────────────────────
/**
 * Open a new tab with rendered custom labels + picking list.
 *
 * Uses direct HTML Blob approach — instant for any batch size.
 * Labels render with barcode/QR in the new tab via CDN scripts.
 * User clicks the floating print button when ready to print.
 *
 * Performance: 32 labels opens in <1s (vs 60s+ with html2canvas→PDF approach).
 *
 * @param labelData - Single LabelData or array
 * @param onPrintComplete - Optional callback after the print tab is opened
 */
export async function printCustomLabels(
  labelData: LabelData | LabelData[],
  onPrintComplete?: () => void
): Promise<void> {
  const labels = Array.isArray(labelData) ? labelData : [labelData];

  if (labels.length === 0) {
    throw new Error('Tidak ada label untuk dicetak');
  }

  const labelsHtml = labels.map(label => buildLabelHtml(label)).join('\n');
  const pickingListHtml = buildPickingListHtml(labels);
  const allHtml = labelsHtml + '\n' + pickingListHtml;

  const fullHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Label Pengiriman (${labels.length} label)</title>
  <!-- Task 5: bundled locally, no CDN dependency -->
  <script>${jsBarcodeSource}<\/script>
  <script>${qriousSource}<\/script>
  <style>${LABEL_CSS}
    body { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; background: #f3f4f6; }
    .label-container, .picking-list-container { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
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
    @media print {
      body { background: white; padding: 0; gap: 0; }
      .print-fab, .label-count { display: none !important; }
      .label-container, .picking-list-container { box-shadow: none; }
    }
  </style>
</head>
<body>
  ${allHtml}
  <div class="label-count">${labels.length} label + picking list</div>
  <button class="print-fab" onclick="window.print()" title="Cetak Label" aria-label="Cetak Label">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
  </button>
  <script>
    var renderDone = false;

    function renderBarcodes() {
      if (typeof JsBarcode === 'undefined') return;
      document.querySelectorAll('svg[id^="bc-"]').forEach(function(svg) {
        var val = svg.getAttribute('data-value');
        if (!val) return;
        try {
          JsBarcode(svg, val, { format:'CODE128', width:2, height:50, displayValue:false, margin:0 });
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
        } catch(e) {}
      });
    }

    function renderQRCodes() {
      if (typeof QRious === 'undefined') return;
      document.querySelectorAll('canvas[id^="qr-"]').forEach(function(canvas) {
        var val = canvas.getAttribute('data-value');
        if (!val) return;
        try {
          new QRious({ element: canvas, value: val, size: 66, level: 'M', padding: 1 });
        } catch(e) {}
      });
    }

    if (!renderDone) {
      renderDone = true;
      renderBarcodes();
      setTimeout(function() { renderQRCodes(); }, 100);
    }
  <\/script>
</body>
</html>`;

  // Create HTML Blob and open in new tab — instant, no canvas rendering needed
  const htmlBlob = new Blob([fullHtml], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(htmlBlob);

  const printWindow = window.open(blobUrl, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl);
    throw new Error('Popup blocked. Izinkan popup untuk mencetak.');
  }
  printWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(blobUrl));

  // Mark as printed (fire-and-forget)
  const orderSns = labels.map(label => label.orderSn);
  markAsPrinted(orderSns).catch(() => {});

  onPrintComplete?.();
}


// ─── PUBLIC: Official Label Print ───────────────────────
/**
 * Merge official PDF labels, append picking list pages, open in new tab and trigger print.
 *
 * @param pdfUrl - Single PDF data URL or array of URLs
 * @param orderSn - Single order SN or array
 * @param onPrintComplete - Optional callback after the print tab is opened
 * @param localOrders - Optional local order data to build picking list without API call (Task 4 optimisation)
 */
export async function printOfficialLabels(
  pdfUrl: string | string[],
  orderSn: string | string[],
  onPrintComplete?: () => void,
  localOrders?: Array<{ orderSn: string; items?: Array<{ sku?: string | null; modelSku?: string | null; name?: string | null; itemName?: string | null; variantName?: string | null; modelName?: string | null; qty: number }> }>
): Promise<void> {
  const pdfUrls = Array.isArray(pdfUrl) ? pdfUrl : [pdfUrl];
  const orderSns = Array.isArray(orderSn) ? orderSn : [orderSn];

  if (pdfUrls.length === 0 || !pdfUrls[0]) {
    throw new Error('Tidak ada PDF label untuk dicetak');
  }

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  // Helper: decode base64 data URL to Uint8Array without blocking main thread
  async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
    const res = await fetch(dataUrl);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Convert PDF data URL(s) to bytes and merge into single document
  let mergedPdf: PDFDoc;

  if (pdfUrls.length === 1 && pdfUrls[0]) {
    const url = pdfUrls[0];
    const data = url.startsWith('data:')
      ? await dataUrlToBytes(url)
      : new Uint8Array(await (await fetch(url)).arrayBuffer());
    mergedPdf = await PDFDocument.load(data);
  } else {
    mergedPdf = await PDFDocument.create();
    for (const url of pdfUrls) {
      if (!url) continue;
      const data = url.startsWith('data:')
        ? await dataUrlToBytes(url)
        : new Uint8Array(await (await fetch(url)).arrayBuffer());
      const pdf = await PDFDocument.load(data);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
    }
  }

  // ─── PICKING LIST — DO NOT REMOVE ───────────────────────────────────────────
  // Dipulihkan dari faed36b9^ (PR #145 fix regresi). Jangan hapus — regression
  // akan menghilangkan lembar picking list dari cetak label resmi batch.
  // Task 4: gunakan data lokal (localOrders) jika tersedia → skip API call.
  // Output picking list IDENTIK baik pakai data lokal maupun API.
  // ─────────────────────────────────────────────────────────────────────────────

  let pickingItems: PickingItem[] = [];
  if (localOrders && localOrders.length > 0) {
    // Task 4: gunakan data lokal, tidak perlu API call ke /label-data/batch
    const normalized = localOrders.map(o => ({
      items: (o.items || []).map(it => ({
        sku: (it.sku ?? it.modelSku ?? '').toString(),
        name: (it.name ?? it.itemName ?? '').toString(),
        variantName: (it.variantName ?? it.modelName ?? it.name ?? it.itemName ?? '').toString(),
        qty: Number(it.qty) || 0,
      })),
    }));
    pickingItems = aggregatePickingItems(normalized);
  } else {
    // Fallback: fetch dari API saat localOrders tidak tersedia
    try {
      const result = await api.orderLabelDataBatch(orderSns);
      if (result.success && result.data) {
        const items = result.data.results.filter((r: any) => r.success && r.data).map((r: any) => r.data);
        if (items.length > 0) {
          pickingItems = aggregatePickingItems(items);
        }
      }
    } catch {
      // Picking list is optional — proceed without it
    }
  }

  // Append picking list page(s) using pdf-lib text drawing
  if (pickingItems.length > 0) {
    const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

    // Page dimensions: 4x6 inches = 288x432 points
    const PAGE_WIDTH = 288;
    const PAGE_HEIGHT = 432;
    const MARGIN_X = 18;
    const MARGIN_TOP = 30;
    const TITLE_SIZE = 18;
    const ITEM_SIZE = 9;
    const LINE_HEIGHT = 13;
    const ITEMS_PER_PAGE = 20;

    const pickingPages: PickingItem[][] = [];
    for (let i = 0; i < pickingItems.length; i += ITEMS_PER_PAGE) {
      pickingPages.push(pickingItems.slice(i, i + ITEMS_PER_PAGE));
    }

    // Grand total across all picking items, drawn only on the last page so
    // the user reads it once after walking through every variant. Mirrors
    // the HTML picking list behavior in `buildPickingListHtml`.
    const totalQty = pickingItems.reduce((sum, it) => sum + it.qty, 0);

    for (let pageIdx = 0; pageIdx < pickingPages.length; pageIdx++) {
      const page = mergedPdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      let y = PAGE_HEIGHT - MARGIN_TOP;

      const titleText = pickingPages.length > 1
        ? `PICKING LIST (${pageIdx + 1}/${pickingPages.length})`
        : 'PICKING LIST';
      const titleWidth = fontBold.widthOfTextAtSize(titleText, TITLE_SIZE);
      page.drawText(titleText, {
        x: (PAGE_WIDTH - titleWidth) / 2,
        y,
        size: TITLE_SIZE,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= 8;

      page.drawLine({
        start: { x: MARGIN_X, y },
        end: { x: PAGE_WIDTH - MARGIN_X, y },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });
      y -= 18;

      for (const item of pickingPages[pageIdx]!) {
        const isUnmapped = item.sku === UNMAPPED_SKU_SENTINEL;
        const textColor = isUnmapped ? rgb(0.5, 0.5, 0.5) : rgb(0, 0, 0);

        if (isUnmapped) {
          y -= 4;
          page.drawLine({
            start: { x: MARGIN_X, y: y + 6 },
            end: { x: PAGE_WIDTH - MARGIN_X, y: y + 6 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
          });
          y -= 4;
        }

        const qtyText = ` : ${item.qty}pcs`;
        const maxNameWidth = PAGE_WIDTH - (2 * MARGIN_X) - fontRegular.widthOfTextAtSize(qtyText, ITEM_SIZE);
        let variantName = item.variantName;
        while (fontRegular.widthOfTextAtSize(variantName, ITEM_SIZE) > maxNameWidth && variantName.length > 3) {
          variantName = variantName.slice(0, -4) + '...';
        }

        page.drawText(variantName, {
          x: MARGIN_X,
          y,
          size: ITEM_SIZE,
          font: fontBold,
          color: textColor,
        });
        const nameWidth = fontBold.widthOfTextAtSize(variantName, ITEM_SIZE);
        page.drawText(qtyText, {
          x: MARGIN_X + nameWidth,
          y,
          size: ITEM_SIZE,
          font: fontRegular,
          color: textColor,
        });

        y -= LINE_HEIGHT;
      }

      // Draw grand total on the last page (right-aligned, below a separator line).
      const isLastPage = pageIdx === pickingPages.length - 1;
      if (isLastPage) {
        y -= 4;
        page.drawLine({
          start: { x: MARGIN_X, y },
          end: { x: PAGE_WIDTH - MARGIN_X, y },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        y -= 14;

        const TOTAL_SIZE = 11;
        const totalText = `Total : ${totalQty}pcs`;
        const totalWidth = fontBold.widthOfTextAtSize(totalText, TOTAL_SIZE);
        page.drawText(totalText, {
          x: PAGE_WIDTH - MARGIN_X - totalWidth,
          y,
          size: TOTAL_SIZE,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  // Save final PDF and open directly — yield between heavy operations
  await new Promise(r => setTimeout(r, 0));
  const pdfBytes = await mergedPdf.save();
  const pdfBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const pdfBlobUrl = URL.createObjectURL(pdfBlob);

  const printWindow = window.open(pdfBlobUrl, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(pdfBlobUrl);
    throw new Error('Popup blocked. Izinkan popup untuk mencetak.');
  }
  // No auto-print — browser's built-in PDF viewer already shows a print button in its toolbar
  printWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(pdfBlobUrl));

  // Mark as printed (fire-and-forget)
  markAsPrinted(orderSns).catch(() => {});

  onPrintComplete?.();
}
