import * as crypto from 'crypto';
import { getValidToken, refreshAccessToken } from './shopee-auth';

function isAuthError(data: any): boolean {
  if (!data) return false;
  const errorKey = (data.error || "").toLowerCase();
  const msg = (data.message || "").toLowerCase();

  return (
    errorKey.includes("auth") || 
    errorKey.includes("token") || 
    msg.includes("token") ||
    (errorKey === "error_param" && msg.includes("invalid timestamp"))
  );
}

/**
 * Reusable Shopee API request wrapper.
 * Includes timeout (5s) and retry (3 attempts, 300ms delay).
 * Retries only on network errors, timeouts, or 5xx responses.
 */
export async function shopeeRequest(input: { method: string; path: string; query?: Record<string, any>; body?: Record<string, any>; shopId?: number }, isRetryFromExpired = false): Promise<any> {
  const creds = await getValidToken(input.shopId);

  const timestamp = Math.floor(Date.now() / 1000);

  const baseString = `${creds.partnerId}${input.path}${timestamp}${creds.accessToken}${creds.shopId}`;
  const sign = crypto.createHmac("sha256", creds.partnerKey).update(baseString).digest("hex");

  let url = `https://partner.shopeemobile.com${input.path}?partner_id=${creds.partnerId}&timestamp=${timestamp}&access_token=${creds.accessToken}&shop_id=${creds.shopId}&sign=${sign}`;

  if (input.query) {
    const qs = new URLSearchParams(input.query as any).toString();
    if (qs) url += `&${qs}`;
  }

  console.log(`[shopeeRequest] ${input.method} ${input.path} timestamp=${timestamp}`);

  for (let i = 0; i < 3; i++) {
    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      res = await fetch(url, {
        method: input.method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });

      clearTimeout(timeout);
    } catch (err: any) {
      if (i === 2) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }

    if (res.status >= 500) {
      if (i === 2) {
        throw new Error("Server error");
      }
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }

    if (res.status >= 400 && res.status < 500) {
      const data = await res.json();
      
      if (isAuthError(data)) {
        if (!isRetryFromExpired) {
          console.warn("[Shopee] Auth error detected, refreshing token...");
          await refreshAccessToken(creds);
          return shopeeRequest(input, true); // retry once recursively
        } else {
          console.error("[Shopee] Token refresh failed after retry");
        }
      }
      
      console.error(`[shopeeRequest] Client error ${res.status}:`, JSON.stringify(data, null, 2));
      return data;
    }

    const data = await res.json();

    // Shopee terkadang merespon 200 namun terdapat pesan error di dalam body
    if (data.error && isAuthError(data)) {
      if (!isRetryFromExpired) {
        console.warn("[Shopee] Auth error in 200 response, refreshing token...");
        await refreshAccessToken(creds);
        return shopeeRequest(input, true);
      } else {
        console.error("[Shopee] Token refresh failed after retry (200 body error)");
      }
    }

    return data;
  }
}

/**
 * Fetch shop info using the reusable shopeeRequest wrapper.
 */
export async function getShopInfoRaw() {
  return shopeeRequest({ method: "GET", path: "/api/v2/shop/get_shop_info" });
}

// Jalankan otomatis jika dieksekusi secara langsung
if (require.main === module) {
  getShopInfoRaw().catch(console.error);
}

export async function getShopeeOrderList(
  shopId: number, 
  timeFrom: number, 
  timeTo: number, 
  cursor: string = "",
  orderStatus?: string, // Optional: filter by order status
  timeRangeField: 'create_time' | 'update_time' = 'create_time' // Optional: time range field
) {
  const query: any = {
    time_range_field: timeRangeField,
    time_from: timeFrom,
    time_to: timeTo,
    page_size: 100, // Shopee max is 100 — fewer API calls = faster + less rate limiting
    cursor,
  };
  
  // Add order_status filter if provided
  // This significantly reduces the number of orders fetched
  if (orderStatus) {
    query.order_status = orderStatus;
  }
  
  return shopeeRequest({
    shopId,
    method: "GET",
    path: "/api/v2/order/get_order_list",
    query,
  });
}

/**
 * Calls Shopee v2.payment.get_escrow_detail.
 * Path: /api/v2/payment/get_escrow_detail
 * Query: order_sn (single, not list)
 * Returns: full Shopee response object (success or error)
 */
export async function getEscrowDetail(shopId: number, orderSn: string) {
  return shopeeRequest({
    shopId,
    method: "GET",
    path: "/api/v2/payment/get_escrow_detail",
    query: { order_sn: orderSn },
  });
}

export async function getShopeeOrderDetails(shopId: number, orderSnList: string[]) {
  // Shopee order details limits to 50 SNs per request
  // CRITICAL: Keep response_optional_fields minimal to ensure pickup_done_time is returned
  // Based on working Python implementation that successfully gets pickup_done_time
  // Added package_list for shipping_carrier fallback
  return shopeeRequest({
    shopId,
    method: "GET",
    path: "/api/v2/order/get_order_detail",
    query: {
      order_sn_list: orderSnList.join(","),
      response_optional_fields: "item_list,pay_time,buyer_username,total_amount,shipping_carrier,package_list,pickup_done_time,recipient_address,ship_by_date",
    },
  });
}

/**
 * Get shipment list for READY_TO_SHIP orders.
 * This API is specifically designed for READY_TO_SHIP orders and returns
 * order_sn + package_number mapping, which is more reliable than get_order_detail
 * for batch shipment processing.
 * 
 * Per Shopee docs: Returns package information for orders that are ready to ship.
 * Max batch size: 50 orders per request.
 * 
 * @param shopId - Shop identifier
 * @param orderSnList - Array of order serial numbers (max 50)
 * @returns API response containing order_list with order_sn and package_number
 */
export async function getShipmentList(shopId: number, orderSnList: string[]) {
  // Shopee API limits to 50 order SNs per request
  if (orderSnList.length > 50) {
    console.warn(`[getShipmentList] Order list exceeds max batch size of 50 (got ${orderSnList.length}). Processing first 50 only.`);
    orderSnList = orderSnList.slice(0, 50);
  }

  console.log(`[getShipmentList] Fetching shipment list for ${orderSnList.length} orders`, {
    shopId,
    orderCount: orderSnList.length,
    firstOrderSn: orderSnList[0],
  });

  const response = await shopeeRequest({
    shopId,
    method: "POST",
    path: "/api/v2/order/get_shipment_list",
    body: {
      order_sn_list: orderSnList,
      page_size: 50,
    },
  });

  // Log response structure for debugging
  const orderList = response?.response?.order_list || [];
  console.log(`[getShipmentList] Received ${orderList.length} orders in response`, {
    requested: orderSnList.length,
    received: orderList.length,
    hasMore: response?.response?.more || false,
  });

  return response;
}

/**
 * Search package list for READY_TO_SHIP orders with complete logistics data.
 * This API returns complete package information including logistics_channel_id and product_location_id,
 * which are required for batch shipment processing.
 * 
 * **Use Case**: Batch shipment processing requiring logistics configuration for grouping orders.
 * 
 * **Comparison with getShipmentList**:
 * - getShipmentList: Returns only order_sn + package_number (incomplete data)
 * - searchPackageList: Returns order_sn + package_number + logistics_channel_id + product_location_id (complete data)
 * 
 * **API Documentation**: See referensi_api/4.md for full API specification
 * 
 * Per Shopee docs (referensi_api/4.md):
 * - HTTP Method: POST (not GET)
 * - Request body: filter (package_status: 2 = ToProcess/READY_TO_SHIP) + pagination (page_size: 100)
 * - Response: packages_list[] with complete logistics data
 * - Max page size: 100 packages (we use 50 for consistency with other APIs)
 * 
 * @param shopId - Shop identifier
 * @param orderSnList - Array of order serial numbers (max 50 for consistency)
 * @returns API response containing packages_list[] with order_sn, package_number, logistics_channel_id, product_location_id
 */
export async function searchPackageList(shopId: number, orderSnList: string[]) {
  // Enforce max batch size of 50 orders for consistency with other batch APIs
  if (orderSnList.length > 50) {
    console.warn(`[searchPackageList] Order list exceeds max batch size of 50 (got ${orderSnList.length}). Processing first 50 only.`);
    orderSnList = orderSnList.slice(0, 50);
  }

  console.log(`[searchPackageList] Fetching package list for ${orderSnList.length} orders`, {
    shopId,
    orderCount: orderSnList.length,
    firstOrderSn: orderSnList[0],
    message: 'Using searchPackageList API for complete logistics data'
  });

  const orderSnSet = new Set(orderSnList);
  const allPackages: any[] = [];
  let cursor = "";
  let pageCount = 0;
  const MAX_PAGES = 10; // Safety limit to prevent infinite loops
  let lastResponse: any = null;

  // Pagination loop: fetch pages until all requested orders are found or no more pages
  while (pageCount < MAX_PAGES) {
    pageCount++;

    // Build request body per referensi_api/4.md specification
    const body = {
      filter: {
        package_status: 2  // ToProcess (READY_TO_SHIP orders)
      },
      pagination: {
        page_size: 100,    // Maximum allowed by API (we'll filter to our orders)
        cursor             // Empty string for first page, next_cursor for subsequent pages
      }
    };

    const response = await shopeeRequest({
      shopId,
      method: "POST",
      path: "/api/v2/order/search_package_list",
      body,
    });

    lastResponse = response;

    // Accumulate packages from this page
    const packagesList = response?.response?.packages_list || [];
    allPackages.push(...packagesList);

    console.log(`[searchPackageList] Page ${pageCount}: received ${packagesList.length} packages (total accumulated: ${allPackages.length})`, {
      cursor: cursor || "(first page)",
      hasMore: response?.response?.pagination?.more || false,
    });

    // Early exit: stop paginating once all requested orders are found
    const foundOrders = new Set(allPackages.filter((pkg: any) => orderSnSet.has(pkg.order_sn)).map((pkg: any) => pkg.order_sn));
    if (foundOrders.size >= orderSnList.length) {
      console.log(`[searchPackageList] All ${orderSnList.length} requested orders found after ${pageCount} page(s). Stopping pagination.`);
      break;
    }

    // Check if there are more pages
    const hasMore = response?.response?.pagination?.more;
    const nextCursor = response?.response?.pagination?.next_cursor;

    if (!hasMore || !nextCursor) {
      console.log(`[searchPackageList] No more pages available after ${pageCount} page(s).`);
      break;
    }

    cursor = nextCursor;
  }

  if (pageCount >= MAX_PAGES) {
    console.warn(`[searchPackageList] Reached max page limit (${MAX_PAGES}). Some orders may not have been found.`);
  }

  // Filter to only requested orders (API returns all READY_TO_SHIP orders)
  const filteredPackages = allPackages.filter((pkg: any) => orderSnSet.has(pkg.order_sn));

  console.log(`[searchPackageList] Final: ${allPackages.length} total packages across ${pageCount} page(s), filtered to ${filteredPackages.length} requested orders`, {
    requested: orderSnList.length,
    totalReceived: allPackages.length,
    filtered: filteredPackages.length,
    pages: pageCount,
  });

  // Log sample package structure for verification
  if (filteredPackages.length > 0) {
    const sample = filteredPackages[0];
    console.log(`[searchPackageList] Sample package structure:`, {
      order_sn: sample.order_sn,
      package_number: sample.package_number,
      logistics_channel_id: sample.logistics_channel_id,
      product_location_id: sample.product_location_id,
      is_shipment_arranged: sample.is_shipment_arranged,
      hasCompleteData: !!(sample.logistics_channel_id && sample.product_location_id)
    });
  }

  // Return response with filtered packages_list
  return {
    ...lastResponse,
    response: {
      ...lastResponse?.response,
      packages_list: filteredPackages
    }
  };
}

/**
 * Retrieve shipping parameters for multiple packages in a single API call.
 * This is the batch version of get_shipping_parameter.
 * 
 * Per Shopee docs: All packages must share the same logistics_channel_id and product_location_id.
 * Max batch size: 50 packages.
 * 
 * @param shopId - Shop identifier
 * @param packageNumbers - Array of package numbers (max 50)
 * @param logisticsChannelId - Logistics channel ID (e.g., SPX, J&T)
 * @param productLocationId - Product location/warehouse ID
 * @returns API response containing pickup/dropoff parameters and time slots
 */
export async function getMassShippingParameter(
  shopId: number,
  packageNumbers: string[],
  logisticsChannelId: number,
  productLocationId: string
) {
  const body = {
    package_list: packageNumbers.map(pn => ({ package_number: pn })),
    logistics_channel_id: logisticsChannelId,
    product_location_id: productLocationId,
  };

  console.log(`[getMassShippingParameter] Fetching shipping parameters for ${packageNumbers.length} packages`, {
    shopId,
    logisticsChannelId,
    productLocationId,
    packageCount: packageNumbers.length,
  });

  return shopeeRequest({
    shopId,
    method: "POST",
    path: "/api/v2/logistics/get_mass_shipping_parameter",
    body,
  });
}

/**
 * Arrange shipment for a Shopee order using the ship_order API endpoint.
 * This marks the order as ready for pickup/delivery in Shopee's system.
 * 
 * Per Shopee docs: Should call v2.logistics.get_shipping_parameter to fetch 
 * all required params first before calling this API.
 * 
 * @param shopId - Shop identifier
 * @param orderSn - Order serial number
 * @param shipmentMethod - Shipment method: 'pickup' or 'dropoff' (REQUIRED)
 * @param shippingParams - Response from get_shipping_parameter (optional, used to populate required fields)
 * @returns API response with success/error
 */
export async function shipShopeeOrder(
  shopId: number, 
  orderSn: string,
  shipmentMethod: 'pickup' | 'dropoff',
  shippingParams?: any
) {
  // Build request body based on shipment method
  const body: any = {
    order_sn: orderSn,
  };

  // Extract parameters from get_shipping_parameter response
  const paramResult = shippingParams?.response || shippingParams?.result || shippingParams || {};

  // Add the appropriate shipment method parameter with actual params from get_shipping_parameter
  if (shipmentMethod === 'pickup') {
    const pickupInfo = paramResult.pickup || {};
    const pickupBody: any = {};
    
    // Use first available address from shipping params
    const firstAddress = pickupInfo.address_list?.[0];
    if (firstAddress?.address_id) {
      pickupBody.address_id = firstAddress.address_id;
    }
    // time_slot_list is nested INSIDE each address, not at the pickup root
    // Pick the first "recommended" slot, or the first available one
    const timeSlots = firstAddress?.time_slot_list || [];
    const recommendedSlot = timeSlots.find((s: any) => s.flags?.includes('recommended'));
    const firstSlot = recommendedSlot || timeSlots[0];
    if (firstSlot?.pickup_time_id) {
      pickupBody.pickup_time_id = firstSlot.pickup_time_id;
    }
    
    body.pickup = pickupBody;
  } else if (shipmentMethod === 'dropoff') {
    const dropoffInfo = paramResult.dropoff || {};
    const dropoffBody: any = {};
    
    // Use first available branch from shipping params
    if (dropoffInfo.branch_list?.[0]?.branch_id) {
      dropoffBody.branch_id = dropoffInfo.branch_list[0].branch_id;
    }
    // Include sender real name if required
    if (dropoffInfo.sender_real_name) {
      dropoffBody.sender_real_name = dropoffInfo.sender_real_name;
    }
    
    body.dropoff = dropoffBody;
  }

  console.log(`[shipShopeeOrder] Shipping order ${orderSn} with method: ${shipmentMethod}`, {
    hasPickupParams: !!body.pickup?.address_id,
    hasPickupTimeSlot: !!body.pickup?.pickup_time_id,
    hasDropoffParams: !!body.dropoff?.branch_id,
    body: JSON.stringify(body),
  });

  return shopeeRequest({
    shopId,
    method: "POST",
    path: "/api/v2/logistics/ship_order",
    body,
  });
}

/**
 * Arrange shipment for multiple packages in a single API call.
 * This is the batch version of ship_order.
 * 
 * Per Shopee docs: All packages must share the same logistics_channel_id and product_location_id.
 * Max batch size: 50 packages.
 * Pickup/dropoff parameters are at TOP LEVEL (not inside each package).
 * 
 * @param shopId - Shop identifier
 * @param packages - Array of package objects with only package_number (max 50)
 * @param logisticsChannelId - Logistics channel ID (e.g., SPX, J&T)
 * @param productLocationId - Product location/warehouse ID
 * @param pickup - Pickup parameters (optional, at top level)
 * @param dropoff - Dropoff parameters (optional, at top level)
 * @returns API response containing success_list and fail_list
 */
export async function massShipOrder(
  shopId: number,
  packages: Array<{
    package_number: string;
  }>,
  logisticsChannelId: number,
  productLocationId: string,
  pickup?: {
    address_id: number;
    pickup_time_id: string;
  },
  dropoff?: {
    branch_id: number;
    sender_real_name?: string;
    tracking_number?: string;
  }
) {
  const body: any = {
    package_list: packages,
    logistics_channel_id: logisticsChannelId,
    product_location_id: productLocationId,
  };

  // Add pickup/dropoff at top level if provided
  if (pickup) {
    body.pickup = pickup;
  }
  if (dropoff) {
    body.dropoff = dropoff;
  }

  console.log(`[massShipOrder] Arranging shipment for ${packages.length} packages`, {
    shopId,
    logisticsChannelId,
    productLocationId,
    packageCount: packages.length,
    hasPickup: !!pickup,
    hasDropoff: !!dropoff,
  });

  return shopeeRequest({
    shopId,
    method: "POST",
    path: "/api/v2/logistics/mass_ship_order",
    body,
  });
}
