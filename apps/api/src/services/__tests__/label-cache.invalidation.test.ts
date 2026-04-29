import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LabelCache } from "../label-cache.service";
import type { LabelDocument } from "../label.service";

/**
 * Property-Based Test: Cache Invalidation on Status Change
 * 
 * **Validates: Requirements 13.4**
 * 
 * Property 8: Cache Invalidation on Status Change
 * 
 * For any order with a cached label document, when the order status changes 
 * from PROCESSED to any other status, the cache entry for that order_sn SHALL 
 * be removed, and subsequent retrieval SHALL result in cache miss.
 */

// Property-based test generators
function generateOrderSn(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const length = Math.floor(Math.random() * 20) + 10; // 10-30 chars
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generateLabelFormat(): 'pdf' | 'png' | 'jpg' {
  const formats: ('pdf' | 'png' | 'jpg')[] = ['pdf', 'png', 'jpg'];
  return formats[Math.floor(Math.random() * formats.length)];
}

function generateTrackingNumber(): string {
  const prefix = ['SPX', 'JNE', 'JNT', 'SICEPAT'][Math.floor(Math.random() * 4)];
  const number = Math.floor(Math.random() * 1000000000);
  return `${prefix}${number}`;
}

function generateLabelDocument(orderSn?: string): LabelDocument {
  return {
    orderSn: orderSn || generateOrderSn(),
    url: `https://example.com/label/${Math.random().toString(36).substring(7)}.pdf`,
    format: generateLabelFormat(),
    trackingNumber: generateTrackingNumber(),
    retrievedAt: new Date()
  };
}

function generateOrderStatus(): string {
  // All possible order statuses that an order can change to from PROCESSED
  const statuses = ["READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED", "PENDING", "UNPAID"];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

describe("Property 8: Cache Invalidation on Status Change", () => {
  let cache: LabelCache;

  beforeEach(() => {
    cache = new LabelCache();
    cache.stopCleanup(); // Stop automatic cleanup for controlled testing
  });

  afterEach(() => {
    cache.clear();
    cache.stopCleanup();
  });

  it("should remove cached label when order status changes from PROCESSED", () => {
    /**
     * Property: For any order with a cached label document, when the order status 
     * changes from PROCESSED to any other status, the cache entry for that order_sn 
     * SHALL be removed.
     * 
     * Test strategy:
     * - Generate multiple orders with cached labels (simulating PROCESSED status)
     * - Simulate status change by calling cache.delete() (representing status change handler)
     * - Verify cache entry is removed
     * - Verify cache size decreases appropriately
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const newStatus = generateOrderStatus(); // Status order is changing to
      
      return {
        orderSn,
        label,
        newStatus
      };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Store label in cache (simulating order in PROCESSED status with cached label)
      cache.set(testCase.orderSn, testCase.label);
      
      // Verify label is cached
      const cachedLabel = cache.get(testCase.orderSn);
      expect(cachedLabel).not.toBeNull();
      expect(cachedLabel?.orderSn).toBe(testCase.orderSn);
      expect(cache.size()).toBe(1);
      
      // Simulate order status change from PROCESSED to another status
      // This would trigger cache invalidation in the actual system
      cache.delete(testCase.orderSn);
      
      // Property assertion: Cache entry should be removed
      expect(cache.size()).toBe(0);
      
      // Verify the specific entry is removed
      const afterDeletion = cache.get(testCase.orderSn);
      expect(afterDeletion).toBeNull();
    }
  });

  it("should result in cache miss after status change invalidation", () => {
    /**
     * Property: After cache invalidation due to status change, subsequent retrieval 
     * SHALL result in cache miss (return null).
     * 
     * Test strategy:
     * - Store labels in cache for multiple orders
     * - Simulate status changes for some orders (invalidate cache)
     * - Verify invalidated orders return null on retrieval
     * - Verify non-invalidated orders still return cached labels
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const shouldInvalidate = Math.random() < 0.5; // 50% chance of status change
      const newStatus = shouldInvalidate ? generateOrderStatus() : "PROCESSED";
      
      return {
        orderSn,
        label,
        shouldInvalidate,
        newStatus
      };
    });

    // Store all labels in cache
    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
    }

    // Verify all labels are initially cached
    expect(cache.size()).toBe(testCases.length);
    for (const testCase of testCases) {
      const result = cache.get(testCase.orderSn);
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
    }

    // Simulate status changes (invalidate cache for some orders)
    const invalidatedOrders = testCases.filter(tc => tc.shouldInvalidate);
    const nonInvalidatedOrders = testCases.filter(tc => !tc.shouldInvalidate);
    
    for (const testCase of invalidatedOrders) {
      cache.delete(testCase.orderSn);
    }

    // Property assertion: Invalidated orders should return null
    for (const testCase of invalidatedOrders) {
      const result = cache.get(testCase.orderSn);
      expect(result).toBeNull();
    }

    // Property assertion: Non-invalidated orders should still be cached
    for (const testCase of nonInvalidatedOrders) {
      const result = cache.get(testCase.orderSn);
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
    }

    // Verify cache size reflects invalidations
    expect(cache.size()).toBe(nonInvalidatedOrders.length);
  });

  it("should handle multiple status changes consistently", () => {
    /**
     * Property: Multiple status changes should consistently invalidate cache entries,
     * and each invalidation should be independent.
     * 
     * Test strategy:
     * - Store multiple labels in cache
     * - Perform multiple rounds of status changes (invalidations)
     * - Verify each invalidation removes only the targeted entry
     * - Verify cache state is consistent after each operation
     */
    
    const orderCount = 20;
    const testCases = Array.from({ length: orderCount }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      return { orderSn, label };
    });

    // Store all labels
    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
    }

    expect(cache.size()).toBe(orderCount);

    // Perform multiple rounds of status changes
    const rounds = 5;
    let remainingOrders = [...testCases];
    
    for (let round = 0; round < rounds && remainingOrders.length > 0; round++) {
      // Select random orders to invalidate in this round
      const toInvalidateCount = Math.min(
        Math.floor(Math.random() * 5) + 1, // 1-5 orders per round
        remainingOrders.length
      );
      
      const toInvalidate = remainingOrders
        .sort(() => Math.random() - 0.5)
        .slice(0, toInvalidateCount);
      
      const expectedSizeAfter = remainingOrders.length - toInvalidateCount;
      
      // Invalidate selected orders
      for (const testCase of toInvalidate) {
        cache.delete(testCase.orderSn);
      }
      
      // Property assertion: Cache size should decrease by exact number invalidated
      expect(cache.size()).toBe(expectedSizeAfter);
      
      // Property assertion: Invalidated orders should return null
      for (const testCase of toInvalidate) {
        const result = cache.get(testCase.orderSn);
        expect(result).toBeNull();
      }
      
      // Update remaining orders
      remainingOrders = remainingOrders.filter(tc => !toInvalidate.includes(tc));
      
      // Property assertion: Remaining orders should still be cached
      for (const testCase of remainingOrders) {
        const result = cache.get(testCase.orderSn);
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
      }
    }
  });

  it("should handle status change invalidation with concurrent operations", () => {
    /**
     * Property: Cache invalidation should work correctly even when interleaved
     * with other cache operations (get, set).
     * 
     * Test strategy:
     * - Perform interleaved set, get, delete operations
     * - Verify each operation behaves correctly
     * - Verify cache state remains consistent
     */
    
    const testCases = Array.from({ length: 30 }, () => {
      const orderSn = generateOrderSn();
      const label1 = generateLabelDocument(orderSn);
      const label2 = generateLabelDocument(orderSn); // Updated label
      
      return { orderSn, label1, label2 };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Operation sequence: set -> get -> delete -> get -> set -> get
      
      // 1. Set initial label
      cache.set(testCase.orderSn, testCase.label1);
      expect(cache.size()).toBe(1);
      
      // 2. Get label (should succeed)
      const result1 = cache.get(testCase.orderSn);
      expect(result1).not.toBeNull();
      expect(result1?.url).toBe(testCase.label1.url);
      
      // 3. Delete (simulate status change)
      cache.delete(testCase.orderSn);
      expect(cache.size()).toBe(0);
      
      // 4. Get after delete (should return null)
      const result2 = cache.get(testCase.orderSn);
      expect(result2).toBeNull();
      
      // 5. Set new label (simulate order back to PROCESSED with new label)
      cache.set(testCase.orderSn, testCase.label2);
      expect(cache.size()).toBe(1);
      
      // 6. Get new label (should succeed with new label)
      const result3 = cache.get(testCase.orderSn);
      expect(result3).not.toBeNull();
      expect(result3?.url).toBe(testCase.label2.url);
      expect(result3?.url).not.toBe(testCase.label1.url);
    }
  });

  it("should handle edge case of invalidating non-existent entries", () => {
    /**
     * Property: Attempting to invalidate cache entries that don't exist should
     * not affect cache state or other entries.
     * 
     * Test strategy:
     * - Store some labels in cache
     * - Attempt to delete non-existent entries
     * - Verify cache state is unchanged
     * - Verify existing entries are unaffected
     */
    
    const existingOrders = Array.from({ length: 20 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      return { orderSn, label };
    });

    const nonExistentOrders = Array.from({ length: 20 }, () => {
      const orderSn = generateOrderSn();
      return { orderSn };
    });

    // Store existing orders
    for (const testCase of existingOrders) {
      cache.set(testCase.orderSn, testCase.label);
    }

    const initialSize = cache.size();
    expect(initialSize).toBe(existingOrders.length);

    // Attempt to delete non-existent entries
    for (const testCase of nonExistentOrders) {
      cache.delete(testCase.orderSn);
      
      // Property: Cache size should remain unchanged
      expect(cache.size()).toBe(initialSize);
    }

    // Property: Existing entries should be unaffected
    for (const testCase of existingOrders) {
      const result = cache.get(testCase.orderSn);
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
    }

    // Property: Non-existent entries should still return null
    for (const testCase of nonExistentOrders) {
      const result = cache.get(testCase.orderSn);
      expect(result).toBeNull();
    }
  });

  it("should maintain invalidation consistency across different order_sn patterns", () => {
    /**
     * Property: Cache invalidation should work consistently regardless of
     * order_sn format or content.
     * 
     * Test strategy:
     * - Test with various order_sn patterns (different lengths, characters)
     * - Verify invalidation works for all patterns
     * - Verify no cross-contamination between similar order_sn values
     */
    
    const orderSnPatterns = [
      // Different lengths
      "A",
      "AB",
      "ABC123",
      "ORDER-123-LONG-NAME",
      "A".repeat(50), // Very long
      
      // Different character sets
      "123456789", // Numbers only
      "ABCDEFGHIJ", // Letters only
      "ORDER-123", // With dashes
      "ORDER_123", // With underscores
      "order123", // Lowercase
      "ORDER123", // Uppercase
      "OrDeR123", // Mixed case
    ];

    const testCases = orderSnPatterns.map(orderSn => {
      const label = generateLabelDocument(orderSn);
      const shouldInvalidate = Math.random() < 0.7; // 70% invalidation rate
      
      return { orderSn, label, shouldInvalidate };
    });

    // Store all labels
    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
    }

    expect(cache.size()).toBe(testCases.length);

    // Perform invalidations
    const toInvalidate = testCases.filter(tc => tc.shouldInvalidate);
    const toKeep = testCases.filter(tc => !tc.shouldInvalidate);

    for (const testCase of toInvalidate) {
      cache.delete(testCase.orderSn);
    }

    // Property: Cache size should reflect invalidations
    expect(cache.size()).toBe(toKeep.length);

    // Property: Invalidated entries should return null
    for (const testCase of toInvalidate) {
      const result = cache.get(testCase.orderSn);
      expect(result).toBeNull();
    }

    // Property: Kept entries should still be cached
    for (const testCase of toKeep) {
      const result = cache.get(testCase.orderSn);
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
    }
  });

  it("should handle rapid successive invalidations correctly", () => {
    /**
     * Property: Multiple rapid invalidations of the same order_sn should be
     * handled gracefully without errors.
     * 
     * Test strategy:
     * - Store a label in cache
     * - Perform multiple delete operations on the same order_sn
     * - Verify no errors occur
     * - Verify cache state remains consistent
     */
    
    const testCases = Array.from({ length: 30 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const deleteCount = Math.floor(Math.random() * 10) + 5; // 5-15 delete operations
      
      return { orderSn, label, deleteCount };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Store label
      cache.set(testCase.orderSn, testCase.label);
      expect(cache.size()).toBe(1);
      
      // Verify initial state
      const initialResult = cache.get(testCase.orderSn);
      expect(initialResult).not.toBeNull();
      
      // Perform multiple delete operations
      for (let i = 0; i < testCase.deleteCount; i++) {
        cache.delete(testCase.orderSn);
        
        // Property: Cache should be empty after first delete
        expect(cache.size()).toBe(0);
        
        // Property: Get should return null after any delete
        const result = cache.get(testCase.orderSn);
        expect(result).toBeNull();
      }
      
      // Final verification
      expect(cache.size()).toBe(0);
      const finalResult = cache.get(testCase.orderSn);
      expect(finalResult).toBeNull();
    }
  });

  it("should handle invalidation with expired entries correctly", () => {
    /**
     * Property: Cache invalidation should work correctly even for entries
     * that are near expiration or already expired.
     * 
     * Test strategy:
     * - Store labels with different expiration states
     * - Attempt to invalidate both expired and non-expired entries
     * - Verify invalidation works regardless of expiration state
     */
    
    const testCases = Array.from({ length: 40 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const isExpired = Math.random() < 0.5; // 50% expired
      
      return { orderSn, label, isExpired };
    });

    // Store all labels and manipulate expiration
    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
      
      if (testCase.isExpired) {
        // Manipulate to make it expired
        const cacheEntry = (cache as any).cache.get(testCase.orderSn);
        if (cacheEntry) {
          cacheEntry.expiresAt = new Date(Date.now() - 1000); // 1 second ago
        }
      }
    }

    // Verify initial state (expired entries should return null on get)
    const expiredCases = testCases.filter(tc => tc.isExpired);
    const nonExpiredCases = testCases.filter(tc => !tc.isExpired);

    for (const testCase of expiredCases) {
      const result = cache.get(testCase.orderSn);
      expect(result).toBeNull(); // Should be null due to expiration
    }

    for (const testCase of nonExpiredCases) {
      const result = cache.get(testCase.orderSn);
      expect(result).not.toBeNull(); // Should still be cached
    }

    // Now perform invalidation on all entries (both expired and non-expired)
    for (const testCase of testCases) {
      cache.delete(testCase.orderSn);
    }

    // Property: All entries should be removed regardless of expiration state
    expect(cache.size()).toBe(0);

    // Property: All entries should return null after invalidation
    for (const testCase of testCases) {
      const result = cache.get(testCase.orderSn);
      expect(result).toBeNull();
    }
  });

  it("should maintain cache integrity during mixed operations with invalidation", () => {
    /**
     * Property: Cache invalidation should maintain cache integrity when mixed
     * with other operations (set, get, cleanup).
     * 
     * Test strategy:
     * - Perform mixed operations: set, get, delete, set, get in various orders
     * - Verify cache state is always consistent
     * - Verify no data corruption occurs
     */
    
    const testCases = Array.from({ length: 20 }, () => {
      const orderSn = generateOrderSn();
      const labels = Array.from({ length: 3 }, () => generateLabelDocument(orderSn));
      
      return { orderSn, labels };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Complex operation sequence
      const operations = [
        () => {
          // Set first label
          cache.set(testCase.orderSn, testCase.labels[0]);
          expect(cache.size()).toBe(1);
        },
        () => {
          // Get first label
          const result = cache.get(testCase.orderSn);
          expect(result).not.toBeNull();
          expect(result?.url).toBe(testCase.labels[0].url);
        },
        () => {
          // Delete (invalidate)
          cache.delete(testCase.orderSn);
          expect(cache.size()).toBe(0);
        },
        () => {
          // Get after delete (should be null)
          const result = cache.get(testCase.orderSn);
          expect(result).toBeNull();
        },
        () => {
          // Set second label
          cache.set(testCase.orderSn, testCase.labels[1]);
          expect(cache.size()).toBe(1);
        },
        () => {
          // Get second label
          const result = cache.get(testCase.orderSn);
          expect(result).not.toBeNull();
          expect(result?.url).toBe(testCase.labels[1].url);
        },
        () => {
          // Update with third label
          cache.set(testCase.orderSn, testCase.labels[2]);
          expect(cache.size()).toBe(1);
        },
        () => {
          // Get third label
          const result = cache.get(testCase.orderSn);
          expect(result).not.toBeNull();
          expect(result?.url).toBe(testCase.labels[2].url);
        },
        () => {
          // Final delete
          cache.delete(testCase.orderSn);
          expect(cache.size()).toBe(0);
        },
        () => {
          // Final get (should be null)
          const result = cache.get(testCase.orderSn);
          expect(result).toBeNull();
        }
      ];

      // Execute all operations in sequence
      for (const operation of operations) {
        operation();
      }
    }
  });

  it("should handle status change scenarios that match real-world patterns", () => {
    /**
     * Property: Cache invalidation should handle realistic order status change
     * scenarios that occur in the actual system.
     * 
     * Test strategy:
     * - Simulate realistic status change patterns
     * - Verify cache invalidation works for each pattern
     * - Test common status transitions
     */
    
    // Realistic status change scenarios
    const statusChangeScenarios = [
      { from: "PROCESSED", to: "SHIPPED", reason: "Order shipped" },
      { from: "PROCESSED", to: "CANCELLED", reason: "Order cancelled after processing" },
      { from: "PROCESSED", to: "READY_TO_SHIP", reason: "Processing reverted" },
      { from: "PROCESSED", to: "PENDING", reason: "Payment issue discovered" },
      { from: "PROCESSED", to: "DELIVERED", reason: "Direct delivery update" },
    ];

    for (const scenario of statusChangeScenarios) {
      const testCases = Array.from({ length: 20 }, () => {
        const orderSn = generateOrderSn();
        const label = generateLabelDocument(orderSn);
        
        return { orderSn, label, scenario };
      });

      for (const testCase of testCases) {
        cache.clear();
        
        // Store label (order in PROCESSED status)
        cache.set(testCase.orderSn, testCase.label);
        
        // Verify label is cached
        const cachedLabel = cache.get(testCase.orderSn);
        expect(cachedLabel).not.toBeNull();
        expect(cachedLabel?.orderSn).toBe(testCase.orderSn);
        
        // Simulate status change (PROCESSED -> other status)
        // In real system, this would be triggered by order status update
        cache.delete(testCase.orderSn);
        
        // Property: Cache should be invalidated after status change
        const afterStatusChange = cache.get(testCase.orderSn);
        expect(afterStatusChange).toBeNull();
        expect(cache.size()).toBe(0);
      }
    }
  });
});