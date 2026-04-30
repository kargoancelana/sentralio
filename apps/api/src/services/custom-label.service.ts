/**
 * Custom Label Service
 * 
 * Generates custom shipping labels using the HTML/CSS template (label.html + label.css)
 * populated with real order data from Shopee API and local database.
 * 
 * Data sources:
 * 1. DB: shopee_orders (orderSn, trackingNumber, shippingCarrier, shopId, createTime)
 * 2. DB: shopee_order_items (itemName, modelName, qty)
 * 3. Shopee API: get_order_detail (recipient_address, ship_by_date)
 * 4. Shopee API: get_shipping_document_data_info (sort codes, 3PL info, weight)
 * 
 * Rendering: HTML template + JsBarcode + QRCode → Puppeteer → PDF
 */

import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { shopeeOrders, shopeeOrderItems } from '../db/schema';
import { getShopeeOrderDetails } from './shopee-raw';
import { getShippingDocumentDataInfo } from './shopee-label';
import { generateLabelPdf, generateBatchLabelPdf } from './pdf-generator.service';
import JsBarcode from 'jsbarcode';
import { DOMImplementation, XMLSerializer } from 'xmldom';
import QRCode from 'qrcode';

// ─── Template Cache ─────────────────────────────────────────────
// Read once at startup, reuse for every render
const TEMPLATE_DIR = path.resolve(__dirname, '../../../../');
const TEMPLATE_CSS = fs.readFileSync(path.join(TEMPLATE_DIR, 'label.css'), 'utf-8');

// ─── Sender Config ──────────────────────────────────────────────
// From environment variables (configurable per deployment)
const SENDER_NAME = process.env.SHOP_NAME || 'Nama Toko Anda';
const SENDER_PHONE = process.env.SHOP_PHONE || '0821-9876-5432';
const SENDER_CITY = process.env.SHOP_CITY || 'Jakarta';

// ─── Types ──────────────────────────────────────────────────────
interface CustomLabelData {
  // Header
  shippingCarrier: string;
  serviceType: string;
  orderSn: string;
  orderDate: string;

  // Barcode section
  sortCode: string;
  trackingNumber: string;
  batchCode: string;

  // Recipient
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string[];

  // Sender
  senderName: string;
  senderPhone: string;
  senderCity: string;

  // Items
  items: Array<{
    name: string;
    sku: string;
    qty: number;
  }>;

  // Footer
  weight: string;
  shipByDate: string;
  shipByTime: string;
  totalQty: number;
}

// ─── Barcode Generation (server-side via xmldom) ────────────────
function generateBarcodeSvg(text: string): string {
  try {
    const doc = new DOMImplementation().createDocument(
      'http://www.w3.org/1999/xhtml', 'html', null
    );
    const svgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, text, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: false,
      margin: 0
    });
    // Serialize and add width/height so it fits inside the .barcode container
    let svgStr = new XMLSerializer().serializeToString(svgNode);
    // Ensure the SVG fills its parent container
    svgStr = svgStr.replace('<svg ', '<svg width="100%" height="100%" ');
    return svgStr;
  } catch (err: any) {
    console.warn('[custom-label] barcode generation failed:', err.message, err.stack);
    // Fallback: return placeholder barcode-like SVG
    return `<svg viewBox="0 0 280 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><text x="140" y="30" text-anchor="middle" font-size="10">${text}</text></svg>`;
  }
}

// ─── QR Code Generation ─────────────────────────────────────────
async function generateQrSvg(text: string): Promise<string> {
  try {
    let svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 70,
      errorCorrectionLevel: 'M'
    });
    // Force width/height to fit .qr-code container (70x70px)
    svg = svg.replace(/<svg /, '<svg width="70" height="70" ');
    return svg;
  } catch (err: any) {
    console.warn('[custom-label] QR generation failed:', err.message);
    return '<svg viewBox="0 0 100 100" width="70" height="70" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="white" stroke="black"/></svg>';
  }
}

// ─── Date Formatting ────────────────────────────────────────────
function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${d}-${m}-${y} ${h}:${min}`;
}

function formatDateOnly(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

// ─── HTML Escaping ──────────────────────────────────────────────
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Data Collection ────────────────────────────────────────────
async function collectLabelData(orderSn: string): Promise<CustomLabelData> {
  // 1. Get order from DB
  const orderRows = await db.select().from(shopeeOrders)
    .where(eq(shopeeOrders.orderSn, orderSn)).limit(1);
  
  if (orderRows.length === 0) {
    throw new Error(`Order ${orderSn} tidak ditemukan`);
  }
  const order = orderRows[0];
  const shopId = order.shopId;

  // 2. Get order items from DB
  const items = await db.select().from(shopeeOrderItems)
    .where(eq(shopeeOrderItems.orderSn, orderSn));

  // 3. Get recipient address + ship_by_date + package_number from Shopee API (single call)
  let recipientName = 'N/A';
  let recipientPhone = 'N/A';
  let recipientAddress: string[] = ['Alamat tidak tersedia'];
  let shipByDate = '';
  let shipByTime = '23:59 WIB';
  let packageNumber: string | undefined;

  try {
    const detailRes = await getShopeeOrderDetails(shopId, [orderSn]);
    const orderDetail = detailRes?.response?.order_list?.[0];
    
    // Debug: log what we got from the API
    console.log(`[custom-label] order detail for ${orderSn}:`, {
      hasOrderDetail: !!orderDetail,
      hasRecipientAddress: !!orderDetail?.recipient_address,
      recipientKeys: orderDetail?.recipient_address ? Object.keys(orderDetail.recipient_address) : [],
      recipientName: orderDetail?.recipient_address?.name,
      recipientPhone: orderDetail?.recipient_address?.phone,
      hasFullAddress: !!orderDetail?.recipient_address?.full_address,
      shipByDate: orderDetail?.ship_by_date,
      packageList: orderDetail?.package_list?.length || 0,
    });
    
    if (orderDetail?.recipient_address) {
      const addr = orderDetail.recipient_address;
      recipientName = addr.name || recipientName;
      recipientPhone = addr.phone || recipientPhone;
      
      // Build address lines
      const lines: string[] = [];
      if (addr.full_address) lines.push(addr.full_address);
      else {
        if (addr.district) lines.push(`Kec. ${addr.district}`);
        if (addr.city) lines.push(addr.city);
        if (addr.state) lines.push(addr.state);
        if (addr.zipcode) lines.push(addr.zipcode);
      }
      if (lines.length > 0) recipientAddress = lines;
    }

    // ship_by_date is a unix timestamp
    if (orderDetail?.ship_by_date) {
      const shipDate = new Date(orderDetail.ship_by_date * 1000);
      shipByDate = formatDateOnly(shipDate);
      shipByTime = `${shipDate.getHours().toString().padStart(2, '0')}:${shipDate.getMinutes().toString().padStart(2, '0')} WIB`;
    }

    // Package number (reuse same API response, no second call needed)
    if (orderDetail?.package_list?.[0]?.package_number) {
      packageNumber = orderDetail.package_list[0].package_number;
    }
  } catch (err: any) {
    console.error(`[custom-label] FAILED to get order details for ${orderSn}:`, err.message, err.stack);
  }

  // 4. Get logistics data from Shopee API (sort codes, weight, 3PL)
  let sortCode = '';
  let batchCode = '';
  let weight = '0';
  let trackingNumber = order.trackingNumber || '';
  let serviceType = 'STD';

  try {
    const docInfo = await getShippingDocumentDataInfo(shopId, orderSn, packageNumber);
    const info = docInfo?.response?.shipping_document_info;
    
    if (info) {
      // Sort code
      const sc = info.recipient_sort_code;
      sortCode = sc?.first_recipient_sort_code || sc?.second_recipient_sort_code || '';

      // Batch code / 3PL info
      const tpl = info.third_party_logistic_info;
      batchCode = tpl?.area || tpl?.branch_code || '';

      // Weight (in grams, API returns kg as number)
      if (info.order_weight) {
        const weightKg = parseFloat(info.order_weight);
        weight = weightKg >= 1 
          ? `${weightKg.toFixed(2)} Kg`
          : `${Math.round(weightKg * 1000)} gram`;
      }

      // Tracking number fallback
      if (!trackingNumber && info.tracking_number) {
        trackingNumber = info.tracking_number;
      }
    }
  } catch (err: any) {
    console.warn(`[custom-label] failed to get doc data info for ${orderSn}:`, err.message);
  }

  // Determine service type from carrier name
  const carrier = (order.shippingCarrier || '').toUpperCase();
  if (carrier.includes('ECO')) serviceType = 'ECO';
  else if (carrier.includes('EXP') || carrier.includes('EXPRESS')) serviceType = 'EXP';
  else serviceType = 'STD';

  return {
    shippingCarrier: order.shippingCarrier || 'SPX EXPRESS',
    serviceType,
    orderSn: order.orderSn,
    orderDate: formatDate(order.createTime),
    sortCode,
    trackingNumber,
    batchCode,
    recipientName,
    recipientPhone,
    recipientAddress,
    senderName: SENDER_NAME,
    senderPhone: SENDER_PHONE,
    senderCity: SENDER_CITY,
    items: items.map(item => ({
      name: item.itemName,
      sku: item.modelName || '-',
      qty: item.qty
    })),
    weight,
    shipByDate,
    shipByTime,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0)
  };
}

// ─── Template Rendering ─────────────────────────────────────────
async function renderLabelHtml(data: CustomLabelData): Promise<string> {
  // Generate barcode SVG
  const barcodeSvg = data.trackingNumber
    ? generateBarcodeSvg(data.trackingNumber)
    : '<svg viewBox="0 0 280 60"></svg>';

  // Generate QR code SVG
  const qrSvg = data.trackingNumber
    ? await generateQrSvg(data.trackingNumber)
    : '<svg viewBox="0 0 100 100"></svg>';

  // Build items table rows
  const itemsHtml = data.items.length > 0
    ? data.items.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.sku)}</td>
          <td>${item.qty}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:8px;">Tidak ada item</td></tr>';

  // Build address lines
  const addressHtml = data.recipientAddress
    .map(line => `<div>${escapeHtml(line)}</div>`)
    .join('');

  // Construct the full label HTML matching the redesigned label.html structure
  const html = `
    <div class="label-container">
        <!-- Header Section -->
        <div class="header">
            <div class="logo-section">
                <div class="spx-logo">
                    <div class="spx-text">SPX</div>
                    <div class="express-text">EXPRESS</div>
                </div>
            </div>
            <div class="service-type">
                <div class="std-label">${escapeHtml(data.serviceType)}</div>
            </div>
            <div class="order-info">
                <div class="order-label">No. Pesanan</div>
                <div class="order-number">${escapeHtml(data.orderSn)}</div>
                <div class="order-date">${escapeHtml(data.orderDate)}</div>
            </div>
        </div>

        <!-- Barcode Section -->
        <div class="barcode-section">
            <div class="barcode-top">
                <div class="sort-code-box">
                    <div class="sort-value">${escapeHtml(data.sortCode || '-')}</div>
                </div>
                <div class="tracking-box">
                    <span class="tracking-text">Nomor Resi : ${escapeHtml(data.trackingNumber || '-')}</span>
                </div>
            </div>
            <div class="barcode-main">
                <div class="batch-code-box">
                    <div class="batch-value">${escapeHtml(data.batchCode || '-')}</div>
                </div>
                <div class="barcode">${barcodeSvg}</div>
            </div>
        </div>

        <!-- Recipient Section -->
        <div class="recipient-section">
            <div class="recipient-info">
                <div class="recipient-header">
                    <div>
                        <span class="recipient-label">PENERIMA</span>
                        <span class="recipient-name">${escapeHtml(data.recipientName)}</span>
                    </div>
                    <div class="phone-inline">
                        <span class="icon">📞</span> ${escapeHtml(data.recipientPhone)}
                    </div>
                </div>
                <div class="contact-info">
                    <div class="address">
                        <span class="icon">📍</span>
                        <div class="address-text">
                            ${addressHtml}
                        </div>
                    </div>
                </div>
                <div class="sender-info">
                    <div class="sender-header">
                        <div>
                            <span class="sender-label">PENGIRIM</span>
                            <span class="sender-name">${escapeHtml(data.senderName)}</span>
                        </div>
                        <div class="sender-phone">
                            <span class="icon">📞</span> ${escapeHtml(data.senderPhone)}
                        </div>
                    </div>
                    <div class="sender-city">${escapeHtml(data.senderCity)}</div>
                </div>
            </div>
            <div class="recipient-qr">
                <div class="qr-code">${qrSvg}</div>
            </div>
        </div>

        <!-- Order Details Section -->
        <div class="order-details">
            <div class="details-header">RINCIAN PESANAN</div>
            <table class="details-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>NAMA PRODUK</th>
                        <th>SKU / VARIASI</th>
                        <th>QTY</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
        </div>

        <!-- Footer Section -->
        <div class="footer-section">
            <div class="shipping-info">
                <div class="weight-box">
                    <div class="weight-label">BERAT</div>
                    <div class="weight-value">
                        <span class="icon">⚖️</span> ${escapeHtml(data.weight)}
                    </div>
                </div>
                <div class="deadline-box">
                    <div class="deadline-label">BATAS KIRIM</div>
                    <div class="deadline-value">
                        <span class="icon">📅</span> ${escapeHtml(data.shipByDate)}<br>
                        <span style="margin-left: 1.5em;">${escapeHtml(data.shipByTime)}</span>
                    </div>
                    <div class="deadline-note">*Lewat batas waktu, pesanan<br>masuk keterlambatan.</div>
                </div>
            </div>
            <div class="warning-box">
                <div class="warning-icon">⚠</div>
                <div class="warning-title">PERINGATAN</div>
                <div class="warning-text">WAJIB VIDEO UNBOXING</div>
                <div class="warning-note">Tanpa video unboxing,<br>komplain / retur<br>tidak dapat diproses.</div>
            </div>
            <div class="total-qty">
                <div class="qty-label">TOTAL QTY</div>
                <div class="qty-number">${data.totalQty}</div>
                <div class="qty-unit">PCS</div>
            </div>
        </div>

        <!-- Bottom Message -->
        <div class="bottom-message">
            ♥ TERIMA KASIH TELAH BERBELANJA DI TOKO KAMI ♥
        </div>
    </div>
  `;

  return html;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Generate a custom label PDF for a single order.
 * 
 * @param orderSn - Order serial number
 * @returns Object with success flag and base64 PDF data
 */
export async function getCustomLabel(orderSn: string): Promise<{
  success: boolean;
  pdf?: string;
  trackingNumber?: string;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    console.log(`[custom-label] generating custom label for ${orderSn}`);
    
    const data = await collectLabelData(orderSn);
    const html = await renderLabelHtml(data);
    const pdfBuffer = await generateLabelPdf(html, TEMPLATE_CSS);
    
    const duration = Date.now() - startTime;
    console.log(`[custom-label] ✅ label generated for ${orderSn} in ${duration}ms`);
    
    return {
      success: true,
      pdf: pdfBuffer.toString('base64'),
      trackingNumber: data.trackingNumber
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[custom-label] ❌ failed for ${orderSn} in ${duration}ms:`, error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate custom labels for multiple orders as a single multi-page PDF.
 * 
 * @param orderSns - Array of order serial numbers
 * @returns Object with success flag, base64 PDF, and per-order results
 */
export async function getCustomBatchLabels(orderSns: string[]): Promise<{
  success: boolean;
  pdf?: string;
  results: Array<{ orderSn: string; success: boolean; error?: string }>;
}> {
  const startTime = Date.now();
  const results: Array<{ orderSn: string; success: boolean; error?: string }> = [];
  const labelHtmls: string[] = [];

  console.log(`[custom-label] generating batch custom labels for ${orderSns.length} orders`);

  for (const orderSn of orderSns) {
    try {
      const data = await collectLabelData(orderSn);
      const html = await renderLabelHtml(data);
      labelHtmls.push(html);
      results.push({ orderSn, success: true });
    } catch (error: any) {
      console.warn(`[custom-label] batch: failed for ${orderSn}:`, error.message);
      results.push({ orderSn, success: false, error: error.message });
    }
  }

  if (labelHtmls.length === 0) {
    return {
      success: false,
      results,
    };
  }

  try {
    const pdfBuffer = await generateBatchLabelPdf(labelHtmls, TEMPLATE_CSS);
    const duration = Date.now() - startTime;
    console.log(`[custom-label] ✅ batch labels generated: ${labelHtmls.length}/${orderSns.length} in ${duration}ms`);

    return {
      success: true,
      pdf: pdfBuffer.toString('base64'),
      results
    };
  } catch (error: any) {
    console.error(`[custom-label] ❌ batch PDF generation failed:`, error.message);
    return {
      success: false,
      results
    };
  }
}
