/**
 * Unit tests for subscription-plan.service.ts (Fase 4.2a-2).
 * DB-injectable — no MySQL needed.
 */

import { test, expect, describe } from "bun:test";
import { listActivePlans } from "../subscription-plan.service";

function makeDb(rows: any[]): any {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

describe("listActivePlans", () => {
  test("map row -> TenantPlanItem + parse features", async () => {
    const rows = [
      { id: 1, name: 'Bulanan', durationDays: 30, price: 50000, maxShops: 1, maxUsers: 3, featuresJson: '["a","b"]', isActive: 1 },
    ];
    const r = await listActivePlans(makeDb(rows));
    expect(r).toHaveLength(1);
    expect(r[0].features).toEqual(['a', 'b']);
    expect(r[0].price).toBe(50000);
    // shape tidak bocorin field internal admin
    expect('isActive' in r[0]).toBe(false);
    expect('createdAt' in r[0]).toBe(false);
  });

  test("featuresJson null / invalid -> features null", async () => {
    const rows = [
      { id: 2, name: 'X', durationDays: 30, price: 10000, maxShops: 1, maxUsers: 1, featuresJson: null, isActive: 1 },
      { id: 3, name: 'Y', durationDays: 30, price: 20000, maxShops: 1, maxUsers: 1, featuresJson: 'not-json', isActive: 1 },
    ];
    const r = await listActivePlans(makeDb(rows));
    expect(r[0].features).toBeNull();
    expect(r[1].features).toBeNull();
  });

  test("kosong -> []", async () => {
    const r = await listActivePlans(makeDb([]));
    expect(r).toEqual([]);
  });
});
