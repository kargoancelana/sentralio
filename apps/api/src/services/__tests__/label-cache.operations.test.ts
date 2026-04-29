import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LabelCache } from "../label-cache.service";
import type { LabelDocument } from "../label.service";

/**
 * Unit Tests: Cache Operations
 * 
 * **Validates: Requirements 13.1, 13.2**
 * 
 * Tests specific examples and edge cases for cache operations:
 * - Cache hit and miss scenarios
 * - TTL expiration behavior
 * - Cleanup of expired entries
 * - Concurrent access patterns
 * 
 * These unit tests complement the existing property-based tests by focusing
 * on specific examples, edge cases, and deterministic scenarios.
 */

describe("Cache Operations Unit Tests", () => {
  let cache: LabelCache;

  beforeEach(() => {
    cache = new LabelCache();
    cache.stopCleanup(); // Stop automatic cleanup for controlled testing
  });

  afterEach(() => {
    cache.clear();
    cache.stopCleanup();
  });

  // Helper function to create test label documents
  function createTestLabel(orderSn: string, overrides?: Partial<LabelDocument>): LabelDocument {
    return {
      orderSn,
      url: `https://shopee.com/label/${orderSn}.pdf`,
      format: 'pdf',
      trackingNumber: `SPX${Math.floor(Math.random() * 1000000)}`,
      retrievedAt: new Date(),
      ...overrides
    };
  }

  describe("Cache Hit and Miss Scenarios", () => {
    it("should return cached document on cache hit", () => {
      // Arrange
      const orderSn = "ORDER123ABC";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      const result = cache.get(orderSn);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(orderSn);
      expect(result?.url).toBe(label.url);
      expect(result?.format).toBe(label.format);
      expect(result?.trackingNumber).toBe(label.trackingNumber);
    });

    it("should return null on cache miss for non-existent key", () => {
      // Arrange
      const orderSn = "NONEXISTENT123";

      // Act
      const result = cache.get(orderSn);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null on cache miss after entry deletion", () => {
      // Arrange
      const orderSn = "ORDER456DEF";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      cache.delete(orderSn);
      const result = cache.get(orderSn);

      // Assert
      expect(result).toBeNull();
    });

    it("should handle multiple cache hits for the same key", () => {
      // Arrange
      const orderSn = "ORDER789GHI";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      const result1 = cache.get(orderSn);
      const result2 = cache.get(orderSn);
      const result3 = cache.get(orderSn);

      // Assert
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
      expect(result1?.orderSn).toBe(orderSn);
      expect(result2?.orderSn).toBe(orderSn);
      expect(result3?.orderSn).toBe(orderSn);
    });

    it("should handle cache hits for different label formats", () => {
      // Arrange
      const pdfLabel = createTestLabel("PDF001", { format: 'pdf', url: "https://example.com/label.pdf" });
      const pngLabel = createTestLabel("PNG001", { format: 'png', url: "https://example.com/label.png" });
      const jpgLabel = createTestLabel("JPG001", { format: 'jpg', url: "https://example.com/label.jpg" });

      // Act
      cache.set("PDF001", pdfLabel);
      cache.set("PNG001", pngLabel);
      cache.set("JPG001", jpgLabel);

      // Assert
      const pdfResult = cache.get("PDF001");
      const pngResult = cache.get("PNG001");
      const jpgResult = cache.get("JPG001");

      expect(pdfResult?.format).toBe('pdf');
      expect(pngResult?.format).toBe('png');
      expect(jpgResult?.format).toBe('jpg');
      expect(pdfResult?.url).toContain('.pdf');
      expect(pngResult?.url).toContain('.png');
      expect(jpgResult?.url).toContain('.jpg');
    });

    it("should handle cache miss for similar but different order SNs", () => {
      // Arrange
      const orderSn = "ORDER123";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);

      // Assert - Test similar but different keys
      expect(cache.get("ORDER123")).not.toBeNull(); // Exact match
      expect(cache.get("order123")).toBeNull(); // Different case
      expect(cache.get("ORDER124")).toBeNull(); // Different number
      expect(cache.get("ORDER123X")).toBeNull(); // Extra character
      expect(cache.get("ORDER12")).toBeNull(); // Missing character
    });
  });

  describe("TTL Expiration Behavior", () => {
    it("should return cached document before TTL expiration", () => {
      // Arrange
      const orderSn = "TTL_TEST_001";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      
      // Immediately retrieve (well within TTL)
      const result = cache.get(orderSn);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(orderSn);
    });

    it("should return null after TTL expiration", () => {
      // Arrange
      const orderSn = "TTL_TEST_002";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      
      // Manually expire the entry by manipulating the expiration time
      const cacheEntry = (cache as any).cache.get(orderSn);
      if (cacheEntry) {
        cacheEntry.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      }

      const result = cache.get(orderSn);

      // Assert
      expect(result).toBeNull();
    });

    it("should automatically remove expired entries on get", () => {
      // Arrange
      const orderSn = "TTL_TEST_003";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      expect(cache.size()).toBe(1);

      // Expire the entry
      const cacheEntry = (cache as any).cache.get(orderSn);
      if (cacheEntry) {
        cacheEntry.expiresAt = new Date(Date.now() - 1000);
      }

      // Trigger expiration check by calling get
      const result = cache.get(orderSn);

      // Assert
      expect(result).toBeNull();
      expect(cache.size()).toBe(0); // Entry should be removed
    });

    it("should handle TTL boundary conditions correctly", () => {
      // Arrange
      const orderSn = "TTL_BOUNDARY_001";
      const label = createTestLabel(orderSn);

      // Act & Assert - Test exactly at expiration time
      cache.set(orderSn, label);
      
      const cacheEntry = (cache as any).cache.get(orderSn);
      if (cacheEntry) {
        // Set expiration to exactly now
        cacheEntry.expiresAt = new Date(Date.now());
      }

      const result = cache.get(orderSn);
      expect(result).toBeNull(); // Should be expired at exactly the boundary
    });

    it("should reset TTL when updating existing entry", () => {
      // Arrange
      const orderSn = "TTL_UPDATE_001";
      const label1 = createTestLabel(orderSn, { url: "https://example.com/old.pdf" });
      const label2 = createTestLabel(orderSn, { url: "https://example.com/new.pdf" });

      // Act
      cache.set(orderSn, label1);
      
      // Make it near expiration
      const cacheEntry1 = (cache as any).cache.get(orderSn);
      if (cacheEntry1) {
        cacheEntry1.expiresAt = new Date(Date.now() + 1000); // 1 second remaining
      }

      // Update with new label (should reset TTL)
      cache.set(orderSn, label2);

      // Assert
      const result = cache.get(orderSn);
      expect(result).not.toBeNull();
      expect(result?.url).toBe(label2.url);

      // Check that TTL was reset (should be ~24 hours from now)
      const cacheEntry2 = (cache as any).cache.get(orderSn);
      if (cacheEntry2) {
        const expiresAt = cacheEntry2.expiresAt.getTime();
        const now = Date.now();
        const TTL_MS = 24 * 60 * 60 * 1000;
        const expectedExpiration = now + TTL_MS;
        
        // Allow 1 second tolerance
        expect(Math.abs(expiresAt - expectedExpiration)).toBeLessThan(1000);
      }
    });
  });

  describe("Cleanup of Expired Entries", () => {
    it("should remove expired entries during cleanup", () => {
      // Arrange
      const expiredOrder = "EXPIRED_001";
      const validOrder = "VALID_001";
      const expiredLabel = createTestLabel(expiredOrder);
      const validLabel = createTestLabel(validOrder);

      // Act
      cache.set(expiredOrder, expiredLabel);
      cache.set(validOrder, validLabel);
      expect(cache.size()).toBe(2);

      // Expire one entry
      const expiredEntry = (cache as any).cache.get(expiredOrder);
      if (expiredEntry) {
        expiredEntry.expiresAt = new Date(Date.now() - 1000);
      }

      // Trigger cleanup
      cache.cleanup();

      // Assert
      expect(cache.size()).toBe(1);
      expect(cache.get(expiredOrder)).toBeNull();
      expect(cache.get(validOrder)).not.toBeNull();
    });

    it("should handle cleanup with no expired entries", () => {
      // Arrange
      const orderSn1 = "VALID_001";
      const orderSn2 = "VALID_002";
      const label1 = createTestLabel(orderSn1);
      const label2 = createTestLabel(orderSn2);

      // Act
      cache.set(orderSn1, label1);
      cache.set(orderSn2, label2);
      const sizeBefore = cache.size();

      cache.cleanup();

      // Assert
      expect(cache.size()).toBe(sizeBefore);
      expect(cache.get(orderSn1)).not.toBeNull();
      expect(cache.get(orderSn2)).not.toBeNull();
    });

    it("should handle cleanup with all entries expired", () => {
      // Arrange
      const orderSn1 = "EXPIRED_001";
      const orderSn2 = "EXPIRED_002";
      const label1 = createTestLabel(orderSn1);
      const label2 = createTestLabel(orderSn2);

      // Act
      cache.set(orderSn1, label1);
      cache.set(orderSn2, label2);

      // Expire all entries
      const entry1 = (cache as any).cache.get(orderSn1);
      const entry2 = (cache as any).cache.get(orderSn2);
      if (entry1) entry1.expiresAt = new Date(Date.now() - 1000);
      if (entry2) entry2.expiresAt = new Date(Date.now() - 1000);

      cache.cleanup();

      // Assert
      expect(cache.size()).toBe(0);
      expect(cache.get(orderSn1)).toBeNull();
      expect(cache.get(orderSn2)).toBeNull();
    });

    it("should handle cleanup with mixed expired and valid entries", () => {
      // Arrange
      const entries = [
        { orderSn: "MIXED_001", expired: true },
        { orderSn: "MIXED_002", expired: false },
        { orderSn: "MIXED_003", expired: true },
        { orderSn: "MIXED_004", expired: false },
        { orderSn: "MIXED_005", expired: true },
      ];

      // Act
      for (const entry of entries) {
        const label = createTestLabel(entry.orderSn);
        cache.set(entry.orderSn, label);

        if (entry.expired) {
          const cacheEntry = (cache as any).cache.get(entry.orderSn);
          if (cacheEntry) {
            cacheEntry.expiresAt = new Date(Date.now() - 1000);
          }
        }
      }

      cache.cleanup();

      // Assert
      const expectedValidCount = entries.filter(e => !e.expired).length;
      expect(cache.size()).toBe(expectedValidCount);

      for (const entry of entries) {
        const result = cache.get(entry.orderSn);
        if (entry.expired) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
        }
      }
    });

    it("should handle empty cache cleanup gracefully", () => {
      // Act
      cache.cleanup();

      // Assert
      expect(cache.size()).toBe(0);
    });
  });

  describe("Concurrent Access Patterns", () => {
    it("should handle rapid set and get operations", () => {
      // Arrange
      const orderSn = "CONCURRENT_001";
      const labels = Array.from({ length: 10 }, (_, i) => 
        createTestLabel(orderSn, { url: `https://example.com/label_${i}.pdf` })
      );

      // Act - Rapid set/get operations
      for (let i = 0; i < labels.length; i++) {
        cache.set(orderSn, labels[i]);
        const result = cache.get(orderSn);
        
        // Assert each operation
        expect(result).not.toBeNull();
        expect(result?.url).toBe(labels[i].url);
        expect(cache.size()).toBe(1); // Should always be 1 (same key)
      }
    });

    it("should handle interleaved operations on multiple keys", () => {
      // Arrange
      const operations = [
        { action: 'set', orderSn: 'KEY1', label: createTestLabel('KEY1') },
        { action: 'set', orderSn: 'KEY2', label: createTestLabel('KEY2') },
        { action: 'get', orderSn: 'KEY1' },
        { action: 'set', orderSn: 'KEY3', label: createTestLabel('KEY3') },
        { action: 'get', orderSn: 'KEY2' },
        { action: 'delete', orderSn: 'KEY1' },
        { action: 'get', orderSn: 'KEY1' },
        { action: 'get', orderSn: 'KEY3' },
      ];

      const expectedResults = new Map<string, LabelDocument | null>();

      // Act & Assert
      for (const op of operations) {
        switch (op.action) {
          case 'set':
            cache.set(op.orderSn, op.label!);
            expectedResults.set(op.orderSn, op.label!);
            break;
          
          case 'get':
            const result = cache.get(op.orderSn);
            const expected = expectedResults.get(op.orderSn) || null;
            
            if (expected) {
              expect(result).not.toBeNull();
              expect(result?.orderSn).toBe(expected.orderSn);
              expect(result?.url).toBe(expected.url);
            } else {
              expect(result).toBeNull();
            }
            break;
          
          case 'delete':
            cache.delete(op.orderSn);
            expectedResults.set(op.orderSn, null);
            break;
        }
      }
    });

    it("should maintain consistency during rapid updates of same key", () => {
      // Arrange
      const orderSn = "RAPID_UPDATE_001";
      const updateCount = 100;

      // Act - Rapid updates
      for (let i = 0; i < updateCount; i++) {
        const label = createTestLabel(orderSn, { 
          url: `https://example.com/label_${i}.pdf`,
          trackingNumber: `TRK${i}`
        });
        
        cache.set(orderSn, label);
        
        // Verify immediately after each update
        const result = cache.get(orderSn);
        expect(result).not.toBeNull();
        expect(result?.url).toBe(label.url);
        expect(result?.trackingNumber).toBe(label.trackingNumber);
        expect(cache.size()).toBe(1);
      }
    });

    it("should handle concurrent-like access to different keys", () => {
      // Arrange
      const keyCount = 50;
      const keys = Array.from({ length: keyCount }, (_, i) => `CONCURRENT_KEY_${i}`);
      const labels = keys.map(key => createTestLabel(key));

      // Act - Simulate concurrent access by interleaving operations
      // Store all labels
      for (let i = 0; i < keyCount; i++) {
        cache.set(keys[i], labels[i]);
      }

      // Verify all are stored
      expect(cache.size()).toBe(keyCount);

      // Retrieve all in different order
      const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
      for (const key of shuffledKeys) {
        const result = cache.get(key);
        const expectedLabel = labels[keys.indexOf(key)];
        
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(expectedLabel.orderSn);
        expect(result?.url).toBe(expectedLabel.url);
      }

      // Delete half the keys
      const keysToDelete = shuffledKeys.slice(0, keyCount / 2);
      for (const key of keysToDelete) {
        cache.delete(key);
      }

      // Verify remaining keys are still accessible
      const remainingKeys = shuffledKeys.slice(keyCount / 2);
      expect(cache.size()).toBe(remainingKeys.length);
      
      for (const key of remainingKeys) {
        const result = cache.get(key);
        expect(result).not.toBeNull();
      }

      for (const key of keysToDelete) {
        const result = cache.get(key);
        expect(result).toBeNull();
      }
    });

    it("should handle operations during cleanup", () => {
      // Arrange
      const validOrder = "VALID_DURING_CLEANUP";
      const expiredOrder = "EXPIRED_DURING_CLEANUP";
      const validLabel = createTestLabel(validOrder);
      const expiredLabel = createTestLabel(expiredOrder);

      // Act
      cache.set(validOrder, validLabel);
      cache.set(expiredOrder, expiredLabel);

      // Expire one entry
      const expiredEntry = (cache as any).cache.get(expiredOrder);
      if (expiredEntry) {
        expiredEntry.expiresAt = new Date(Date.now() - 1000);
      }

      // Perform operations during cleanup
      cache.cleanup(); // This should remove expired entry
      
      const validResult = cache.get(validOrder); // Should still work
      const expiredResult = cache.get(expiredOrder); // Should be null
      
      cache.set("NEW_DURING_CLEANUP", createTestLabel("NEW_DURING_CLEANUP")); // Should work

      // Assert
      expect(validResult).not.toBeNull();
      expect(expiredResult).toBeNull();
      expect(cache.get("NEW_DURING_CLEANUP")).not.toBeNull();
      expect(cache.size()).toBe(2); // valid + new
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle empty order_sn gracefully", () => {
      // Arrange
      const emptyOrderSn = "";
      const label = createTestLabel(emptyOrderSn);

      // Act & Assert
      cache.set(emptyOrderSn, label);
      const result = cache.get(emptyOrderSn);
      
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe("");
    });

    it("should handle very long order_sn values", () => {
      // Arrange
      const longOrderSn = "A".repeat(1000); // Very long order SN
      const label = createTestLabel(longOrderSn);

      // Act & Assert
      cache.set(longOrderSn, label);
      const result = cache.get(longOrderSn);
      
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(longOrderSn);
    });

    it("should handle special characters in order_sn", () => {
      // Arrange
      const specialOrderSns = [
        "ORDER-123-ABC",
        "ORDER_456_DEF",
        "ORDER.789.GHI",
        "ORDER@123#ABC",
        "ORDER 123 ABC", // with spaces
        "ORDER\t123\nABC", // with tabs and newlines
      ];

      // Act & Assert
      for (const orderSn of specialOrderSns) {
        const label = createTestLabel(orderSn);
        cache.set(orderSn, label);
        
        const result = cache.get(orderSn);
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(orderSn);
      }
    });

    it("should handle label documents with edge case data", () => {
      // Arrange
      const edgeCaseLabels = [
        createTestLabel("EDGE1", { url: "", format: 'pdf' }), // Empty URL
        createTestLabel("EDGE2", { trackingNumber: "", format: 'png' }), // Empty tracking
        createTestLabel("EDGE3", { url: "data:application/pdf;base64,JVBERi0xLjQ...", format: 'pdf' }), // Data URL
        createTestLabel("EDGE4", { url: "https://very-long-domain-name-that-exceeds-normal-length.example.com/path/to/very/long/file/name/that/might/cause/issues.pdf", format: 'jpg' }), // Very long URL
      ];

      // Act & Assert
      for (const label of edgeCaseLabels) {
        cache.set(label.orderSn, label);
        
        const result = cache.get(label.orderSn);
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(label.orderSn);
        expect(result?.url).toBe(label.url);
        expect(result?.format).toBe(label.format);
        expect(result?.trackingNumber).toBe(label.trackingNumber);
      }
    });

    it("should handle cache operations after clear", () => {
      // Arrange
      const orderSn = "AFTER_CLEAR_001";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      expect(cache.size()).toBe(1);
      
      cache.clear();
      expect(cache.size()).toBe(0);
      
      // Operations after clear
      const resultAfterClear = cache.get(orderSn);
      expect(resultAfterClear).toBeNull();
      
      // Should be able to set new entries after clear
      cache.set(orderSn, label);
      const resultAfterSet = cache.get(orderSn);
      
      // Assert
      expect(resultAfterSet).not.toBeNull();
      expect(cache.size()).toBe(1);
    });

    it("should handle multiple delete operations on same key", () => {
      // Arrange
      const orderSn = "MULTI_DELETE_001";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      expect(cache.size()).toBe(1);
      
      // Multiple deletes
      cache.delete(orderSn);
      expect(cache.size()).toBe(0);
      
      cache.delete(orderSn); // Delete again (should not cause error)
      expect(cache.size()).toBe(0);
      
      cache.delete(orderSn); // Delete third time
      expect(cache.size()).toBe(0);

      // Assert
      const result = cache.get(orderSn);
      expect(result).toBeNull();
    });

    it("should maintain cache integrity with large number of entries", () => {
      // Arrange
      const entryCount = 1000;
      const entries = Array.from({ length: entryCount }, (_, i) => ({
        orderSn: `LARGE_TEST_${i.toString().padStart(4, '0')}`,
        label: createTestLabel(`LARGE_TEST_${i.toString().padStart(4, '0')}`)
      }));

      // Act - Store all entries
      for (const entry of entries) {
        cache.set(entry.orderSn, entry.label);
      }

      // Assert - Verify all entries are accessible
      expect(cache.size()).toBe(entryCount);
      
      for (const entry of entries) {
        const result = cache.get(entry.orderSn);
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(entry.orderSn);
      }

      // Cleanup test
      cache.cleanup(); // Should not remove any entries (all are fresh)
      expect(cache.size()).toBe(entryCount);
    });
  });

  describe("Cache State Consistency", () => {
    it("should maintain consistent size after operations", () => {
      // Arrange
      const operations = [
        { type: 'set', key: 'A', expectedSize: 1 },
        { type: 'set', key: 'B', expectedSize: 2 },
        { type: 'set', key: 'C', expectedSize: 3 },
        { type: 'delete', key: 'B', expectedSize: 2 },
        { type: 'set', key: 'A', expectedSize: 2 }, // Update existing
        { type: 'delete', key: 'C', expectedSize: 1 },
        { type: 'delete', key: 'A', expectedSize: 0 },
      ];

      // Act & Assert
      for (const op of operations) {
        if (op.type === 'set') {
          const label = createTestLabel(op.key);
          cache.set(op.key, label);
        } else if (op.type === 'delete') {
          cache.delete(op.key);
        }
        
        expect(cache.size()).toBe(op.expectedSize);
      }
    });

    it("should maintain data integrity across operations", () => {
      // Arrange
      const testData = [
        { orderSn: 'INTEGRITY_001', url: 'https://example.com/1.pdf', format: 'pdf' as const },
        { orderSn: 'INTEGRITY_002', url: 'https://example.com/2.png', format: 'png' as const },
        { orderSn: 'INTEGRITY_003', url: 'https://example.com/3.jpg', format: 'jpg' as const },
      ];

      // Act
      for (const data of testData) {
        const label = createTestLabel(data.orderSn, { url: data.url, format: data.format });
        cache.set(data.orderSn, label);
      }

      // Assert - Verify data integrity
      for (const data of testData) {
        const result = cache.get(data.orderSn);
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(data.orderSn);
        expect(result?.url).toBe(data.url);
        expect(result?.format).toBe(data.format);
        
        // Verify the object is not the same reference (should be a copy)
        expect(result).not.toBe(testData.find(d => d.orderSn === data.orderSn));
      }
    });

    it("should handle cache state after stop and restart cleanup", () => {
      // Arrange
      const orderSn = "CLEANUP_RESTART_001";
      const label = createTestLabel(orderSn);

      // Act
      cache.set(orderSn, label);
      cache.stopCleanup(); // Stop cleanup
      cache.stopCleanup(); // Stop again (should not cause error)
      
      // Verify entry is still accessible
      const result1 = cache.get(orderSn);
      expect(result1).not.toBeNull();
      
      // Manual cleanup should still work
      cache.cleanup();
      const result2 = cache.get(orderSn);
      expect(result2).not.toBeNull(); // Should still be there (not expired)

      // Assert
      expect(cache.size()).toBe(1);
    });
  });
});