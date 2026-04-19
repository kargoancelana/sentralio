import * as crypto from 'crypto';
import { env } from '../config/env';
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
export async function shopeeRequest(input: { method: string; path: string; query?: Record<string, any> }, isRetryFromExpired = false): Promise<any> {
  // 1. MOCK INTERCEPTOR
  if (env.mockShopeeApi) {
    console.log(`[shopeeRequest:MOCK] Bypassing real connection for ${input.path}`);
    
    // Simulate slight network delay
    await new Promise(r => setTimeout(r, 150));
    
    // Specific mocks depending on the path
    if (input.path === "/api/v2/shop/get_shop_info") {
      return {
        shop_name: "Test",
        region: "ID",
        status: "NORMAL",
        is_mocked: true
      };
    }
    
    if (input.path === "/api/v2/product/update_stock") {
      console.log("[MOCK SHOPEE] update stock triggered");
      return { ok: true, is_mocked: true };
    }
    
    // Fallback mock payload for any other path if needed
    return {
      message: "Mock response generated",
      is_mocked: true
    };
  }

  const creds = await getValidToken();

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

    // Shopee sometimes returns 200 with error in body
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

// Auto-run if executed directly
if (require.main === module) {
  getShopInfoRaw().catch(console.error);
}
