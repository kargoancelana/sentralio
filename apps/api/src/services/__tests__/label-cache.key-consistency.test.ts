import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LabelCache } from "../label-cache.service";
import type { LabelDocument } from "../label.service";

/**
 * Property-Based Test: Cache Key Consistency
 * 
 * **Validates: Requirements 13.3**
 * 
 * Property 6: Cache Key Consistency
 * 
 * For any label document stored in or retrieved from cache, the cache key SHALL 
 * be exactly the order_sn string, and for any two cache operations on the same 
 * order_sn, they SHALL reference the same cache entry.
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

describe("Property 6: Cache Key Consistency", () => {
  let cache: LabelCache;

  beforeEach(() => {
    cache = new LabelCache();
    cache.stopCleanup(); // Stop automatic cleanup for controlled testing
  });

  afterEach(() => {
    cache.clear();
    cache.stopCleanup();
  });

  it("should use order_sn as the exact cache key for storage and retrieval", () => {
    /**
     * Property: For any label document stored in cache, the cache key SHALL be
     * exactly the order_sn string.
     * 
     * Test strategy:
     * - Generate multiple order_sn values with different characteristics
     * - Store labels with these order_sn values
     * - Retrieve using the exact same order_sn
     * - Verify retrieval succeeds and returns the correct document
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      return { orderSn, label };
    });

    for (const testCase of testCases) {
      // Store label using order_sn as key
      cache.set(testCase.orderSn, testCase.label);
      
      // Retrieve using the exact same order_sn
      const result = cache.get(testCase.orderSn);
      
      // Property assertion: Should retrieve the exact document stored
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
      expect(result?.format).toBe(testCase.label.format);
      expect(result?.trackingNumber).toBe(testCase.label.trackingNumber);
    }
  });

  it("should reference the same cache entry for multiple operations on the same order_sn", () => {
    /**
     * Property: For any two cache operations on the same order_sn, they SHALL
     * reference the same cache entry.
     * 
     * Test strategy:
     * - Store a label with a specific order_sn
     * - Perform multiple get operations with the same order_sn
     * - Verify all operations return the same document
     * - Verify the cache size remains 1 (same entry)
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const operationCount = Math.floor(Math.random() * 20) + 5; // 5-25 operations
      
      return { orderSn, label, operationCount };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Store label once
      cache.set(testCase.orderSn, testCase.label);
      
      // Verify cache size is 1
      expect(cache.size()).toBe(1);
      
      // Perform multiple get operations
      for (let i = 0; i < testCase.operationCount; i++) {
        const result = cache.get(testCase.orderSn);
        
        // Property: All operations should return the same document
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
        expect(result?.url).toBe(testCase.label.url);
        
        // Cache size should remain 1 (same entry)
        expect(cache.size()).toBe(1);
      }
    }
  });

  it("should maintain separate cache entries for different order_sn values", () => {
    /**
     * Property: Different order_sn values SHALL reference different cache entries.
     * 
     * Test strategy:
     * - Store multiple labels with different order_sn values
     * - Verify each order_sn retrieves its own unique document
     * - Verify cache size equals the number of unique order_sn values
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      return { orderSn, label };
    });

    // Store all labels
    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
    }

    // Verify cache size equals number of unique entries
    expect(cache.size()).toBe(testCases.length);

    // Verify each order_sn retrieves its own document
    for (const testCase of testCases) {
      const result = cache.get(testCase.orderSn);
      
      // Property: Each order_sn should retrieve its own unique document
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
      expect(result?.format).toBe(testCase.label.format);
      expect(result?.trackingNumber).toBe(testCase.label.trackingNumber);
    }
  });

  it("should maintain key consistency across set, get, and delete operations", () => {
    /**
     * Property: Cache key behavior SHALL be consistent across set, get, and delete operations.
     * 
     * Test strategy:
     * - For each order_sn, perform set, get, delete, and get operations
     * - Verify set and first get use the same key (retrieval succeeds)
     * - Verify delete removes the correct entry (second get returns null)
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      return { orderSn, label };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Operation 1: Set
      cache.set(testCase.orderSn, testCase.label);
      expect(cache.size()).toBe(1);
      
      // Operation 2: Get (should succeed)
      const result1 = cache.get(testCase.orderSn);
      expect(result1).not.toBeNull();
      expect(result1?.orderSn).toBe(testCase.orderSn);
      expect(cache.size()).toBe(1);
      
      // Operation 3: Delete (should remove the entry)
      cache.delete(testCase.orderSn);
      expect(cache.size()).toBe(0);
      
      // Operation 4: Get (should return null after delete)
      const result2 = cache.get(testCase.orderSn);
      expect(result2).toBeNull();
      expect(cache.size()).toBe(0);
    }
  });

  it("should handle order_sn values with special characters consistently", () => {
    /**
     * Property: Cache key consistency should hold for order_sn values with
     * various special characters.
     * 
     * Test strategy:
     * - Generate order_sn values with special characters (-, _, ., etc.)
     * - Verify storage and retrieval work correctly
     * - Verify key matching is exact (case-sensitive, character-sensitive)
     */
    
    const specialCharSets = [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
      "abcdefghijklmnopqrstuvwxyz0123456789", // lowercase
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", // mixed case
    ];

    for (const charSet of specialCharSets) {
      const testCases = Array.from({ length: 20 }, () => {
        const length = Math.floor(Math.random() * 20) + 10;
        const orderSn = Array.from({ length }, () => 
          charSet[Math.floor(Math.random() * charSet.length)]
        ).join("");
        const label = generateLabelDocument(orderSn);
        
        return { orderSn, label };
      });

      for (const testCase of testCases) {
        cache.set(testCase.orderSn, testCase.label);
        
        // Retrieve using exact same order_sn
        const result = cache.get(testCase.orderSn);
        
        // Property: Should retrieve the correct document
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
        expect(result?.url).toBe(testCase.label.url);
      }
      
      cache.clear();
    }
  });

  it("should not retrieve documents with similar but different order_sn values", () => {
    /**
     * Property: Cache key matching must be exact - similar but different
     * order_sn values should not match.
     * 
     * Test strategy:
     * - Store a label with a specific order_sn
     * - Attempt to retrieve with slightly modified order_sn values
     * - Verify retrieval fails (returns null)
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      // Generate variations of the order_sn
      const variations = [
        orderSn.toLowerCase(), // Case variation
        orderSn.toUpperCase(), // Case variation
        orderSn + "X", // Extra character
        orderSn.slice(0, -1), // Missing last character
        "X" + orderSn, // Extra character at start
        orderSn.slice(1), // Missing first character
      ].filter(v => v !== orderSn); // Remove if same as original
      
      return { orderSn, label, variations };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Store label with original order_sn
      cache.set(testCase.orderSn, testCase.label);
      
      // Verify original order_sn works
      const originalResult = cache.get(testCase.orderSn);
      expect(originalResult).not.toBeNull();
      
      // Verify variations do NOT match
      for (const variation of testCase.variations) {
        const result = cache.get(variation);
        
        // Property: Similar but different order_sn should not match
        expect(result).toBeNull();
      }
    }
  });

  it("should handle cache updates with the same order_sn key", () => {
    /**
     * Property: When updating a cache entry (storing with the same order_sn),
     * the same cache key should be used, replacing the old entry.
     * 
     * Test strategy:
     * - Store a label with a specific order_sn
     * - Store a different label with the same order_sn
     * - Verify the cache contains only the new label
     * - Verify cache size remains 1 (same key, replaced entry)
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label1 = generateLabelDocument(orderSn);
      const label2 = generateLabelDocument(orderSn);
      
      return { orderSn, label1, label2 };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Store first label
      cache.set(testCase.orderSn, testCase.label1);
      expect(cache.size()).toBe(1);
      
      // Verify first label is stored
      const result1 = cache.get(testCase.orderSn);
      expect(result1).not.toBeNull();
      expect(result1?.url).toBe(testCase.label1.url);
      
      // Store second label with same order_sn (update)
      cache.set(testCase.orderSn, testCase.label2);
      
      // Property: Cache size should still be 1 (same key, replaced entry)
      expect(cache.size()).toBe(1);
      
      // Property: Should retrieve the new label, not the old one
      const result2 = cache.get(testCase.orderSn);
      expect(result2).not.toBeNull();
      expect(result2?.url).toBe(testCase.label2.url);
      expect(result2?.url).not.toBe(testCase.label1.url);
    }
  });

  it("should maintain key consistency with concurrent-like operations", () => {
    /**
     * Property: Multiple rapid operations on the same order_sn should
     * consistently reference the same cache entry.
     * 
     * Test strategy:
     * - Perform rapid set/get/set/get sequences on the same order_sn
     * - Verify all operations reference the same cache key
     * - Verify cache size remains 1 throughout
     */
    
    const testCases = Array.from({ length: 30 }, () => {
      const orderSn = generateOrderSn();
      const labels = Array.from({ length: 10 }, () => generateLabelDocument(orderSn));
      
      return { orderSn, labels };
    });

    for (const testCase of testCases) {
      cache.clear();
      
      // Perform rapid set/get operations
      for (let i = 0; i < testCase.labels.length; i++) {
        // Set
        cache.set(testCase.orderSn, testCase.labels[i]);
        
        // Property: Cache size should always be 1 (same key)
        expect(cache.size()).toBe(1);
        
        // Get
        const result = cache.get(testCase.orderSn);
        
        // Property: Should retrieve the most recently set label
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
        expect(result?.url).toBe(testCase.labels[i].url);
        
        // Cache size should still be 1
        expect(cache.size()).toBe(1);
      }
    }
  });

  it("should handle empty and edge-case order_sn values consistently", () => {
    /**
     * Property: Cache key consistency should hold even for edge-case
     * order_sn values (very short, very long, etc.).
     * 
     * Test strategy:
     * - Test with various edge-case order_sn values
     * - Verify storage and retrieval work correctly
     * - Verify key matching is exact
     */
    
    const edgeCases = [
      "A", // Single character
      "AB", // Two characters
      "123", // Numbers only
      "A".repeat(100), // Very long (100 chars)
      "A".repeat(255), // Very long (255 chars)
      "ORDER-123-ABC", // With dashes
      "ORDER_123_ABC", // With underscores
      "order123abc", // Lowercase
      "ORDER123ABC", // Uppercase
      "OrDeR123AbC", // Mixed case
    ];

    for (const orderSn of edgeCases) {
      const label = generateLabelDocument(orderSn);
      
      cache.clear();
      
      // Store label
      cache.set(orderSn, label);
      
      // Retrieve using exact same order_sn
      const result = cache.get(orderSn);
      
      // Property: Should retrieve the correct document
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(orderSn);
      expect(result?.url).toBe(label.url);
      
      // Verify cache size is 1
      expect(cache.size()).toBe(1);
    }
  });

  it("should maintain key consistency across multiple cache instances", () => {
    /**
     * Property: Cache key behavior should be consistent across different
     * cache instances (testing implementation consistency).
     * 
     * Test strategy:
     * - Create multiple cache instances
     * - Store the same order_sn in each instance
     * - Verify each instance maintains its own separate entry
     * - Verify key behavior is consistent across instances
     */
    
    const testCases = Array.from({ length: 30 }, () => {
      const orderSn = generateOrderSn();
      const label1 = generateLabelDocument(orderSn);
      const label2 = generateLabelDocument(orderSn);
      
      return { orderSn, label1, label2 };
    });

    for (const testCase of testCases) {
      const cache1 = new LabelCache();
      const cache2 = new LabelCache();
      cache1.stopCleanup();
      cache2.stopCleanup();
      
      // Store different labels with same order_sn in different caches
      cache1.set(testCase.orderSn, testCase.label1);
      cache2.set(testCase.orderSn, testCase.label2);
      
      // Property: Each cache should maintain its own entry
      const result1 = cache1.get(testCase.orderSn);
      const result2 = cache2.get(testCase.orderSn);
      
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1?.url).toBe(testCase.label1.url);
      expect(result2?.url).toBe(testCase.label2.url);
      
      // Property: Key behavior should be consistent (both caches use same key)
      expect(result1?.orderSn).toBe(testCase.orderSn);
      expect(result2?.orderSn).toBe(testCase.orderSn);
      
      cache1.stopCleanup();
      cache2.stopCleanup();
    }
  });

  it("should handle interleaved operations on multiple order_sn values", () => {
    /**
     * Property: When performing interleaved operations on multiple order_sn values,
     * each order_sn should consistently reference its own cache entry.
     * 
     * Test strategy:
     * - Generate multiple order_sn values
     * - Perform interleaved set/get operations
     * - Verify each order_sn retrieves its own document
     * - Verify no cross-contamination between keys
     */
    
    const orderSnList = Array.from({ length: 50 }, () => generateOrderSn());
    const labelMap = new Map<string, LabelDocument>();
    
    // Store labels for all order_sn values
    for (const orderSn of orderSnList) {
      const label = generateLabelDocument(orderSn);
      labelMap.set(orderSn, label);
      cache.set(orderSn, label);
    }

    // Verify cache size
    expect(cache.size()).toBe(orderSnList.length);

    // Perform interleaved get operations in random order
    const shuffled = [...orderSnList].sort(() => Math.random() - 0.5);
    
    for (const orderSn of shuffled) {
      const result = cache.get(orderSn);
      const expectedLabel = labelMap.get(orderSn);
      
      // Property: Each order_sn should retrieve its own document
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(orderSn);
      expect(result?.url).toBe(expectedLabel?.url);
      expect(result?.format).toBe(expectedLabel?.format);
      expect(result?.trackingNumber).toBe(expectedLabel?.trackingNumber);
    }

    // Perform interleaved delete operations
    const toDelete = shuffled.slice(0, 25); // Delete half
    for (const orderSn of toDelete) {
      cache.delete(orderSn);
    }

    // Verify remaining entries are still accessible
    const remaining = shuffled.slice(25);
    for (const orderSn of remaining) {
      const result = cache.get(orderSn);
      const expectedLabel = labelMap.get(orderSn);
      
      // Property: Remaining entries should still be accessible
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(orderSn);
      expect(result?.url).toBe(expectedLabel?.url);
    }

    // Verify deleted entries are gone
    for (const orderSn of toDelete) {
      const result = cache.get(orderSn);
      
      // Property: Deleted entries should return null
      expect(result).toBeNull();
    }

    // Verify cache size
    expect(cache.size()).toBe(remaining.length);
  });
});
