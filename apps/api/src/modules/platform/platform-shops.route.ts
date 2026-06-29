import { Elysia, t } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { shopeeCredentials } from "../../db/schema";
import { platformMe } from "./platform-auth.service";
import { buildPlatformClearCookie, PLATFORM_COOKIE_NAME } from "./platform-cookie";
import { hasValidTenantScope } from "../auth/scope-guard";

/** Tenant session cookie name — mirror of auth.middleware's local constant. */
const TENANT_COOKIE_NAME = "wms_session";

/**
 * Platform-level shop management (Super Admin only).
 * 
 * Force-release: manually disconnect a shop from any company (issue #191 PR-B).
 * Use case: escalation path when a shop owner legitimately needs to switch
 * companies but the old account holder won't release it.
 */
export const platformShopsRoutes = new Elysia({ prefix: "/platform" })
  .derive(async ({ cookie, set }) => {
    const sessionCookie = cookie[PLATFORM_COOKIE_NAME];
    const cookieValue =
      sessionCookie && typeof sessionCookie.value === "string" && sessionCookie.value !== ""
        ? sessionCookie.value
        : undefined;

    const admin = await platformMe({ cookieValue, now: new Date() });

    if (!admin) {
      const tenantCookie = cookie[TENANT_COOKIE_NAME];
      const tenantCookieValue =
        tenantCookie && typeof tenantCookie.value === "string" && tenantCookie.value !== ""
          ? tenantCookie.value
          : undefined;
      const wrongScope = await hasValidTenantScope(tenantCookieValue);

      set.headers["Set-Cookie"] = buildPlatformClearCookie();
      set.status = wrongScope ? 403 : 401;
      return {
        platformAdmin: null as unknown as { id: number; email: string; name: string },
        platformAuthError: (wrongScope ? "wrong_scope" : "unauthorized") as
          | "wrong_scope"
          | "unauthorized",
      };
    }

    return { platformAdmin: admin };
  })
  .onBeforeHandle(({ platformAdmin, platformAuthError, set }) => {
    if (platformAuthError) {
      const msg =
        platformAuthError === "wrong_scope"
          ? "Platform routes require platform authentication, not tenant session"
          : "Platform authentication required";
      return { success: false, message: msg };
    }
    if (!platformAdmin) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }
  })

  /**
   * POST /platform/shops/:shopId/force-release
   * 
   * Force-disconnect a Shopee shop from whichever company currently owns it.
   * This is the Super Admin escalation path for ownership disputes (issue #191).
   * 
   * - Finds the active connection for the given shopId (status='connected')
   * - Sets status='disconnected', activeShopId=NULL, clears tokens
   * - Returns 404 if shop not found or already disconnected
   * - Logs the action (adminId + shop details) for audit trail
   */
  .post(
    "/shops/:shopId/force-release",
    async ({ params, set, platformAdmin }) => {
      const shopId = Number(params.shopId);
      if (!Number.isInteger(shopId) || shopId <= 0) {
        set.status = 400;
        return { success: false, message: "Invalid shop ID" };
      }

      // Find the currently active connection for this shop (if any)
      const existing = await db.select().from(shopeeCredentials)
        .where(and(
          eq(shopeeCredentials.shopId, shopId),
          eq(shopeeCredentials.status, "connected"),
        )).limit(1);

      if (existing.length === 0 || !existing[0]) {
        set.status = 404;
        return {
          success: false,
          message: `Shop ${shopId} tidak ditemukan atau sudah disconnected`,
        };
      }

      const cred = existing[0];

      // Force-disconnect: same logic as user-initiated disconnect, but admin can
      // do it across companies
      await db.update(shopeeCredentials)
        .set({
          status: "disconnected",
          activeShopId: null, // release the claim
          accessToken: "",
          refreshToken: "",
          disconnectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(shopeeCredentials.id, cred.id));

      console.log(
        `[platform-shops] Force-released shop_id=${shopId} ` +
        `(was owned by company_id=${cred.companyId}, shop_name="${cred.shopName}") ` +
        `by admin_id=${platformAdmin.id} (${platformAdmin.email})`
      );

      return {
        success: true,
        message: `Shop ${shopId} berhasil di-release`,
        details: {
          shop_id: shopId,
          shop_name: cred.shopName || `Shop #${shopId}`,
          previous_company_id: cred.companyId,
          released_by: platformAdmin.email,
          released_at: new Date().toISOString(),
        },
      };
    },
    {
      params: t.Object({
        shopId: t.String(),
      }),
    }
  );
