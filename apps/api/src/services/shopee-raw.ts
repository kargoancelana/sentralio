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
