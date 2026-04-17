import * as crypto from 'crypto';

// Hardcoded credentials (will be replaced by token manager later)
const partner_id = 2013408;
const partner_key = "***REMOVED_PARTNER_KEY***";
const shop_id = 181462922;
const access_token = "***REMOVED_ACCESS_TOKEN***";

/**
 * Reusable Shopee API request wrapper.
 * Includes timeout (5s) and retry (3 attempts, 300ms delay).
 * Retries only on network errors, timeouts, or 5xx responses.
 */
export async function shopeeRequest(input: { method: string; path: string }) {
  const timestamp = Math.floor(Date.now() / 1000);

  const baseString = `${partner_id}${input.path}${timestamp}${access_token}${shop_id}`;
  const sign = crypto.createHmac("sha256", partner_key).update(baseString).digest("hex");

  const url = `https://partner.shopeemobile.com${input.path}?partner_id=${partner_id}&timestamp=${timestamp}&access_token=${access_token}&shop_id=${shop_id}&sign=${sign}`;

  console.log(`[shopeeRequest] ${input.method} ${input.path}`);

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 300;
  const TIMEOUT_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(url, {
        method: input.method,
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Do NOT retry on 4xx
      if (res.status >= 400 && res.status < 500) {
        const data = await res.json();
        console.error(`[shopeeRequest] Client error ${res.status}:`, JSON.stringify(data, null, 2));
        return data;
      }

      // Retry on 5xx
      if (res.status >= 500) {
        console.warn(`[shopeeRequest] Server error ${res.status}, attempt ${attempt}/${MAX_RETRIES}`);
        if (attempt === MAX_RETRIES) {
          const data = await res.json();
          return data;
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      const data = await res.json();
      console.log(`[shopeeRequest] Response:`, JSON.stringify(data, null, 2));
      return data;
    } catch (err: any) {
      const isTimeout = err.name === "AbortError";
      console.warn(
        `[shopeeRequest] ${isTimeout ? "Timeout" : "Network error"} on attempt ${attempt}/${MAX_RETRIES}: ${err.message}`,
      );
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
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
