/**
 * Tests untuk coupon-apply.service (Fase 5.2).
 *
 * Test validasi kupon + hitung diskon: percent/fixed math, clamp ≥0,
 * inactive/expired/not_started/max_uses/plan_mismatch.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { validateCoupon } from '../coupon-apply.service';
import { db } from '../../../db/client';
import { coupons, plans } from '../../../db/schema';
import { eq } from 'drizzle-orm';

describe('coupon-apply.service', () => {
  let testPlanId: number;
  let testCouponId: number;

  beforeEach(async () => {
    // Cleanup test data
    await db.delete(coupons).where(eq(coupons.codeUpper, 'TESTCOUPON'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'EXPIRED'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'NOTSTARTED'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'MAXUSED'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'INACTIVE'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'PLANMISMATCH'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'PERCENT50'));
    await db.delete(coupons).where(eq(coupons.codeUpper, 'FIXED100K'));

    // Setup test plan (harga 200.000)
    const planRows = await db.select().from(plans).where(eq(plans.isActive, 1)).limit(1);
    if (planRows[0]) {
      testPlanId = planRows[0].id;
    } else {
      // Create test plan if none exists
      const [ins] = await db.insert(plans).values({
        name: 'Test Plan',
        durationDays: 30,
        price: 200000,
        maxShops: 1,
        maxUsers: 1,
        isActive: 1,
      });
      testPlanId = (ins as { insertId: number }).insertId;
    }
  });

  test('percent discount: floor calculation', async () => {
    // 50% dari 200.000 = 100.000
    const [ins] = await db.insert(coupons).values({
      code: 'PERCENT50',
      codeUpper: 'PERCENT50',
      type: 'percent',
      value: 50,
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'percent50', // case-insensitive
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountAmount).toBe(100000);
      expect(result.finalAmount).toBe(100000);
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('fixed discount: capped at plan price', async () => {
    // Fixed 100.000 dari 200.000 = 100.000 diskon, final 100.000
    const [ins] = await db.insert(coupons).values({
      code: 'FIXED100K',
      codeUpper: 'FIXED100K',
      type: 'fixed',
      value: 100000,
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'FIXED100K',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountAmount).toBe(100000);
      expect(result.finalAmount).toBe(100000);
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('fixed discount: clamped to plan price (no negative)', async () => {
    // Fixed 300.000 dari 200.000 = min(300k, 200k) = 200k diskon, final 0
    const [ins] = await db.insert(coupons).values({
      code: 'FIXED300K',
      codeUpper: 'FIXED300K',
      type: 'fixed',
      value: 300000,
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'FIXED300K',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountAmount).toBe(200000); // clamped to plan price
      expect(result.finalAmount).toBe(0); // max(0, 0) = 0
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('inactive coupon rejected', async () => {
    const [ins] = await db.insert(coupons).values({
      code: 'INACTIVE',
      codeUpper: 'INACTIVE',
      type: 'percent',
      value: 10,
      isActive: 0, // inactive
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'INACTIVE',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('inactive');
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('expired coupon rejected', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const [ins] = await db.insert(coupons).values({
      code: 'EXPIRED',
      codeUpper: 'EXPIRED',
      type: 'percent',
      value: 10,
      validUntil: yesterday,
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'EXPIRED',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('expired');
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('not started coupon rejected', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [ins] = await db.insert(coupons).values({
      code: 'NOTSTARTED',
      codeUpper: 'NOTSTARTED',
      type: 'percent',
      value: 10,
      validFrom: tomorrow,
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'NOTSTARTED',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('not_started');
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('max_uses reached rejected', async () => {
    const [ins] = await db.insert(coupons).values({
      code: 'MAXUSED',
      codeUpper: 'MAXUSED',
      type: 'percent',
      value: 10,
      maxUses: 1,
      usedCount: 1, // already used
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'MAXUSED',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('max_uses_reached');
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('plan mismatch rejected', async () => {
    // Coupon locked to planId = 999 (non-existent)
    const [ins] = await db.insert(coupons).values({
      code: 'PLANMISMATCH',
      codeUpper: 'PLANMISMATCH',
      type: 'percent',
      value: 10,
      planId: 999,
      isActive: 1,
    });
    testCouponId = (ins as { insertId: number }).insertId;

    const result = await validateCoupon({
      code: 'PLANMISMATCH',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('plan_mismatch');
    }

    await db.delete(coupons).where(eq(coupons.id, testCouponId));
  });

  test('not found coupon rejected', async () => {
    const result = await validateCoupon({
      code: 'NONEXISTENT',
      planId: testPlanId,
      now: new Date(),
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('not_found');
    }
  });
});
