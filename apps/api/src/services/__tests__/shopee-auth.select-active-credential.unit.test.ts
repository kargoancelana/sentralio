/**
 * Unit tests for selectActiveCredential (pure selector, no DB)
 * 
 * Validates #198/#200 regression: shared shop_id scenario where multiple companies
 * have credentials for the same shop_id, with mix of connected/disconnected status.
 * 
 * Key invariant: connected rows ALWAYS win over disconnected, regardless of updatedAt.
 * Among multiple connected rows, pick the most recently updated.
 */
import { describe, it, expect } from "bun:test";
import { selectActiveCredential } from "../shopee-auth";

type TestRow = {
  companyId: number;
  shopId: number;
  status: string;
  updatedAt: Date;
};

describe("selectActiveCredential (pure selector)", () => {
  it("returns undefined when no rows provided", () => {
    const result = selectActiveCredential([]);
    expect(result).toBeUndefined();
  });

  it("returns undefined when all rows are disconnected", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 100, status: "disconnected", updatedAt: new Date("2026-01-01T10:00:00Z") },
      { companyId: 1, shopId: 200, status: "disconnected", updatedAt: new Date("2026-01-02T10:00:00Z") },
    ];
    const result = selectActiveCredential(rows);
    expect(result).toBeUndefined();
  });

  it("returns the only connected row when single connected exists", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 100, status: "connected", updatedAt: new Date("2026-01-01T10:00:00Z") },
    ];
    const result = selectActiveCredential(rows);
    expect(result).toBeDefined();
    expect(result!.shopId).toBe(100);
    expect(result!.status).toBe("connected");
  });

  it("picks newest connected row when multiple connected rows exist", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 100, status: "connected", updatedAt: new Date("2026-01-01T10:00:00Z") }, // older
      { companyId: 1, shopId: 200, status: "connected", updatedAt: new Date("2026-01-05T10:00:00Z") }, // NEWEST
      { companyId: 1, shopId: 300, status: "connected", updatedAt: new Date("2026-01-03T10:00:00Z") },
    ];
    const result = selectActiveCredential(rows);
    expect(result).toBeDefined();
    expect(result!.shopId).toBe(200); // newest updatedAt
    expect(result!.companyId).toBe(1);
  });

  it("#198/#200 regression: connected wins over disconnected even if disconnected is newer", () => {
    // Shared shop_id=555 scenario:
    // - Company A: disconnected, NEWER updatedAt (2026-01-10)
    // - Company B: connected, OLDER updatedAt (2026-01-05)
    // Expected: Company B (connected) wins
    const rows: TestRow[] = [
      {
        companyId: 1,
        shopId: 555,
        status: "disconnected",
        updatedAt: new Date("2026-01-10T12:00:00Z"), // NEWER but disconnected
      },
      {
        companyId: 2,
        shopId: 555,
        status: "connected",
        updatedAt: new Date("2026-01-05T10:00:00Z"), // older but CONNECTED
      },
    ];

    const result = selectActiveCredential(rows, 555);
    expect(result).toBeDefined();
    expect(result!.companyId).toBe(2); // Company B
    expect(result!.status).toBe("connected");
    expect(result!.shopId).toBe(555);
  });

  it("#198/#200 variant: multiple disconnected + one connected for same shop_id", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 555, status: "disconnected", updatedAt: new Date("2026-01-12T10:00:00Z") }, // newest
      { companyId: 1, shopId: 555, status: "disconnected", updatedAt: new Date("2026-01-10T10:00:00Z") },
      { companyId: 2, shopId: 555, status: "connected", updatedAt: new Date("2026-01-08T10:00:00Z") }, // WINS
      { companyId: 3, shopId: 555, status: "disconnected", updatedAt: new Date("2026-01-06T10:00:00Z") },
    ];

    const result = selectActiveCredential(rows, 555);
    expect(result).toBeDefined();
    expect(result!.companyId).toBe(2);
    expect(result!.status).toBe("connected");
  });

  it("filters by shopId when provided", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 100, status: "connected", updatedAt: new Date("2026-01-05T10:00:00Z") },
      { companyId: 1, shopId: 200, status: "connected", updatedAt: new Date("2026-01-10T10:00:00Z") }, // newest overall
      { companyId: 1, shopId: 300, status: "connected", updatedAt: new Date("2026-01-08T10:00:00Z") },
    ];

    // Request shop 100 specifically
    const result = selectActiveCredential(rows, 100);
    expect(result).toBeDefined();
    expect(result!.shopId).toBe(100);
    expect(result!.companyId).toBe(1);
  });

  it("returns undefined when shopId filter excludes all connected rows", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 100, status: "connected", updatedAt: new Date("2026-01-05T10:00:00Z") },
      { companyId: 1, shopId: 200, status: "connected", updatedAt: new Date("2026-01-10T10:00:00Z") },
    ];

    // Request shop 999 (not in list)
    const result = selectActiveCredential(rows, 999);
    expect(result).toBeUndefined();
  });

  it("handles Date objects and ISO string updatedAt interchangeably", () => {
    const rows = [
      { companyId: 1, shopId: 100, status: "connected", updatedAt: "2026-01-01T10:00:00Z" as any }, // string
      { companyId: 1, shopId: 200, status: "connected", updatedAt: new Date("2026-01-05T10:00:00Z") }, // Date object
    ];

    const result = selectActiveCredential(rows);
    expect(result).toBeDefined();
    expect(result!.shopId).toBe(200); // Date 2026-01-05 is newer
  });

  it("among multiple connected rows for same shop_id, picks newest updatedAt", () => {
    // Edge case: same company, same shop_id, multiple connected rows (e.g., re-connected multiple times)
    const rows: TestRow[] = [
      { companyId: 1, shopId: 555, status: "connected", updatedAt: new Date("2026-01-01T10:00:00Z") },
      { companyId: 1, shopId: 555, status: "connected", updatedAt: new Date("2026-01-10T10:00:00Z") }, // NEWEST
      { companyId: 1, shopId: 555, status: "connected", updatedAt: new Date("2026-01-05T10:00:00Z") },
    ];

    const result = selectActiveCredential(rows, 555);
    expect(result).toBeDefined();
    expect(result!.updatedAt).toEqual(new Date("2026-01-10T10:00:00Z"));
  });

  it("no shopId filter: picks newest connected across all shops", () => {
    const rows: TestRow[] = [
      { companyId: 1, shopId: 100, status: "connected", updatedAt: new Date("2026-01-01T10:00:00Z") },
      { companyId: 1, shopId: 200, status: "connected", updatedAt: new Date("2026-01-15T10:00:00Z") }, // NEWEST
      { companyId: 2, shopId: 300, status: "connected", updatedAt: new Date("2026-01-10T10:00:00Z") },
      { companyId: 2, shopId: 400, status: "disconnected", updatedAt: new Date("2026-01-20T10:00:00Z") }, // newer but disconnected
    ];

    const result = selectActiveCredential(rows);
    expect(result).toBeDefined();
    expect(result!.shopId).toBe(200);
    expect(result!.companyId).toBe(1);
  });
});
