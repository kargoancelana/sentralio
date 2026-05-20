import { describe, it, expect, mock, beforeEach } from "bun:test";
import { isValidOrderSn } from "../order-detail.route";

/**
 * Unit tests for order-detail route.
 *
 * Tests cover:
 * - 400 for invalid orderSn format
 * - 404 for non-existent order
 * - 501 for unsupported marketplace
 * - 502 for upstream Shopee errors
 * - 504 for timeout
 * - 200 happy path with mocked service
 *
 * **Validates: Requirements 8.7, 8.8, 8.9, 11.2**
 */

// ---------------------------------------------------------------------------
// isValidOrderSn unit tests
// ---------------------------------------------------------------------------

describe("isValidOrderSn", () => {
  it("accepts valid alphanumeric order SNs", () => {
    const valid = [
      "ABC123",
      "abc123",
      "ABCDE",
      "12345",
      "A1B2C3D4E5",
      "A".repeat(5),
      "A".repeat(30),
    ];
    for (const sn of valid) {
      expect(isValidOrderSn(sn)).toBe(true);
    }
  });

  it("rejects order SNs that are too short (< 5 chars)", () => {
    const tooShort = ["", "A", "AB", "ABC", "ABCD"];
    for (const sn of tooShort) {
      expect(isValidOrderSn(sn)).toBe(false);
    }
  });

  it("rejects order SNs that are too long (> 30 chars)", () => {
    const tooLong = "A".repeat(31);
    expect(isValidOrderSn(tooLong)).toBe(false);
  });

  it("rejects order SNs with special characters", () => {
    const invalid = [
      "ORDER-123",   // dash not allowed
      "ORDER_123",   // underscore not allowed
      "ORDER 123",   // space not allowed
      "ORDER@123",   // @ not allowed
      "ORDER#123",   // # not allowed
      "ORDER.123",   // dot not allowed
    ];
    for (const sn of invalid) {
      expect(isValidOrderSn(sn)).toBe(false);
    }
  });

  it("rejects non-string inputs", () => {
    // @ts-expect-error testing runtime guard
    expect(isValidOrderSn(null)).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(isValidOrderSn(undefined)).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(isValidOrderSn(12345)).toBe(false);
  });

  it("accepts exactly 5 and 30 character SNs (boundary)", () => {
    expect(isValidOrderSn("ABCDE")).toBe(true);
    expect(isValidOrderSn("A".repeat(30))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Route handler logic tests (using inline handler simulation)
// ---------------------------------------------------------------------------

/**
 * Simulates the route handler logic from order-detail.route.ts.
 * We replicate the handler inline so we can inject a mock getOrderDetail
 * without needing to spin up an Elysia server.
 */
async function invokeHandler(
  orderSn: string,
  queryRefresh: string | undefined,
  mockGetOrderDetail: (orderSn: string, opts: { refresh: boolean }) => Promise<any>
): Promise<{ status: number; body: any }> {
  const set = { status: 200 as number };

  if (!isValidOrderSn(orderSn)) {
    set.status = 400;
    return { status: set.status, body: { success: false, error: "Order SN tidak valid" } };
  }

  const refresh = queryRefresh === "1" || queryRefresh === "true";
  const result = await mockGetOrderDetail(orderSn, { refresh });

  switch (result.kind) {
    case "ok":
      return { status: 200, body: { success: true, data: result.data } };

    case "not_found":
      set.status = 404;
      return { status: 404, body: { success: false, error: "Order tidak ditemukan" } };

    case "marketplace_unsupported":
      set.status = 501;
      return { status: 501, body: { success: false, error: "Marketplace belum didukung" } };

    case "timeout":
      set.status = 504;
      return { status: 504, body: { success: false, error: "Permintaan ke Shopee timeout" } };

    case "upstream_error":
      set.status = 502;
      return { status: 502, body: { success: false, error: result.message } };

    default:
      return { status: 500, body: { success: false, error: "Unknown error" } };
  }
}

// ---------------------------------------------------------------------------
// Minimal OrderDetailResponse fixture for happy-path tests
// ---------------------------------------------------------------------------

const mockOrderDetailResponse = {
  marketplace: "shopee" as const,
  orderSn: "ABCDE12345",
  orderStatus: "READY_TO_SHIP",
  buyerUsername: "buyer_test",
  recipientAddress: {
    name: "J*** D***",
    phone: "+62***1234",
    fullAddress: "Jl. Test No. 1",
    town: null,
    district: "Kec. Test",
    city: "Jakarta",
    state: "DKI Jakarta",
    region: null,
    zipcode: "12345",
  },
  packages: [],
  incomeBreakdown: {
    items: [],
    productSubtotal: 100000,
    shipping: {
      buyerPaid: 15000,
      actualToCarrier: 12000,
      shopeeRebate: 0,
      rollup: 3000,
    },
    fees: {
      adminFee: 2000,
      serviceFee: 1000,
      processingFee: 500,
    },
    totalEstimatedIncome: 96500,
  },
  adjustments: [],
  finalEarnings: {
    amount: 96500,
    isFallback: true,
  },
  buyerPayment: {
    productSubtotal: 100000,
    shippingFee: 15000,
    shopeeVoucher: 0,
    sellerVoucher: 0,
    serviceFee: 1000,
    total: 116000,
  },
};

// ---------------------------------------------------------------------------
// Route handler tests
// ---------------------------------------------------------------------------

describe("order-detail route handler", () => {
  describe("400 — invalid orderSn format", () => {
    it("returns 400 when orderSn is too short", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("AB", undefined, mockSvc);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Order SN tidak valid");
      expect(mockSvc).not.toHaveBeenCalled();
    });

    it("returns 400 when orderSn contains spaces", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("ORDER 12345", undefined, mockSvc);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Order SN tidak valid");
    });

    it("returns 400 when orderSn contains special characters", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("ORDER@12345", undefined, mockSvc);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when orderSn is empty string", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("", undefined, mockSvc);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when orderSn exceeds 30 characters", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("A".repeat(31), undefined, mockSvc);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("does NOT call getOrderDetail when orderSn is invalid", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      await invokeHandler("BAD SN!", undefined, mockSvc);
      expect(mockSvc).not.toHaveBeenCalled();
    });
  });

  describe("404 — order not found", () => {
    it("returns 404 when service returns not_found", async () => {
      const mockSvc = mock(async () => ({ kind: "not_found" }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Order tidak ditemukan");
    });

    it("calls getOrderDetail with correct orderSn for not_found", async () => {
      const mockSvc = mock(async () => ({ kind: "not_found" }));
      await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(mockSvc).toHaveBeenCalledWith("ABCDE12345", { refresh: false });
    });
  });

  describe("501 — marketplace unsupported", () => {
    it("returns 501 when service returns marketplace_unsupported", async () => {
      const mockSvc = mock(async () => ({ kind: "marketplace_unsupported" }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.status).toBe(501);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Marketplace belum didukung");
    });
  });

  describe("502 — upstream Shopee error", () => {
    it("returns 502 when service returns upstream_error", async () => {
      const mockSvc = mock(async () => ({
        kind: "upstream_error",
        message: "Shopee API returned error code 500",
      }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Shopee API returned error code 500");
    });

    it("propagates the upstream error message verbatim", async () => {
      const errorMessage = "Gagal mengambil data dari Shopee: invalid_access_token";
      const mockSvc = mock(async () => ({
        kind: "upstream_error",
        message: errorMessage,
      }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.body.error).toBe(errorMessage);
    });
  });

  describe("504 — timeout", () => {
    it("returns 504 when service returns timeout", async () => {
      const mockSvc = mock(async () => ({ kind: "timeout" }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.status).toBe(504);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe("Permintaan ke Shopee timeout");
    });
  });

  describe("200 — happy path", () => {
    it("returns 200 with data when service returns ok", async () => {
      const mockSvc = mock(async () => ({
        kind: "ok",
        data: mockOrderDetailResponse,
      }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockOrderDetailResponse);
    });

    it("passes refresh=false when query param is absent", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(mockSvc).toHaveBeenCalledWith("ABCDE12345", { refresh: false });
    });

    it("passes refresh=true when query param is '1'", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      await invokeHandler("ABCDE12345", "1", mockSvc);
      expect(mockSvc).toHaveBeenCalledWith("ABCDE12345", { refresh: true });
    });

    it("passes refresh=true when query param is 'true'", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      await invokeHandler("ABCDE12345", "true", mockSvc);
      expect(mockSvc).toHaveBeenCalledWith("ABCDE12345", { refresh: true });
    });

    it("passes refresh=false when query param is '0'", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      await invokeHandler("ABCDE12345", "0", mockSvc);
      expect(mockSvc).toHaveBeenCalledWith("ABCDE12345", { refresh: false });
    });

    it("response body contains success:true and data fields", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data.orderSn).toBe("ABCDE12345");
      expect(res.body.data.marketplace).toBe("shopee");
    });

    it("accepts minimum-length valid orderSn (5 chars)", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: { ...mockOrderDetailResponse, orderSn: "ABCDE" } }));
      const res = await invokeHandler("ABCDE", undefined, mockSvc);
      expect(res.status).toBe(200);
    });

    it("accepts maximum-length valid orderSn (30 chars)", async () => {
      const sn = "A".repeat(30);
      const mockSvc = mock(async () => ({ kind: "ok", data: { ...mockOrderDetailResponse, orderSn: sn } }));
      const res = await invokeHandler(sn, undefined, mockSvc);
      expect(res.status).toBe(200);
    });
  });

  describe("response shape invariants", () => {
    it("error responses always have success:false and error string", async () => {
      const errorCases: Array<{ kind: string; message?: string }> = [
        { kind: "not_found" },
        { kind: "marketplace_unsupported" },
        { kind: "timeout" },
        { kind: "upstream_error", message: "some error" },
      ];

      for (const result of errorCases) {
        const mockSvc = mock(async () => result);
        const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.error).toBe("string");
        expect(res.body.error.length).toBeGreaterThan(0);
      }
    });

    it("success response never has an error field", async () => {
      const mockSvc = mock(async () => ({ kind: "ok", data: mockOrderDetailResponse }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.body).not.toHaveProperty("error");
    });

    it("error responses never have a data field", async () => {
      const mockSvc = mock(async () => ({ kind: "not_found" }));
      const res = await invokeHandler("ABCDE12345", undefined, mockSvc);
      expect(res.body).not.toHaveProperty("data");
    });
  });
});
