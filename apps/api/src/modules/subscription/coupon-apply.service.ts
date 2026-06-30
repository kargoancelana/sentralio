/**
 * Coupon_Apply_Service — validasi & hitung diskon kupon saat order (Fase 5.2).
 *
 * Logika:
 *   - Cek is_active, window valid_from/valid_until, max_uses belum habis, plan cocok.
 *   - Hitung diskon: percent = floor(price * value / 100), fixed = min(value, price).
 *   - Final amount = max(price - discount, 0) (tidak boleh negatif).
 *
 * TIDAK increment used_count di sini — itu dilakukan di approveOrder (Fase 5.2).
 */

import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/client';
import { coupons, plans } from '../../db/schema';
import type { DrizzleDb } from '../auth/lockout';

export interface ValidateCouponInput {
  code: string;
  planId: number;
  now: Date;
  db?: DrizzleDb;
}

export type ValidateCouponResult =
  | { valid: true; couponId: number; discountAmount: number; finalAmount: number }
  | { valid: false; reason: 'not_found' | 'inactive' | 'not_started' | 'expired' | 'max_uses_reached' | 'plan_mismatch' };

/**
 * Validasi kupon untuk plan tertentu. Return diskon & harga final kalau valid.
 * Best-effort check max_uses (race condition kecil diterima, lihat D1 di issue #211).
 */
export async function validateCoupon(input: ValidateCouponInput): Promise<ValidateCouponResult> {
  const db = input.db ?? defaultDb;
  const codeUpper = input.code.trim().toUpperCase();

  // 1. Lookup kupon by codeUpper
  const couponRows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.codeUpper, codeUpper))
    .limit(1);
  const coupon = couponRows[0];
  if (!coupon) {
    return { valid: false, reason: 'not_found' };
  }

  // 2. Cek is_active
  if (coupon.isActive !== 1) {
    return { valid: false, reason: 'inactive' };
  }

  // 3. Cek window validFrom/validUntil
  if (coupon.validFrom && input.now < new Date(coupon.validFrom)) {
    return { valid: false, reason: 'not_started' };
  }
  if (coupon.validUntil && input.now > new Date(coupon.validUntil)) {
    return { valid: false, reason: 'expired' };
  }

  // 4. Cek max_uses (best-effort)
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, reason: 'max_uses_reached' };
  }

  // 5. Cek plan cocok (coupon.planId null = semua plan, atau planId harus match)
  if (coupon.planId !== null && coupon.planId !== input.planId) {
    return { valid: false, reason: 'plan_mismatch' };
  }

  // 6. Lookup plan untuk hitung diskon
  const planRows = await db
    .select()
    .from(plans)
    .where(eq(plans.id, input.planId))
    .limit(1);
  const plan = planRows[0];
  if (!plan) {
    // Plan tidak ditemukan (seharusnya sudah dicek di createOrder, tapi double-check)
    return { valid: false, reason: 'plan_mismatch' };
  }

  // 7. Hitung diskon (D2 di issue #211)
  let discountAmount: number;
  if (coupon.type === 'percent') {
    // percent: floor(price * value / 100)
    discountAmount = Math.floor((plan.price * coupon.value) / 100);
  } else {
    // fixed: min(value, price)
    discountAmount = Math.min(coupon.value, plan.price);
  }

  // 8. Final amount = max(price - discount, 0)
  const finalAmount = Math.max(plan.price - discountAmount, 0);

  return {
    valid: true,
    couponId: coupon.id,
    discountAmount,
    finalAmount,
  };
}

/**
 * Helper untuk format error message dari ValidateCouponResult.
 */
export function formatCouponError(reason: string): string {
  switch (reason) {
    case 'not_found':
      return 'Kode kupon tidak ditemukan.';
    case 'inactive':
      return 'Kupon tidak aktif.';
    case 'not_started':
      return 'Kupon belum berlaku.';
    case 'expired':
      return 'Kupon sudah kadaluarsa.';
    case 'max_uses_reached':
      return 'Kupon sudah mencapai batas penggunaan.';
    case 'plan_mismatch':
      return 'Kupon tidak berlaku untuk plan ini.';
    default:
      return 'Kupon tidak valid.';
  }
}
