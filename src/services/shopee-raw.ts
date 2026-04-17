import * as crypto from 'crypto';

// Hardcoded credentials (will be replaced by token manager later)
const partner_id = 2013408;
const partner_key = "***REMOVED_PARTNER_KEY***";
const shop_id = 181462922;
const access_token = "***REMOVED_ACCESS_TOKEN***";

/**
 * Reusable Shopee API request wrapper.
 * Copied directly from getShopInfoRaw logic — no abstraction beyond this function.
 * No retry, no token manager.
 */
export async function shopeeRequest(input: { method: string; path: string }) {
  const timestamp = Math.floor(Date.now() / 1000);

  const baseString = `${partner_id}${input.path}${timestamp}${access_token}${shop_id}`;
  const sign = crypto.createHmac("sha256", partner_key).update(baseString).digest("hex");

  const url = `https://partner.shopeemobile.com${input.path}?partner_id=${partner_id}&timestamp=${timestamp}&access_token=${access_token}&shop_id=${shop_id}&sign=${sign}`;

  console.log(`[shopeeRequest] ${input.method} ${input.path}`);

  const res = await fetch(url, {
    method: input.method,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  console.log(`[shopeeRequest] Response:`, JSON.stringify(data, null, 2));
  return data;
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
