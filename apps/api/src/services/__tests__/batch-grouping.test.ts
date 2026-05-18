import { describe, it, expect } from "bun:test";
import { groupOrdersByLogistics, type BatchGroup } from "../shipment.service";

/**
 * Unit Tests: Batch Grouping Logic
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 * 
 * Tests the groupOrdersByLogistics function which groups orders by logistics
 * configuration (shopId, logisticsChannelId, productLocationId) and splits
 * groups larger than 50 orders into multiple batches.
 * 
 * Test Coverage:
 * - Grouping by shopId (Requirement 3.1)
 * - Grouping by logistics configuration (Requirement 3.2)
 * - Splitting groups larger than 50 orders (Requirement 3.3)
 * - Handling orders with missing package information (Requirement 3.4, 3.5)
 */

describe("groupOrdersByLogistics - Grouping by shopId", () => {
  it("should group orders from the same shop together", () => {
    /**
     * **Validates: Requirement 3.1**
     * 
     * Test that orders from the same shop are grouped together when they
     * share the same logistics configuration.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify all orders are in a single group
    expect(result.length).toBe(1);
    expect(result[0].shopId).toBe(12345);
    expect(result[0].orders.length).toBe(3);
    
    // Verify all order SNs are included
    const orderSns = result[0].orders.map(o => o.orderSn);
    expect(orderSns).toContain("ORDER001");
    expect(orderSns).toContain("ORDER002");
    expect(orderSns).toContain("ORDER003");
  });

  it("should separate orders from different shops", () => {
    /**
     * **Validates: Requirement 3.1**
     * 
     * Test that orders from different shops are grouped separately,
     * even if they share the same logistics configuration.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 67890 },
      { orderSn: "ORDER004", shopId: 67890 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"],
      ["ORDER004", "PKG004"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001],
      ["ORDER004", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"],
      ["ORDER004", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify orders are in 2 separate groups
    expect(result.length).toBe(2);
    
    // Find groups by shopId
    const shop1Group = result.find(g => g.shopId === 12345);
    const shop2Group = result.find(g => g.shopId === 67890);
    
    expect(shop1Group).toBeDefined();
    expect(shop2Group).toBeDefined();
    expect(shop1Group!.orders.length).toBe(2);
    expect(shop2Group!.orders.length).toBe(2);
  });
});

describe("groupOrdersByLogistics - Grouping by logistics configuration", () => {
  it("should group orders with the same logistics channel ID together", () => {
    /**
     * **Validates: Requirement 3.2**
     * 
     * Test that orders with the same logistics_channel_id are grouped together
     * when they also share shopId and product_location_id.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify all orders are in a single group with correct logistics config
    expect(result.length).toBe(1);
    expect(result[0].logisticsChannelId).toBe(50001);
    expect(result[0].productLocationId).toBe("LOC001");
    expect(result[0].orders.length).toBe(3);
  });

  it("should separate orders with different logistics channel IDs", () => {
    /**
     * **Validates: Requirement 3.2**
     * 
     * Test that orders with different logistics_channel_id are grouped separately,
     * even if they share the same shopId and product_location_id.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 },
      { orderSn: "ORDER004", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"],
      ["ORDER004", "PKG004"]
    ]);

    // Different logistics channels: SPX (50001) vs J&T (50002)
    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50002],
      ["ORDER004", 50002]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"],
      ["ORDER004", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify orders are in 2 separate groups
    expect(result.length).toBe(2);
    
    // Find groups by logistics channel
    const spxGroup = result.find(g => g.logisticsChannelId === 50001);
    const jntGroup = result.find(g => g.logisticsChannelId === 50002);
    
    expect(spxGroup).toBeDefined();
    expect(jntGroup).toBeDefined();
    expect(spxGroup!.orders.length).toBe(2);
    expect(jntGroup!.orders.length).toBe(2);
  });

  it("should separate orders with different product location IDs", () => {
    /**
     * **Validates: Requirement 3.2**
     * 
     * Test that orders with different product_location_id are grouped separately,
     * even if they share the same shopId and logistics_channel_id.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    // Different warehouses
    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC002"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify orders are in 2 separate groups
    expect(result.length).toBe(2);
    
    // Find groups by location
    const loc1Group = result.find(g => g.productLocationId === "LOC001");
    const loc2Group = result.find(g => g.productLocationId === "LOC002");
    
    expect(loc1Group).toBeDefined();
    expect(loc2Group).toBeDefined();
    expect(loc1Group!.orders.length).toBe(2);
    expect(loc2Group!.orders.length).toBe(1);
  });

  it("should create separate groups for each unique logistics configuration", () => {
    /**
     * **Validates: Requirement 3.2**
     * 
     * Test that orders are grouped by the complete logistics configuration tuple:
     * (shopId, logisticsChannelId, productLocationId).
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 },
      { orderSn: "ORDER004", shopId: 67890 },
      { orderSn: "ORDER005", shopId: 67890 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"],
      ["ORDER004", "PKG004"],
      ["ORDER005", "PKG005"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50002],
      ["ORDER003", 50001],
      ["ORDER004", 50001],
      ["ORDER005", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC002"],
      ["ORDER004", "LOC001"],
      ["ORDER005", "LOC002"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify we have 5 unique groups:
    // 1. shop=12345, logistics=50001, location=LOC001 (ORDER001)
    // 2. shop=12345, logistics=50002, location=LOC001 (ORDER002)
    // 3. shop=12345, logistics=50001, location=LOC002 (ORDER003)
    // 4. shop=67890, logistics=50001, location=LOC001 (ORDER004)
    // 5. shop=67890, logistics=50001, location=LOC002 (ORDER005)
    expect(result.length).toBe(5);
    
    // Verify each group has exactly 1 order
    result.forEach(group => {
      expect(group.orders.length).toBe(1);
    });
  });
});

describe("groupOrdersByLogistics - Splitting groups larger than 50 orders", () => {
  it("should not split groups with exactly 50 orders", () => {
    /**
     * **Validates: Requirement 3.3**
     * 
     * Test that groups with exactly 50 orders (the maximum batch size)
     * are not split.
     */
    const orders = Array.from({ length: 50 }, (_, i) => ({
      orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
      shopId: 12345
    }));

    const packageMap = new Map(
      orders.map(o => [o.orderSn, `PKG${o.orderSn.slice(5)}`])
    );

    const logisticsMap = new Map(
      orders.map(o => [o.orderSn, 50001])
    );

    const locationMap = new Map(
      orders.map(o => [o.orderSn, "LOC001"])
    );

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify single group with 50 orders
    expect(result.length).toBe(1);
    expect(result[0].orders.length).toBe(50);
  });

  it("should split groups with 51 orders into 2 batches", () => {
    /**
     * **Validates: Requirement 3.3**
     * 
     * Test that groups with 51 orders are split into 2 batches:
     * one with 50 orders and one with 1 order.
     */
    const orders = Array.from({ length: 51 }, (_, i) => ({
      orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
      shopId: 12345
    }));

    const packageMap = new Map(
      orders.map(o => [o.orderSn, `PKG${o.orderSn.slice(5)}`])
    );

    const logisticsMap = new Map(
      orders.map(o => [o.orderSn, 50001])
    );

    const locationMap = new Map(
      orders.map(o => [o.orderSn, "LOC001"])
    );

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify 2 batches
    expect(result.length).toBe(2);
    expect(result[0].orders.length).toBe(50);
    expect(result[1].orders.length).toBe(1);
    
    // Verify both batches have the same logistics configuration
    expect(result[0].shopId).toBe(12345);
    expect(result[1].shopId).toBe(12345);
    expect(result[0].logisticsChannelId).toBe(50001);
    expect(result[1].logisticsChannelId).toBe(50001);
    expect(result[0].productLocationId).toBe("LOC001");
    expect(result[1].productLocationId).toBe("LOC001");
  });

  it("should split groups with 100 orders into 2 batches of 50", () => {
    /**
     * **Validates: Requirement 3.3**
     * 
     * Test that groups with 100 orders are split into 2 batches
     * of 50 orders each.
     */
    const orders = Array.from({ length: 100 }, (_, i) => ({
      orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
      shopId: 12345
    }));

    const packageMap = new Map(
      orders.map(o => [o.orderSn, `PKG${o.orderSn.slice(5)}`])
    );

    const logisticsMap = new Map(
      orders.map(o => [o.orderSn, 50001])
    );

    const locationMap = new Map(
      orders.map(o => [o.orderSn, "LOC001"])
    );

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify 2 batches of 50 each
    expect(result.length).toBe(2);
    expect(result[0].orders.length).toBe(50);
    expect(result[1].orders.length).toBe(50);
    
    // Verify both batches have the same logistics configuration
    expect(result[0].shopId).toBe(result[1].shopId);
    expect(result[0].logisticsChannelId).toBe(result[1].logisticsChannelId);
    expect(result[0].productLocationId).toBe(result[1].productLocationId);
  });

  it("should split groups with 125 orders into 3 batches", () => {
    /**
     * **Validates: Requirement 3.3**
     * 
     * Test that groups with 125 orders are split into 3 batches:
     * 50, 50, and 25 orders.
     */
    const orders = Array.from({ length: 125 }, (_, i) => ({
      orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
      shopId: 12345
    }));

    const packageMap = new Map(
      orders.map(o => [o.orderSn, `PKG${o.orderSn.slice(5)}`])
    );

    const logisticsMap = new Map(
      orders.map(o => [o.orderSn, 50001])
    );

    const locationMap = new Map(
      orders.map(o => [o.orderSn, "LOC001"])
    );

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify 3 batches
    expect(result.length).toBe(3);
    expect(result[0].orders.length).toBe(50);
    expect(result[1].orders.length).toBe(50);
    expect(result[2].orders.length).toBe(25);
    
    // Verify all batches have the same logistics configuration
    result.forEach(batch => {
      expect(batch.shopId).toBe(12345);
      expect(batch.logisticsChannelId).toBe(50001);
      expect(batch.productLocationId).toBe("LOC001");
    });
  });

  it("should preserve order sequence when splitting large groups", () => {
    /**
     * **Validates: Requirement 3.3**
     * 
     * Test that the order sequence is preserved when splitting large groups.
     * The first 50 orders should be in the first batch, the next 50 in the
     * second batch, etc.
     */
    const orders = Array.from({ length: 75 }, (_, i) => ({
      orderSn: `ORDER${String(i + 1).padStart(3, '0')}`,
      shopId: 12345
    }));

    const packageMap = new Map(
      orders.map(o => [o.orderSn, `PKG${o.orderSn.slice(5)}`])
    );

    const logisticsMap = new Map(
      orders.map(o => [o.orderSn, 50001])
    );

    const locationMap = new Map(
      orders.map(o => [o.orderSn, "LOC001"])
    );

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify 2 batches
    expect(result.length).toBe(2);
    
    // Verify first batch contains ORDER001 to ORDER050
    expect(result[0].orders[0].orderSn).toBe("ORDER001");
    expect(result[0].orders[49].orderSn).toBe("ORDER050");
    
    // Verify second batch contains ORDER051 to ORDER075
    expect(result[1].orders[0].orderSn).toBe("ORDER051");
    expect(result[1].orders[24].orderSn).toBe("ORDER075");
  });
});

describe("groupOrdersByLogistics - Handling orders with missing package information", () => {
  it("should filter out orders with missing package numbers", () => {
    /**
     * **Validates: Requirement 3.4**
     * 
     * Test that orders without package numbers are filtered out and not
     * included in any batch group.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    // ORDER002 is missing package number
    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER003", "PKG003"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify only 2 orders are included
    expect(result.length).toBe(1);
    expect(result[0].orders.length).toBe(2);
    
    // Verify ORDER002 is not included
    const orderSns = result[0].orders.map(o => o.orderSn);
    expect(orderSns).toContain("ORDER001");
    expect(orderSns).toContain("ORDER003");
    expect(orderSns).not.toContain("ORDER002");
  });

  it("should filter out orders with missing logistics channel ID", () => {
    /**
     * **Validates: Requirement 3.4**
     * 
     * Test that orders without logistics_channel_id are filtered out and not
     * included in any batch group.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"]
    ]);

    // ORDER002 is missing logistics channel ID
    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER003", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify only 2 orders are included
    expect(result.length).toBe(1);
    expect(result[0].orders.length).toBe(2);
    
    // Verify ORDER002 is not included
    const orderSns = result[0].orders.map(o => o.orderSn);
    expect(orderSns).toContain("ORDER001");
    expect(orderSns).toContain("ORDER003");
    expect(orderSns).not.toContain("ORDER002");
  });

  it("should filter out orders with missing product location ID", () => {
    /**
     * **Validates: Requirement 3.4**
     * 
     * Test that orders without product_location_id are filtered out and not
     * included in any batch group.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER002", "PKG002"],
      ["ORDER003", "PKG003"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    // ORDER002 is missing product location ID
    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify only 2 orders are included
    expect(result.length).toBe(1);
    expect(result[0].orders.length).toBe(2);
    
    // Verify ORDER002 is not included
    const orderSns = result[0].orders.map(o => o.orderSn);
    expect(orderSns).toContain("ORDER001");
    expect(orderSns).toContain("ORDER003");
    expect(orderSns).not.toContain("ORDER002");
  });

  it("should filter out orders with multiple missing fields", () => {
    /**
     * **Validates: Requirement 3.4, 3.5**
     * 
     * Test that orders with multiple missing fields are filtered out.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 },
      { orderSn: "ORDER004", shopId: 12345 }
    ];

    // ORDER002 missing package, ORDER003 missing logistics, ORDER004 missing location
    const packageMap = new Map([
      ["ORDER001", "PKG001"],
      ["ORDER003", "PKG003"],
      ["ORDER004", "PKG004"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER004", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify only ORDER001 is included (the only one with all fields)
    expect(result.length).toBe(1);
    expect(result[0].orders.length).toBe(1);
    expect(result[0].orders[0].orderSn).toBe("ORDER001");
  });

  it("should return empty array when all orders have missing information", () => {
    /**
     * **Validates: Requirement 3.5**
     * 
     * Test that an empty array is returned when all orders have missing
     * package or logistics information.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    // All orders missing package numbers
    const packageMap = new Map();

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify empty result
    expect(result.length).toBe(0);
  });

  it("should handle empty input arrays", () => {
    /**
     * **Validates: Requirement 3.5**
     * 
     * Test that the function handles empty input arrays gracefully.
     */
    const orders: Array<{ orderSn: string; shopId: number }> = [];
    const packageMap = new Map();
    const logisticsMap = new Map();
    const locationMap = new Map();

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify empty result
    expect(result.length).toBe(0);
  });
});

describe("groupOrdersByLogistics - Package number mapping", () => {
  it("should correctly map package numbers to orders in batch groups", () => {
    /**
     * **Validates: Requirement 3.2**
     * 
     * Test that package numbers are correctly mapped to their corresponding
     * orders in the batch groups.
     */
    const orders = [
      { orderSn: "ORDER001", shopId: 12345 },
      { orderSn: "ORDER002", shopId: 12345 },
      { orderSn: "ORDER003", shopId: 12345 }
    ];

    const packageMap = new Map([
      ["ORDER001", "PKG_ABC123"],
      ["ORDER002", "PKG_DEF456"],
      ["ORDER003", "PKG_GHI789"]
    ]);

    const logisticsMap = new Map([
      ["ORDER001", 50001],
      ["ORDER002", 50001],
      ["ORDER003", 50001]
    ]);

    const locationMap = new Map([
      ["ORDER001", "LOC001"],
      ["ORDER002", "LOC001"],
      ["ORDER003", "LOC001"]
    ]);

    const result = groupOrdersByLogistics(orders, packageMap, logisticsMap, locationMap);

    // Verify package numbers are correctly mapped
    expect(result.length).toBe(1);
    const group = result[0];
    
    const order1 = group.orders.find(o => o.orderSn === "ORDER001");
    const order2 = group.orders.find(o => o.orderSn === "ORDER002");
    const order3 = group.orders.find(o => o.orderSn === "ORDER003");
    
    expect(order1?.packageNumber).toBe("PKG_ABC123");
    expect(order2?.packageNumber).toBe("PKG_DEF456");
    expect(order3?.packageNumber).toBe("PKG_GHI789");
  });
});
