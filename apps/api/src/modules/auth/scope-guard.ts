/**
 * Cross-scope guard helpers (Fase 1.3).
 *
 * Tenant tokens (scope:'tenant', carry a `role` claim) and platform tokens
 * (scope:'platform', no `role` claim) are issued by separate signers and live
 * in separate cookies (`wms_session` vs `platform_session`). These helpers let
 * each portal's middleware detect when a request carries a correctly-signed
 * token of the OTHER scope, so it can answer 403 (authenticated to the wrong
 * portal) instead of a generic 401.
 *
 * Both helpers are pure crypto checks: signature + scope only. They do NOT hit
 * the database and intentionally ignore token expiry (freshness is irrelevant
 * to classifying which portal a caller belongs to). A forged or malformed token
 * fails signature verification and is treated as "not present".
 */

import { verifyJwtIgnoreExp } from './jwt';
import { verifyPlatformJwtIgnoreExp } from '../platform/platform-jwt';

/**
 * True iff `platformCookieValue` is a correctly-signed platform-scoped token
 * (scope:'platform'). Used by the tenant middleware to turn a failed tenant
 * auth into a 403 when a Super Admin token is present.
 */
export async function hasValidPlatformScope(
  platformCookieValue: string | undefined,
): Promise<boolean> {
  if (!platformCookieValue) {
    return false;
  }
  try {
    await verifyPlatformJwtIgnoreExp(platformCookieValue);
    return true;
  } catch {
    return false;
  }
}

/**
 * True iff `tenantCookieValue` is a correctly-signed tenant-scoped token (has a
 * valid `role` claim). Used by the platform guard to turn a failed platform
 * auth into a 403 when a company-user token is present.
 */
export async function hasValidTenantScope(
  tenantCookieValue: string | undefined,
): Promise<boolean> {
  if (!tenantCookieValue) {
    return false;
  }
  try {
    await verifyJwtIgnoreExp(tenantCookieValue);
    return true;
  } catch {
    return false;
  }
}
