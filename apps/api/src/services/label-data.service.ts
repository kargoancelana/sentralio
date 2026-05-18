/**
 * Label Data Service
 *
 * Collects all data needed to render a custom 4×6 thermal label.
 * Returns pure JSON — rendering happens in the browser (frontend).
 *
 * Data sources:
 * 1. DB: shopee_orders + shopee_order_items
 * 2. Shopee API: get_order_detail  (ship_by_date, package_number)
 * 3. Shopee API: get_shipping_document_data_info (sort codes, weight, recipient images)
 */

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { shopeeOrders, shopeeOrderItems, shopeeCredentials, labelCacheTable } from '../db/schema';
import { getShopeeOrderDetails } from './shopee-raw';
import { getShippingDocumentDataInfo, getTrackingNumber } from './shopee-label';
import { waitForTrackingNumber } from './shipment.service';

// ─── Sender Config (Fallback) ───────────────────────────────────
// These are fallback values if shop info is not found in database
const FALLBACK_SENDER_NAME = process.env.SHOP_NAME || 'Nama Toko Anda';
const FALLBACK_SENDER_PHONE = process.env.SHOP_PHONE || '0821-9876-5432';
const FALLBACK_SENDER_CITY = process.env.SHOP_CITY || 'Jakarta';

// ─── Types ──────────────────────────────────────────────────────
export interface LabelDataItem {
  name: string;
  sku: string;
  variantName: string;
  qty: number;
}

export interface LabelData {
  // Header
  orderSn: string;
  orderDate: string;
  shippingCarrier: string;
  serviceType: 'STD' | 'ECO' | 'EXP';

  // Barcode / tracking
  trackingNumber: string;
  sortCode: string;
  batchCode: string;

  // Recipient (PNG images from Shopee — text is privacy-masked)
  recipient: {
    nameImg: string;    // data:image/png;base64,...
    phoneImg: string;
    addressImg: string;
  };

  // Sender (from env)
  sender: {
    name: string;
    phone: string;
    city: string;
  };

  // Items table
  items: LabelDataItem[];
  totalQty: number;

  // Footer
  weight: string;
  shipByDate: string;
  shipByTime: string;
}

// ─── Date Helpers ────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return `${fmt(date.getDate())}-${fmt(date.getMonth() + 1)}-${date.getFullYear()} ${fmt(date.getHours())}:${fmt(date.getMinutes())}`;
}

function formatDateOnly(date: Date): string {
  return `${fmt(date.getDate())}-${fmt(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function serviceTypeFromCarrier(carrier: string, logisticsChannelId?: number): 'STD' | 'ECO' | 'EXP' {
  const c = carrier.toUpperCase();
  console.log(`[label-data] serviceTypeFromCarrier: "${carrier}" -> uppercase: "${c}", logistics_channel_id: ${logisticsChannelId || 'N/A'}`);
  
  // Priority 1: Use logistics_channel_id for accurate mapping (if available)
  // SPX logistics channel IDs (confirmed from actual API responses):
  // - 80029: SPX Hemat (Economy / 5-Day Delivery)
  // - 80001: SPX Standard (assumed)
  // - 80003: SPX Express (assumed)
  if (logisticsChannelId) {
    // SPX Hemat (Economy) - ID: 80029
    if (logisticsChannelId === 80029 || logisticsChannelId === 50002 || logisticsChannelId === 18080) {
      console.log(`[label-data] Detected ECO service via logistics_channel_id: ${logisticsChannelId}`);
      return 'ECO';
    }
    // SPX Express - ID: 80003 (assumed)
    if (logisticsChannelId === 80003 || logisticsChannelId === 50003) {
      console.log(`[label-data] Detected EXP service via logistics_channel_id: ${logisticsChannelId}`);
      return 'EXP';
    }
    // Add more mappings as needed based on your shop's logistics channels
  }
  
  // Priority 2: Fallback to keyword detection in carrier name
  if (c.includes('ECO') || c.includes('HEMAT') || c.includes('5-DAY')) {
    console.log(`[label-data] Detected ECO service via carrier name keyword`);
    return 'ECO';
  }
  if (c.includes('EXP') || c.includes('EXPRESS')) {
    console.log(`[label-data] Detected EXP service via carrier name keyword`);
    return 'EXP';
  }
  
  console.log(`[label-data] Defaulting to STD service`);
  return 'STD';
}

// ─── Core Data Collection ────────────────────────────────────────
export async function collectLabelData(orderSn: string): Promise<LabelData> {
  const t0 = Date.now();

  // ── CACHE CHECK: Return cached label data if available ──
  try {
    const cacheEntry = await db.select()
      .from(labelCacheTable)
      .where(eq(labelCacheTable.orderSn, orderSn))
      .limit(1);

    if (cacheEntry.length > 0 && cacheEntry[0].labelDataJson) {
      const entry = cacheEntry[0];
      
      // Check if cache is still valid (not expired)
      if (Date.now() < new Date(entry.expiresAt).getTime()) {
        try {
          const cachedData = JSON.parse(entry.labelDataJson);
          const cacheTime = Date.now() - t0;
          console.log(`[label-data] ${orderSn} CACHE HIT: ${cacheTime}ms`);
          return cachedData as LabelData;
        } catch (parseErr) {
          console.warn(`[label-data] ${orderSn} cache parse error, fetching fresh data`);
        }
      } else {
        console.log(`[label-data] ${orderSn} cache expired, fetching fresh data`);
      }
    }
  } catch (cacheErr: any) {
    console.warn(`[label-data] ${orderSn} cache check error:`, cacheErr.message);
  }

  console.log(`[label-data] ${orderSn} CACHE MISS, fetching from Shopee API`);

  // 1. DB: order + items + shop credentials
  const [orderRows, items] = await Promise.all([
    db.select().from(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn)).limit(1),
    db.select().from(shopeeOrderItems).where(eq(shopeeOrderItems.orderSn, orderSn)),
  ]);

  if (orderRows.length === 0) {
    throw new Error(`Order ${orderSn} tidak ditemukan`);
  }
  const order = orderRows[0];
  const shopId = order.shopId;

  // Get shop info from database for sender information
  let senderName = FALLBACK_SENDER_NAME;
  let senderCity = FALLBACK_SENDER_CITY;

  try {
    const shopCredentials = await db
      .select()
      .from(shopeeCredentials)
      .where(eq(shopeeCredentials.shopId, shopId))
      .limit(1);

    if (shopCredentials.length > 0 && shopCredentials[0].shopName) {
      senderName = shopCredentials[0].shopName;
      console.log(`[label-data] ${orderSn} using shop name from DB: ${senderName}`);
    }
  } catch (err: any) {
    console.warn(`[label-data] ${orderSn} failed to get shop credentials:`, err.message);
  }

  const t1 = Date.now();
  console.log(`[label-data] ${orderSn} DB: ${t1 - t0}ms`);

  // 2. Shopee: get_order_detail (ship_by_date + package_number + logistics_channel_id)
  let shipByDate = '';
  let shipByTime = '23:59 WIB';
  let packageNumber: string | undefined;
  let logisticsChannelId: number | undefined;

  try {
    const detailRes = await getShopeeOrderDetails(shopId, [orderSn]);
    const orderDetail = detailRes?.response?.order_list?.[0];

    if (orderDetail?.ship_by_date) {
      const d = new Date(orderDetail.ship_by_date * 1000);
      shipByDate = formatDateOnly(d);
      shipByTime = `${fmt(d.getHours())}:${fmt(d.getMinutes())} WIB`;
    }
    if (orderDetail?.package_list?.[0]?.package_number) {
      packageNumber = orderDetail.package_list[0].package_number;
    }
    if (orderDetail?.package_list?.[0]?.logistics_channel_id) {
      logisticsChannelId = orderDetail.package_list[0].logistics_channel_id;
    }
    
    // Debug logging for service type detection
    console.log(`[label-data] ${orderSn} logistics info:`, {
      shippingCarrier: order.shippingCarrier,
      logisticsChannelId,
      packageNumber
    });
  } catch (err: any) {
    console.error(`[label-data] get_order_detail failed for ${orderSn}:`, err.message);
  }

  const t2 = Date.now();
  console.log(`[label-data] ${orderSn} get_order_detail: ${t2 - t1}ms`);

  // 2.5. Ensure tracking number is available before proceeding
  //      This prevents missing QR codes and barcodes on labels
  //      Requirement 2.6: Fetch tracking number from Shopee API if not in database
  if (!order.trackingNumber) {
    console.log(`[label-data] ${orderSn} tracking number not in DB, fetching from Shopee API...`);
    try {
      const trackingResult = await getTrackingNumber(shopId, orderSn);
      if (trackingResult?.tracking_number) {
        order.trackingNumber = trackingResult.tracking_number;
        console.log(`[label-data] ${orderSn} tracking number fetched from Shopee: ${order.trackingNumber}`);
        // Update DB with fetched tracking number (fire-and-forget)
        db.update(shopeeOrders)
          .set({ trackingNumber: order.trackingNumber })
          .where(eq(shopeeOrders.orderSn, orderSn))
          .execute()
          .catch((err: any) => console.warn(`[label-data] ${orderSn} failed to update tracking in DB:`, err.message));
      } else {
        throw new Error(`Tracking number belum tersedia untuk order ${orderSn}. Tunggu 5-10 detik setelah atur pengiriman, lalu coba cetak label lagi.`);
      }
    } catch (fetchErr: any) {
      if (fetchErr.message.includes('Tunggu 5-10 detik')) throw fetchErr;
      console.error(`[label-data] ${orderSn} failed to fetch tracking from Shopee:`, fetchErr.message);
      throw new Error(`Tracking number belum tersedia untuk order ${orderSn}. Tunggu 5-10 detik setelah atur pengiriman, lalu coba cetak label lagi.`);
    }
  } else {
    console.log(`[label-data] ${orderSn} tracking number already in DB: ${order.trackingNumber}`);
  }

  // 3. Shopee: get_shipping_document_data_info
  //    Returns: sort codes, weight, tracking, + recipient address as images
  let sortCode = '';
  let batchCode = '';
  let weight = '';
  let trackingNumber = order.trackingNumber || '';
  let recipientNameImg = '';
  let recipientPhoneImg = '';
  let recipientAddressImg = '';

  try {
    const docInfo = await getShippingDocumentDataInfo(shopId, orderSn, packageNumber);
    const info = docInfo?.response?.shipping_document_info;
    const recipientInfo: Array<{ key: string; image: string | null }> =
      docInfo?.response?.recipient_address_info || [];

    if (info) {
      const sc = info.recipient_sort_code;
      sortCode = sc?.first_recipient_sort_code || sc?.second_recipient_sort_code || '';

      batchCode = info.deliver_area || '';
      if (!batchCode) {
        const tpl = info.third_party_logistic_info;
        batchCode = tpl?.area || tpl?.branch_code || '';
      }

      if (info.order_weight) {
        const g = parseFloat(info.order_weight);
        weight = g >= 1000 ? `${(g / 1000).toFixed(2)} Kg` : `${Math.round(g)} gram`;
      }

      if (!trackingNumber && info.tracking_number) {
        trackingNumber = info.tracking_number;
      }
    }

    for (const entry of recipientInfo) {
      if (!entry.image) continue;
      if (entry.key === 'name') recipientNameImg = entry.image;
      if (entry.key === 'phone') recipientPhoneImg = entry.image;
      if (entry.key === 'full_address') recipientAddressImg = entry.image;
    }

    console.log(`[label-data] ${orderSn} recipient imgs: name=${!!recipientNameImg} phone=${!!recipientPhoneImg} addr=${!!recipientAddressImg}`);
  } catch (err: any) {
    console.warn(`[label-data] get_shipping_document_data_info failed for ${orderSn}:`, err.message);
  }

  const t3 = Date.now();
  console.log(`[label-data] ${orderSn} get_doc_info: ${t3 - t2}ms | total: ${t3 - t0}ms`);

  const labelData: LabelData = {
    orderSn: order.orderSn,
    orderDate: formatDate(order.createTime),
    shippingCarrier: order.shippingCarrier || 'SPX EXPRESS',
    serviceType: serviceTypeFromCarrier(order.shippingCarrier || '', logisticsChannelId),
    trackingNumber,
    sortCode,
    batchCode,
    recipient: {
      nameImg: recipientNameImg,
      phoneImg: recipientPhoneImg,
      addressImg: recipientAddressImg,
    },
    sender: {
      name: senderName,
      phone: FALLBACK_SENDER_PHONE,
      city: senderCity,
    },
    items: items.map(item => ({
      name: item.itemName,
      sku: item.modelSku || '-',
      variantName: item.modelName || '-',
      qty: item.qty,
    })),
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
    weight,
    shipByDate,
    shipByTime,
  };

  // ── CACHE SAVE: Store label data for fast re-prints ──
  try {
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    const labelDataJson = JSON.stringify(labelData);

    const existing = await db.select()
      .from(labelCacheTable)
      .where(eq(labelCacheTable.orderSn, orderSn))
      .limit(1);

    if (existing.length > 0) {
      // Update existing cache entry
      await db.update(labelCacheTable)
        .set({
          labelDataJson,
          trackingNumber,
          expiresAt,
        })
        .where(eq(labelCacheTable.orderSn, orderSn));
      console.log(`[label-data] ${orderSn} cache updated`);
    } else {
      // Insert new cache entry (labelUrl is required, use empty string as placeholder)
      await db.insert(labelCacheTable).values({
        orderSn,
        labelUrl: '', // Placeholder - not used for label data cache
        format: 'json',
        trackingNumber,
        labelDataJson,
        expiresAt,
      });
      console.log(`[label-data] ${orderSn} cache created`);
    }
  } catch (cacheErr: any) {
    console.warn(`[label-data] ${orderSn} cache save error:`, cacheErr.message);
    // Non-fatal - continue even if cache fails
  }

  return labelData;
}

// ─── Single Label ─────────────────────────────────────────────────
export async function getLabelData(orderSn: string): Promise<{
  success: boolean;
  data?: LabelData;
  error?: string;
}> {
  try {
    const data = await collectLabelData(orderSn);
    return { success: true, data };
  } catch (err: any) {
    console.error(`[label-data] getLabelData failed for ${orderSn}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Batch Labels (Optimized) ─────────────────────────────────────
// Strategy:
// 1. Check cache for all orders (DB batch query)
// 2. For cache misses: 1× batch getShopeeOrderDetails (up to 50 orders)
// 3. Parallel getShippingDocumentDataInfo (concurrency 5 — this API doesn't support batch)
// 4. Assemble label data and save to cache
//
// Before: N orders × (1 getShopeeOrderDetails + 1 getShippingDocumentDataInfo) = 2N API calls
// After:  1 getShopeeOrderDetails + N getShippingDocumentDataInfo (parallel 5) = 1 + N API calls
// For 13 orders: 26 calls → 14 calls, and parallel execution cuts wall time significantly

export async function getBatchLabelData(orderSns: string[]): Promise<{
  results: Array<{ orderSn: string; success: boolean; data?: LabelData; error?: string }>;
  successful: number;
  failed: number;
  total: number;
}> {
  const t0 = Date.now();
  const DOC_INFO_CONCURRENCY = 5;
  const results: Array<{ orderSn: string; success: boolean; data?: LabelData; error?: string }> = [];

  // ── Step 1: Check cache for all orders ──
  const cachedResults = new Map<string, LabelData>();
  const cacheMissOrderSns: string[] = [];

  for (const orderSn of orderSns) {
    try {
      const cacheEntry = await db.select()
        .from(labelCacheTable)
        .where(eq(labelCacheTable.orderSn, orderSn))
        .limit(1);

      if (cacheEntry.length > 0 && cacheEntry[0].labelDataJson) {
        const entry = cacheEntry[0];
        if (Date.now() < new Date(entry.expiresAt).getTime()) {
          try {
            cachedResults.set(orderSn, JSON.parse(entry.labelDataJson) as LabelData);
            continue;
          } catch { /* parse error, treat as miss */ }
        }
      }
    } catch { /* cache error, treat as miss */ }
    cacheMissOrderSns.push(orderSn);
  }

  // Add cached results immediately
  for (const orderSn of orderSns) {
    if (cachedResults.has(orderSn)) {
      results.push({ orderSn, success: true, data: cachedResults.get(orderSn)! });
    }
  }

  console.log(`[label-data] batch: ${cachedResults.size} cache hits, ${cacheMissOrderSns.length} misses`);

  if (cacheMissOrderSns.length === 0) {
    const successful = results.filter(r => r.success).length;
    return { results, successful, failed: 0, total: orderSns.length };
  }

  // ── Step 2: Load DB data for all cache-miss orders ──
  const orderDataMap = new Map<string, { order: any; items: any[]; shopId: number }>();

  for (const orderSn of cacheMissOrderSns) {
    try {
      const [orderRows, items] = await Promise.all([
        db.select().from(shopeeOrders).where(eq(shopeeOrders.orderSn, orderSn)).limit(1),
        db.select().from(shopeeOrderItems).where(eq(shopeeOrderItems.orderSn, orderSn)),
      ]);

      if (orderRows.length === 0) {
        results.push({ orderSn, success: false, error: `Order ${orderSn} tidak ditemukan` });
        continue;
      }

      const order = orderRows[0];
      if (!order.trackingNumber) {
        // Fallback: fetch tracking number from Shopee API
        try {
          const trackingResult = await getTrackingNumber(order.shopId, orderSn);
          if (trackingResult?.tracking_number) {
            order.trackingNumber = trackingResult.tracking_number;
            console.log(`[label-data] batch: ${orderSn} tracking fetched from Shopee: ${order.trackingNumber}`);
            // Update DB (fire-and-forget)
            db.update(shopeeOrders)
              .set({ trackingNumber: order.trackingNumber })
              .where(eq(shopeeOrders.orderSn, orderSn))
              .execute()
              .catch(() => {});
          } else {
            results.push({ orderSn, success: false, error: `Tracking number belum tersedia untuk order ${orderSn}. Tunggu 5-10 detik setelah atur pengiriman, lalu coba cetak label lagi.` });
            continue;
          }
        } catch {
          results.push({ orderSn, success: false, error: `Tracking number belum tersedia untuk order ${orderSn}. Tunggu 5-10 detik setelah atur pengiriman, lalu coba cetak label lagi.` });
          continue;
        }
      }

      orderDataMap.set(orderSn, { order, items, shopId: order.shopId });
    } catch (err: any) {
      results.push({ orderSn, success: false, error: err.message });
    }
  }

  if (orderDataMap.size === 0) {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    return { results, successful, failed, total: orderSns.length };
  }

  // ── Step 3: Batch getShopeeOrderDetails (1 API call for up to 50 orders) ──
  // Group by shopId since the API requires a single shopId
  const ordersByShop = new Map<number, string[]>();
  for (const [orderSn, data] of orderDataMap) {
    if (!ordersByShop.has(data.shopId)) ordersByShop.set(data.shopId, []);
    ordersByShop.get(data.shopId)!.push(orderSn);
  }

  // Map: orderSn → { packageNumber, logisticsChannelId, shipByDate }
  const orderDetailMap = new Map<string, { packageNumber?: string; logisticsChannelId?: number; shipByDate?: string; shipByTime?: string }>();

  for (const [shopId, shopOrderSns] of ordersByShop) {
    try {
      const detailRes = await getShopeeOrderDetails(shopId, shopOrderSns);
      const orderList = detailRes?.response?.order_list || [];

      for (const detail of orderList) {
        let shipByDate = '';
        let shipByTime = '23:59 WIB';
        if (detail.ship_by_date) {
          const d = new Date(detail.ship_by_date * 1000);
          shipByDate = formatDateOnly(d);
          shipByTime = `${fmt(d.getHours())}:${fmt(d.getMinutes())} WIB`;
        }

        orderDetailMap.set(detail.order_sn, {
          packageNumber: detail.package_list?.[0]?.package_number,
          logisticsChannelId: detail.package_list?.[0]?.logistics_channel_id,
          shipByDate,
          shipByTime,
        });
      }
    } catch (err: any) {
      console.error(`[label-data] batch getShopeeOrderDetails failed for shop ${shopId}:`, err.message);
      // Orders without detail will still proceed (packageNumber will be undefined)
    }
  }

  const t1 = Date.now();
  console.log(`[label-data] batch: getShopeeOrderDetails done in ${t1 - t0}ms, got ${orderDetailMap.size} details`);

  // ── Step 4: Get shop sender info (1 query per unique shopId) ──
  const senderInfoMap = new Map<number, { name: string; city: string }>();
  for (const shopId of ordersByShop.keys()) {
    try {
      const shopCreds = await db.select().from(shopeeCredentials).where(eq(shopeeCredentials.shopId, shopId)).limit(1);
      if (shopCreds.length > 0 && shopCreds[0].shopName) {
        senderInfoMap.set(shopId, { name: shopCreds[0].shopName, city: FALLBACK_SENDER_CITY });
      } else {
        senderInfoMap.set(shopId, { name: FALLBACK_SENDER_NAME, city: FALLBACK_SENDER_CITY });
      }
    } catch {
      senderInfoMap.set(shopId, { name: FALLBACK_SENDER_NAME, city: FALLBACK_SENDER_CITY });
    }
  }

  // ── Step 5: Parallel getShippingDocumentDataInfo (concurrency 5) ──
  // This API doesn't support batch — must call per order, but we parallelize
  const ordersToProcess = Array.from(orderDataMap.entries())
    .filter(([orderSn]) => !results.some(r => r.orderSn === orderSn)); // exclude already-failed

  for (let i = 0; i < ordersToProcess.length; i += DOC_INFO_CONCURRENCY) {
    const chunk = ordersToProcess.slice(i, i + DOC_INFO_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async ([orderSn, { order, items, shopId }]) => {
        try {
          const detail = orderDetailMap.get(orderSn) || {};
          const packageNumber = detail.packageNumber;
          const logisticsChannelId = detail.logisticsChannelId;
          const shipByDate = detail.shipByDate || '';
          const shipByTime = detail.shipByTime || '23:59 WIB';

          // Call getShippingDocumentDataInfo (per-order, no batch available)
          let sortCode = '';
          let batchCode = '';
          let weight = '';
          let trackingNumber = order.trackingNumber || '';
          let recipientNameImg = '';
          let recipientPhoneImg = '';
          let recipientAddressImg = '';

          try {
            const docInfo = await getShippingDocumentDataInfo(shopId, orderSn, packageNumber);
            const info = docInfo?.response?.shipping_document_info;
            const recipientInfo: Array<{ key: string; image: string | null }> =
              docInfo?.response?.recipient_address_info || [];

            if (info) {
              const sc = info.recipient_sort_code;
              sortCode = sc?.first_recipient_sort_code || sc?.second_recipient_sort_code || '';
              batchCode = info.deliver_area || '';
              if (!batchCode) {
                const tpl = info.third_party_logistic_info;
                batchCode = tpl?.area || tpl?.branch_code || '';
              }
              if (info.order_weight) {
                const g = parseFloat(info.order_weight);
                weight = g >= 1000 ? `${(g / 1000).toFixed(2)} Kg` : `${Math.round(g)} gram`;
              }
              if (!trackingNumber && info.tracking_number) {
                trackingNumber = info.tracking_number;
              }
            }

            for (const entry of recipientInfo) {
              if (!entry.image) continue;
              if (entry.key === 'name') recipientNameImg = entry.image;
              if (entry.key === 'phone') recipientPhoneImg = entry.image;
              if (entry.key === 'full_address') recipientAddressImg = entry.image;
            }
          } catch (err: any) {
            console.warn(`[label-data] batch: get_doc_info failed for ${orderSn}:`, err.message);
          }

          const senderInfo = senderInfoMap.get(shopId) || { name: FALLBACK_SENDER_NAME, city: FALLBACK_SENDER_CITY };

          const labelData: LabelData = {
            orderSn: order.orderSn,
            orderDate: formatDate(order.createTime),
            shippingCarrier: order.shippingCarrier || 'SPX EXPRESS',
            serviceType: serviceTypeFromCarrier(order.shippingCarrier || '', logisticsChannelId),
            trackingNumber,
            sortCode,
            batchCode,
            recipient: {
              nameImg: recipientNameImg,
              phoneImg: recipientPhoneImg,
              addressImg: recipientAddressImg,
            },
            sender: {
              name: senderInfo.name,
              phone: FALLBACK_SENDER_PHONE,
              city: senderInfo.city,
            },
            items: items.map(item => ({
              name: item.itemName,
              sku: item.modelSku || '-',
              variantName: item.modelName || '-',
              qty: item.qty,
            })),
            totalQty: items.reduce((sum, item) => sum + item.qty, 0),
            weight,
            shipByDate,
            shipByTime,
          };

          // Save to cache
          try {
            const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            const labelDataJson = JSON.stringify(labelData);
            const existing = await db.select().from(labelCacheTable).where(eq(labelCacheTable.orderSn, orderSn)).limit(1);
            if (existing.length > 0) {
              await db.update(labelCacheTable).set({ labelDataJson, trackingNumber, expiresAt }).where(eq(labelCacheTable.orderSn, orderSn));
            } else {
              await db.insert(labelCacheTable).values({ orderSn, labelUrl: '', format: 'json', trackingNumber, labelDataJson, expiresAt });
            }
          } catch { /* non-fatal */ }

          return { orderSn, success: true as const, data: labelData };
        } catch (err: any) {
          return { orderSn, success: false as const, error: err.message };
        }
      })
    );
    results.push(...chunkResults);
  }

  // Sort results to match input order
  const resultMap = new Map(results.map(r => [r.orderSn, r]));
  const sortedResults = orderSns.map(sn => resultMap.get(sn)!).filter(Boolean);

  const successful = sortedResults.filter(r => r.success).length;
  const failed = sortedResults.filter(r => !r.success).length;

  const duration = Date.now() - t0;
  console.log(`[label-data] batch optimized: ${successful}/${orderSns.length} success in ${duration}ms (${orderDetailMap.size} API details, ${ordersToProcess.length} doc_info calls)`);

  return { results: sortedResults, successful, failed, total: orderSns.length };
}
