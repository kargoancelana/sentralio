import * as crypto from 'crypto';

export async function getShopInfoRaw() {
  const partner_id = 2013408;
  const partner_key = "***REMOVED_PARTNER_KEY***";
  const shop_id = 181462922;
  const access_token = "***REMOVED_ACCESS_TOKEN***";
  const path = "/api/v2/shop/get_shop_info";

  // Generate timestamp
  const timestamp = Math.floor(Date.now() / 1000);

  // Generate signature manually inline (no abstraction)
  const baseString = `${partner_id}${path}${timestamp}${access_token}${shop_id}`;
  const sign = crypto.createHmac("sha256", partner_key).update(baseString).digest("hex");

  // Construct URL
  const url = `https://partner.shopeemobile.com${path}?partner_id=${partner_id}&timestamp=${timestamp}&access_token=${access_token}&shop_id=${shop_id}&sign=${sign}`;

  console.log(`[RAW] Fetching from Shopee...`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  });

  const data = await res.json();
  console.log("[RAW] Response Received:\n", JSON.stringify(data, null, 2));
  return data;
}

// Auto-run if executed directly
if (require.main === module) {
  getShopInfoRaw().catch(console.error);
}
