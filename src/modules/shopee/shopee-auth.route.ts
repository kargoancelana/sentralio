import * as crypto from "crypto";
import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { shopeeCredentials } from "../../db/schema";
import { encrypt } from "../../utils/crypto";

const SHOPEE_BASE = "https://partner.shopeemobile.com";

/**
 * Generate HMAC-SHA256 signature for Shopee API.
 */
function makeSign(partnerId: number, partnerKey: string, path: string, timestamp: number): string {
  const baseString = `${partnerId}${path}${timestamp}`;
  return crypto.createHmac("sha256", partnerKey).update(baseString).digest("hex");
}

export const shopeeAuthRoutes = new Elysia({ prefix: "/shopee" })

  // ─── Step 1: Generate auth URL for user to open in browser ───
  .get("/auth", ({ set }) => {
    const path = "/api/v2/shop/auth_partner";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = makeSign(env.shopeePartnerId, env.shopeePartnerKey, path, timestamp);

    // Use the redirect URL that's registered in Shopee Partner Dashboard
    const redirectUrl = env.shopeeRedirectUrl || "https://google.com";
    const authUrl = `${SHOPEE_BASE}${path}?partner_id=${env.shopeePartnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${redirectUrl}`;

    console.log(`[shopee-oauth] Auth URL generated`);

    set.headers["Content-Type"] = "text/html";
    return `<!DOCTYPE html>
<html>
<head>
  <title>Shopee OAuth Setup</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; overflow-x: auto; }
    a { color: #2563eb; }
    .step { margin: 20px 0; padding: 16px; border-left: 4px solid #2563eb; background: #f8fafc; }
  </style>
</head>
<body>
  <h1>🔐 Shopee OAuth Setup</h1>

  <div class="step">
    <h3>Step 1: Buka link ini di browser</h3>
    <p><a href="${authUrl}" target="_blank">Klik di sini untuk authorize di Shopee →</a></p>
  </div>

  <div class="step">
    <h3>Step 2: Login & klik "Confirm Authorization"</h3>
  </div>

  <div class="step">
    <h3>Step 3: Copy <code>code</code> dan <code>shop_id</code> dari URL bar</h3>
    <p>Setelah authorize, browser akan redirect ke URL terdaftar. Halaman mungkin error/blank — <b>itu normal</b>.</p>
    <p>Lihat URL bar, akan ada format seperti:</p>
    <pre>https://yourdomain.com/callback?code=<b>XXXX</b>&shop_id=<b>12345</b></pre>
    <p>Copy nilai <code>code</code> dan <code>shop_id</code>.</p>
  </div>

  <div class="step">
    <h3>Step 4: Paste ke sini</h3>
    <pre>Invoke-RestMethod -Method POST http://localhost:3000/shopee/auth/exchange \`
  -Body '{"code":"PASTE_CODE","shop_id":"PASTE_SHOP_ID"}' \`
  -ContentType "application/json"</pre>
    <p>Atau pakai form di bawah:</p>
    <form id="tokenForm">
      <label>Code: <input type="text" id="code" style="width:100%;padding:8px;margin:4px 0 12px" required></label>
      <label>Shop ID: <input type="text" id="shopId" style="width:100%;padding:8px;margin:4px 0 12px" required></label>
      <button type="submit" style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px">Exchange Token</button>
    </form>
    <pre id="result" style="display:none;margin-top:12px"></pre>
    <script>
      document.getElementById('tokenForm').onsubmit = async (e) => {
        e.preventDefault();
        const code = document.getElementById('code').value;
        const shopId = document.getElementById('shopId').value;
        const res = await fetch('/shopee/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, shop_id: shopId })
        });
        const data = await res.json();
        const el = document.getElementById('result');
        el.style.display = 'block';
        el.textContent = JSON.stringify(data, null, 2);
      };
    </script>
  </div>
</body>
</html>`;
  })

  // ─── Step 2: Exchange auth code for tokens ───────────────────
  .post(
    "/auth/exchange",
    async ({ body, set }) => {
      const { code, shop_id } = body;

      console.log(`[shopee-oauth] Exchanging code for tokens, shop_id=${shop_id}, code=****${code.slice(-4)}`);

      const path = "/api/v2/auth/token/get";
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = makeSign(env.shopeePartnerId, env.shopeePartnerKey, path, timestamp);

      const url = `${SHOPEE_BASE}${path}?partner_id=${env.shopeePartnerId}&timestamp=${timestamp}&sign=${sign}`;

      let data: any;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            shop_id: parseInt(shop_id),
            partner_id: env.shopeePartnerId,
          }),
        });
        data = await res.json();
      } catch (err: any) {
        set.status = 502;
        return {
          success: false,
          message: `Failed to exchange code with Shopee: ${err.message}`,
        };
      }

      if (data.error || !data.access_token || !data.refresh_token) {
        set.status = 400;
        return {
          success: false,
          message: `Shopee token exchange failed: ${data.message || data.error || "Unknown error"}`,
          shopee_response: data,
        };
      }

      console.log(`[shopee-oauth] Token exchange successful, saving to DB...`);

      // Encrypt and upsert to DB
      const expiresAt = new Date(Date.now() + data.expire_in * 1000);

      const existingRows = await db.select().from(shopeeCredentials).limit(1);

      if (existingRows.length > 0) {
        await db.update(shopeeCredentials).set({
          shopId: parseInt(shop_id),
          accessToken: encrypt(data.access_token),
          refreshToken: encrypt(data.refresh_token),
          expiresAt,
          updatedAt: new Date(),
        }).where(eq(shopeeCredentials.id, existingRows[0].id));
      } else {
        await db.insert(shopeeCredentials).values({
          partnerId: env.shopeePartnerId,
          partnerKey: env.shopeePartnerKey,
          shopId: parseInt(shop_id),
          accessToken: encrypt(data.access_token),
          refreshToken: encrypt(data.refresh_token),
          expiresAt,
        });
      }

      console.log(`[shopee-oauth] ✅ Token saved! Valid until ${expiresAt.toISOString()}`);

      return {
        success: true,
        message: "Token berhasil disimpan! WMS sudah terhubung ke Shopee.",
        shop_id: parseInt(shop_id),
        expires_at: expiresAt.toISOString(),
      };
    },
    {
      body: t.Object({
        code: t.String(),
        shop_id: t.String(),
      }),
    }
  );
