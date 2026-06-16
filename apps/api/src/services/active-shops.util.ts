/**
 * Active (connected) shop helpers — single source of truth for the
 * soft-disconnect feature.
 *
 * A shop with `status = 'disconnected'` keeps its credentials row (so its name
 * and historical data survive), but the whole app must behave as if its data
 * doesn't exist: hidden from orders/products/reports and skipped during sync.
 * Reconnecting flips status back to 'connected'.
 *
 * Every query that lists shops or filters data by shop MUST go through these
 * helpers so no code path accidentally leaks a disconnected shop's data.
 */
import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { shopeeCredentials } from "../db/schema";

export const SHOP_STATUS_CONNECTED = "connected";
export const SHOP_STATUS_DISCONNECTED = "disconnected";

type AnyDb = typeof defaultDb;

/**
 * Returns the set of shopId values that are currently connected.
 * Use this to filter any data keyed by shopId (orders, products, fees, ads).
 */
export async function getConnectedShopIds(db: AnyDb = defaultDb): Promise<number[]> {
  const rows = await db
    .select({ shopId: shopeeCredentials.shopId })
    .from(shopeeCredentials)
    .where(eq(shopeeCredentials.status, SHOP_STATUS_CONNECTED));
  return rows.map((r) => r.shopId);
}

/** Returns a Set for O(1) membership checks when filtering in memory. */
export async function getConnectedShopIdSet(db: AnyDb = defaultDb): Promise<Set<number>> {
  return new Set(await getConnectedShopIds(db));
}

/** True if the given shop is currently connected. */
export async function isShopConnected(shopId: number, db: AnyDb = defaultDb): Promise<boolean> {
  const rows = await db
    .select({ status: shopeeCredentials.status })
    .from(shopeeCredentials)
    .where(eq(shopeeCredentials.shopId, shopId))
    .limit(1);
  return rows.length > 0 && rows[0].status === SHOP_STATUS_CONNECTED;
}
