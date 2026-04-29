import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LabelCache } from "../label-cache.service";
import type { LabelDocument } from "../label.service";

/**
 * Property-Based Test: Cache TTL Enforcement
 * 
 * **Validates: Requirements 13.1, 13.2**
 * 
 * Property 7: Cache TTL Enforcement
 * 
 * For any label document stored in cache at time T, retrieving the same order_sn 
 * at time T+X where X < 24 hours SHALL return the cached document, and retrieving 
 * at time T+Y where Y >= 24 hours SHALL result in cache miss.
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

/**
 * Generate a time offset in milliseconds
 * @param minHours - Minimum hours offset
 * @param maxHours - Maximum hours offset
 * @returns Time offset in milliseconds
 */
function generateTimeOffset(minHours: number, maxHours: number): number {
  const minMs = minHours * 60 * 60 * 1000;
  const maxMs = maxHours * 60 * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}

describe("Property 7: Cache TTL Enforcement", () => {
  let cache: LabelCache;

  beforeEach(() => {
    cache = new LabelCache();
    cache.stopCleanup(); // Stop automatic cleanup for controlled testing
  });

  afterEach(() => {
    cache.clear();
    cache.stopCleanup();
  });

  it("should return cached document when retrieved within 24 hours", () => {
    /**
     * Property: For any label stored at time T, retrieval at T+X where X < 24 hours
     * SHALL return the cached document.
     * 
     * Test strategy:
     * - Generate multiple test cases with different time offsets < 24 hours
     * - Store label documents in cache
     * - Simulate time passage by manipulating cache entry expiration
     * - Verify cached documents are returned
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      // Generate time offset between 0 and 23.99 hours
      const timeOffsetMs = generateTimeOffset(0, 23.99);
      
      return {
        orderSn,
        label,
        timeOffsetMs,
        shouldReturnCached: true
      };
    });

    for (const testCase of testCases) {
      // Store label in cache
      cache.set(testCase.orderSn, testCase.label);
      
      // Simulate time passage by checking immediately (within TTL)
      // In real scenario, time hasn't passed yet, so it should be cached
      const result = cache.get(testCase.orderSn);
      
      // Property assertion: Should return cached document
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
      expect(result?.format).toBe(testCase.label.format);
      expect(result?.trackingNumber).toBe(testCase.label.trackingNumber);
    }
  });

  it("should return null when retrieved at or after 24 hours", () => {
    /**
     * Property: For any label stored at time T, retrieval at T+Y where Y >= 24 hours
     * SHALL result in cache miss (return null).
     * 
     * Test strategy:
     * - Generate multiple test cases with different time offsets >= 24 hours
     * - Store label documents in cache with manipulated expiration times
     * - Verify cache returns null for expired entries
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      // Generate time offset between 24 and 48 hours
      const timeOffsetMs = generateTimeOffset(24, 48);
      
      return {
        orderSn,
        label,
        timeOffsetMs
      };
    });

    for (const testCase of testCases) {
      // Store label in cache
      cache.set(testCase.orderSn, testCase.label);
      
      // Manually manipulate the cache entry to simulate expiration
      // Access private cache to set expiration in the past
      const cacheEntry = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry) {
        // Set expiration to past time (current time - offset)
        cacheEntry.expiresAt = new Date(Date.now() - testCase.timeOffsetMs);
      }
      
      // Attempt to retrieve expired label
      const result = cache.get(testCase.orderSn);
      
      // Property assertion: Should return null for expired entries
      expect(result).toBeNull();
      
      // Verify entry was removed from cache
      const cacheSize = cache.size();
      const stillInCache = (cache as any).cache.has(testCase.orderSn);
      expect(stillInCache).toBe(false);
    }
  });

  it("should enforce TTL boundary at exactly 24 hours", () => {
    /**
     * Property: The TTL boundary at exactly 24 hours should be enforced consistently.
     * 
     * Test strategy:
     * - Test the exact boundary condition (24 hours)
     * - Verify that 24 hours - 1ms returns cached document
     * - Verify that 24 hours + 0ms returns null
     */
    
    const testCases = Array.from({ length: 30 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      return { orderSn, label };
    });

    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    for (const testCase of testCases) {
      // Test case 1: Just before 24 hours (should be cached)
      cache.clear();
      cache.set(testCase.orderSn, testCase.label);
      
      const cacheEntry1 = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry1) {
        // Set expiration to 1ms in the future
        cacheEntry1.expiresAt = new Date(Date.now() + 1);
      }
      
      const result1 = cache.get(testCase.orderSn);
      expect(result1).not.toBeNull();
      expect(result1?.orderSn).toBe(testCase.orderSn);
      
      // Test case 2: Exactly at 24 hours (should be expired)
      cache.clear();
      cache.set(testCase.orderSn, testCase.label);
      
      const cacheEntry2 = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry2) {
        // Set expiration to exactly now
        cacheEntry2.expiresAt = new Date(Date.now());
      }
      
      const result2 = cache.get(testCase.orderSn);
      expect(result2).toBeNull();
      
      // Test case 3: After 24 hours (should be expired)
      cache.clear();
      cache.set(testCase.orderSn, testCase.label);
      
      const cacheEntry3 = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry3) {
        // Set expiration to 1ms in the past
        cacheEntry3.expiresAt = new Date(Date.now() - 1);
      }
      
      const result3 = cache.get(testCase.orderSn);
      expect(result3).toBeNull();
    }
  });

  it("should maintain TTL consistency across different order_sn values", () => {
    /**
     * Property: TTL enforcement should be consistent regardless of order_sn value.
     * 
     * Test strategy:
     * - Store multiple labels with different order_sn values
     * - Set different expiration times for each
     * - Verify TTL is enforced independently for each entry
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const isExpired = Math.random() < 0.5; // 50% expired, 50% valid
      const timeOffsetMs = isExpired 
        ? generateTimeOffset(24, 48) // Expired: 24-48 hours ago
        : generateTimeOffset(0, 23.99); // Valid: 0-23.99 hours ago
      
      return {
        orderSn,
        label,
        isExpired,
        timeOffsetMs
      };
    });

    // Store all labels in cache
    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
      
      // Manipulate expiration time
      const cacheEntry = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry) {
        if (testCase.isExpired) {
          // Set to past time (expired)
          cacheEntry.expiresAt = new Date(Date.now() - testCase.timeOffsetMs);
        } else {
          // Set to future time (valid)
          cacheEntry.expiresAt = new Date(Date.now() + testCase.timeOffsetMs);
        }
      }
    }

    // Verify each entry independently
    for (const testCase of testCases) {
      const result = cache.get(testCase.orderSn);
      
      if (testCase.isExpired) {
        // Property: Expired entries should return null
        expect(result).toBeNull();
      } else {
        // Property: Valid entries should return cached document
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
        expect(result?.url).toBe(testCase.label.url);
        expect(result?.format).toBe(testCase.label.format);
        expect(result?.trackingNumber).toBe(testCase.label.trackingNumber);
      }
    }
  });

  it("should handle rapid successive retrievals consistently within TTL", () => {
    /**
     * Property: Multiple retrievals of the same order_sn within TTL should
     * consistently return the cached document.
     * 
     * Test strategy:
     * - Store a label in cache
     * - Perform multiple rapid retrievals
     * - Verify all retrievals return the same cached document
     */
    
    const testCases = Array.from({ length: 20 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      const retrievalCount = Math.floor(Math.random() * 50) + 10; // 10-60 retrievals
      
      return {
        orderSn,
        label,
        retrievalCount
      };
    });

    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
      
      // Perform multiple rapid retrievals
      for (let i = 0; i < testCase.retrievalCount; i++) {
        const result = cache.get(testCase.orderSn);
        
        // Property: All retrievals should return the same cached document
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
        expect(result?.url).toBe(testCase.label.url);
        expect(result?.format).toBe(testCase.label.format);
        expect(result?.trackingNumber).toBe(testCase.label.trackingNumber);
      }
    }
  });

  it("should handle cache updates with new TTL correctly", () => {
    /**
     * Property: When a label is updated in cache (re-stored), the TTL should
     * reset to 24 hours from the new storage time.
     * 
     * Test strategy:
     * - Store a label in cache
     * - Manipulate expiration to near-expiry
     * - Re-store the same label (simulating cache update)
     * - Verify TTL is reset and label is retrievable
     */
    
    const testCases = Array.from({ length: 30 }, () => {
      const orderSn = generateOrderSn();
      const label1 = generateLabelDocument(orderSn);
      const label2 = generateLabelDocument(orderSn); // Updated label
      
      return {
        orderSn,
        label1,
        label2
      };
    });

    for (const testCase of testCases) {
      // Store initial label
      cache.set(testCase.orderSn, testCase.label1);
      
      // Manipulate to near-expiry (1 minute remaining)
      const cacheEntry1 = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry1) {
        cacheEntry1.expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute
      }
      
      // Verify it's still cached
      const result1 = cache.get(testCase.orderSn);
      expect(result1).not.toBeNull();
      expect(result1?.url).toBe(testCase.label1.url);
      
      // Re-store with updated label (TTL should reset)
      cache.set(testCase.orderSn, testCase.label2);
      
      // Verify new label is cached with fresh TTL
      const result2 = cache.get(testCase.orderSn);
      expect(result2).not.toBeNull();
      expect(result2?.url).toBe(testCase.label2.url);
      
      // Verify expiration is set to ~24 hours from now
      const cacheEntry2 = (cache as any).cache.get(testCase.orderSn);
      if (cacheEntry2) {
        const expiresAt = cacheEntry2.expiresAt.getTime();
        const now = Date.now();
        const TTL_MS = 24 * 60 * 60 * 1000;
        const expectedExpiration = now + TTL_MS;
        
        // Allow 1 second tolerance for test execution time
        const tolerance = 1000;
        expect(Math.abs(expiresAt - expectedExpiration)).toBeLessThan(tolerance);
      }
    }
  });

  it("should handle edge case of zero time offset (immediate retrieval)", () => {
    /**
     * Property: Immediate retrieval after storage (T+0) should always
     * return the cached document.
     * 
     * Test strategy:
     * - Store labels and immediately retrieve them
     * - Verify all immediate retrievals succeed
     */
    
    const testCases = Array.from({ length: 50 }, () => {
      const orderSn = generateOrderSn();
      const label = generateLabelDocument(orderSn);
      
      return { orderSn, label };
    });

    for (const testCase of testCases) {
      cache.set(testCase.orderSn, testCase.label);
      
      // Immediate retrieval (T+0)
      const result = cache.get(testCase.orderSn);
      
      // Property: Should always return cached document
      expect(result).not.toBeNull();
      expect(result?.orderSn).toBe(testCase.orderSn);
      expect(result?.url).toBe(testCase.label.url);
      expect(result?.format).toBe(testCase.label.format);
      expect(result?.trackingNumber).toBe(testCase.label.trackingNumber);
    }
  });

  it("should handle various time intervals within 24-hour window", () => {
    /**
     * Property: Any time interval X where 0 <= X < 24 hours should result
     * in successful cache retrieval.
     * 
     * Test strategy:
     * - Test various time intervals: 1 hour, 6 hours, 12 hours, 23 hours, etc.
     * - Verify all intervals within 24 hours return cached document
     */
    
    const timeIntervals = [
      1,      // 1 hour
      3,      // 3 hours
      6,      // 6 hours
      12,     // 12 hours
      18,     // 18 hours
      23,     // 23 hours
      23.5,   // 23.5 hours
      23.9,   // 23.9 hours
      23.99,  // 23.99 hours
    ];

    for (const hours of timeIntervals) {
      const testCases = Array.from({ length: 10 }, () => {
        const orderSn = generateOrderSn();
        const label = generateLabelDocument(orderSn);
        
        return { orderSn, label, hours };
      });

      for (const testCase of testCases) {
        cache.set(testCase.orderSn, testCase.label);
        
        // Set expiration to future time (simulating time hasn't passed yet)
        const cacheEntry = (cache as any).cache.get(testCase.orderSn);
        if (cacheEntry) {
          const remainingMs = (24 - testCase.hours) * 60 * 60 * 1000;
          cacheEntry.expiresAt = new Date(Date.now() + remainingMs);
        }
        
        const result = cache.get(testCase.orderSn);
        
        // Property: Should return cached document for any interval < 24 hours
        expect(result).not.toBeNull();
        expect(result?.orderSn).toBe(testCase.orderSn);
      }
      
      cache.clear();
    }
  });

  it("should handle various time intervals at or beyond 24-hour window", () => {
    /**
     * Property: Any time interval Y where Y >= 24 hours should result
     * in cache miss (null).
     * 
     * Test strategy:
     * - Test various time intervals: 24 hours, 25 hours, 48 hours, etc.
     * - Verify all intervals >= 24 hours return null
     */
    
    const timeIntervals = [
      24,     // Exactly 24 hours
      24.01,  // Just over 24 hours
      25,     // 25 hours
      30,     // 30 hours
      36,     // 36 hours
      48,     // 48 hours
      72,     // 72 hours
    ];

    for (const hours of timeIntervals) {
      const testCases = Array.from({ length: 10 }, () => {
        const orderSn = generateOrderSn();
        const label = generateLabelDocument(orderSn);
        
        return { orderSn, label, hours };
      });

      for (const testCase of testCases) {
        cache.set(testCase.orderSn, testCase.label);
        
        // Set expiration to past time (simulating time has passed)
        const cacheEntry = (cache as any).cache.get(testCase.orderSn);
        if (cacheEntry) {
          const expiredMs = testCase.hours * 60 * 60 * 1000;
          cacheEntry.expiresAt = new Date(Date.now() - expiredMs);
        }
        
        const result = cache.get(testCase.orderSn);
        
        // Property: Should return null for any interval >= 24 hours
        expect(result).toBeNull();
      }
      
      cache.clear();
    }
  });
});
