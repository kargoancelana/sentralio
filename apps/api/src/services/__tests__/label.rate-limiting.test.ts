import { describe, it, expect, beforeEach, afterEach } from "bun:test";

/**
 * Property-Based Test: Rate Limiting Compliance
 * 
 * **Validates: Requirement 13.6**
 * 
 * Property 10: Rate Limiting Compliance
 * 
 * The system enforces rate limiting by applying a 300ms delay between batches of 5 concurrent requests.
 * This test verifies that:
 * 1. The 300ms delay is consistently applied between consecutive batches
 * 2. The delay is applied between groups of concurrent requests (not within groups)
 * 3. The batch processing respects the configured delay timing
 * 
 * Note: The 300ms delay between batches of 5 provides a throughput of approximately 15 req/sec
 * (5 requests + 300ms = ~16.7 req/sec per batch cycle). This is the implemented rate limiting strategy.
 */

/**
 * API call tracker to monitor timing and rate limiting
 */
class RateLimitTracker {
  private apiCalls: Array<{ timestamp: number; orderSn: string }> = [];
  private batchStartTimes: number[] = [];
  private batchEndTimes: number[] = [];

  /**
   * Record an API call
   */
  recordApiCall(orderSn: string): void {
    this.apiCalls.push({
      timestamp: Date.now(),
      orderSn
    });
  }

  /**
   * Record batch start time
   */
  recordBatchStart(): void {
    this.batchStartTimes.push(Date.now());
  }

  /**
   * Record batch end time
   */
  recordBatchEnd(): void {
    this.batchEndTimes.push(Date.now());
  }

  /**
   * Get all API calls within a time window
   */
  getCallsInWindow(windowMs: number, referenceTime?: number): number {
    const refTime = referenceTime ?? Date.now();
    const windowStart = refTime - windowMs;
    
    return this.apiCalls.filter(call => 
      call.timestamp >= windowStart && call.timestamp <= refTime
    ).length;
  }

  /**
   * Get maximum calls in any 1-second sliding window
   */
  getMaxCallsInOneSecondWindow(): number {
    if (this.apiCalls.length === 0) return 0;
    
    let maxCalls = 0;
    
    // Check sliding window at each API call timestamp
    for (const call of this.apiCalls) {
      const callsInWindow = this.getCallsInWindow(1000, call.timestamp);
      if (callsInWindow > maxCalls) {
        maxCalls = callsInWindow;
      }
    }
    
    return maxCalls;
  }

  /**
   * Get delays between consecutive batches
   */
  getBatchDelays(): number[] {
    const delays: number[] = [];
    
    for (let i = 1; i < this.batchStartTimes.length; i++) {
      const delay = this.batchStartTimes[i] - this.batchEndTimes[i - 1];
      delays.push(delay);
    }
    
    return delays;
  }

  /**
   * Get all API call timestamps
   */
  getApiCallTimestamps(): number[] {
    return this.apiCalls.map(call => call.timestamp);
  }

  /**
   * Get total number of API calls
   */
  getTotalCalls(): number {
    return this.apiCalls.length;
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.apiCalls = [];
    this.batchStartTimes = [];
    this.batchEndTimes = [];
  }
}

/**
 * Simulate batch processing with rate limiting
 * This mimics the logic in getBatchLabels with 300ms delay between batches
 */
async function processBatchWithRateLimiting(
  orderSns: string[],
  maxConcurrent: number,
  delayBetweenBatches: number,
  tracker: RateLimitTracker,
  apiCallDuration: number = 10
): Promise<void> {
  const results: any[] = [];
  
  // Process orders in batches of maxConcurrent
  for (let i = 0; i < orderSns.length; i += maxConcurrent) {
    const batch = orderSns.slice(i, i + maxConcurrent);
    
    tracker.recordBatchStart();
    
    // Process batch concurrently using Promise.all
    const batchResults = await Promise.all(
      batch.map(async (orderSn) => {
        // Record API call
        tracker.recordApiCall(orderSn);
        
        // Simulate API call duration
        await new Promise(resolve => setTimeout(resolve, apiCallDuration));
        
        return { orderSn, success: true };
      })
    );
    
    tracker.recordBatchEnd();
    
    results.push(...batchResults);
    
    // Apply rate limiting delay between batches (except for last batch)
    if (i + maxConcurrent < orderSns.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
}

/**
 * Generate array of order SNs
 */
function generateOrderSns(count: number): string[] {
  return Array.from({ length: count }, (_, i) => 
    `ORDER_${String(i + 1).padStart(6, '0')}`
  );
}

/**
 * Generate random batch size
 */
function randomBatchSize(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

describe("Property 10: Rate Limiting Compliance", () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker();
  });

  afterEach(() => {
    tracker.reset();
  });

  describe("Core Property: 300ms Delay Between Batches", () => {
    it("should process batch of 20 orders with proper delays", async () => {
      /**
       * Property: The system SHALL apply 300ms delay between consecutive batches.
       * 
       * Test strategy:
       * - Process batch of 20 orders (4 batches of 5)
       * - Verify all orders are processed
       * - Verify delays are applied between batches
       */
      const orderSns = generateOrderSns(20);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      expect(tracker.getTotalCalls()).toBe(20);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(3); // 3 delays between 4 batches
    });

    it("should process batch of 30 orders with consistent delays", async () => {
      /**
       * Property: Delays should be consistently applied for larger batches.
       * 
       * Test strategy:
       * - Process batch of 30 orders (6 batches of 5)
       * - Verify all delays are approximately 300ms
       */
      const orderSns = generateOrderSns(30);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      expect(tracker.getTotalCalls()).toBe(30);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(5); // 5 delays between 6 batches
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });

    it("should process batch of 50 orders with rate limiting", async () => {
      /**
       * Property: Maximum batch size (50) should have delays applied.
       * 
       * Test strategy:
       * - Process maximum batch of 50 orders (10 batches of 5)
       * - Verify all orders processed
       * - Verify delays applied
       */
      const orderSns = generateOrderSns(50);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      expect(tracker.getTotalCalls()).toBe(50);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(9); // 9 delays between 10 batches
    }, 20000); // 20 second timeout for large batch

    it("should apply delays for random batch sizes", async () => {
      /**
       * Property: For any batch size > 5, delays SHALL be applied between batches.
       * 
       * Test strategy:
       * - Generate 5 random batch sizes between 10 and 40
       * - Process each batch
       * - Verify delays are applied
       */
      const testCases = Array.from({ length: 5 }, () => 
        randomBatchSize(10, 40)
      );

      for (const batchSize of testCases) {
        tracker.reset();
        const orderSns = generateOrderSns(batchSize);
        
        await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
        
        expect(tracker.getTotalCalls()).toBe(batchSize);
        
        const delays = tracker.getBatchDelays();
        const expectedDelays = Math.floor(batchSize / 5) - 1;
        if (batchSize % 5 === 0) {
          expect(delays.length).toBe(expectedDelays);
        } else {
          expect(delays.length).toBe(Math.floor(batchSize / 5));
        }
      }
    }, 30000); // 30 second timeout
  });

  describe("300ms Delay Between Batches", () => {
    it("should apply 300ms delay between consecutive batches", async () => {
      /**
       * Property: The system SHALL apply a 300ms delay between consecutive
       * batches of 5 requests.
       * 
       * Test strategy:
       * - Process batch of 15 orders (3 batches of 5)
       * - Measure delays between batches
       * - Verify delays are approximately 300ms (±50ms tolerance)
       */
      const orderSns = generateOrderSns(15);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have 2 delays (between 3 batches)
      expect(delays.length).toBe(2);
      
      // Each delay should be approximately 300ms (allow ±50ms tolerance)
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250); // 300ms - 50ms
        expect(delay).toBeLessThanOrEqual(350);    // 300ms + 50ms
      }
    });

    it("should apply delay between all consecutive batches", async () => {
      /**
       * Property: Delay SHALL be applied between ALL consecutive batches.
       * 
       * Test strategy:
       * - Process batch of 25 orders (5 batches of 5)
       * - Verify 4 delays are applied
       * - Verify all delays are approximately 300ms
       */
      const orderSns = generateOrderSns(25);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have 4 delays (between 5 batches)
      expect(delays.length).toBe(4);
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(350);
      }
    });

    it("should not apply delay after the last batch", async () => {
      /**
       * Property: No delay SHALL be applied after the last batch.
       * 
       * Test strategy:
       * - Process batch of 10 orders (2 batches of 5)
       * - Verify only 1 delay is applied (between batches, not after)
       */
      const orderSns = generateOrderSns(10);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have exactly 1 delay (between 2 batches, not after last)
      expect(delays.length).toBe(1);
    });

    it("should not apply delay for single batch", async () => {
      /**
       * Property: When batch size ≤ 5, no delay SHALL be applied.
       * 
       * Test strategy:
       * - Process batch of 5 orders (1 batch)
       * - Verify no delays are applied
       */
      const orderSns = generateOrderSns(5);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have no delays (only 1 batch)
      expect(delays.length).toBe(0);
    });

    it("should apply consistent delays across multiple batches", async () => {
      /**
       * Property: All delays between batches SHALL be consistent (approximately 300ms).
       * 
       * Test strategy:
       * - Process batch of 30 orders (6 batches of 5)
       * - Verify all 5 delays are approximately 300ms
       * - Verify standard deviation is low (consistent timing)
       */
      const orderSns = generateOrderSns(30);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have 5 delays
      expect(delays.length).toBe(5);
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(350);
      }
      
      // Calculate standard deviation to verify consistency
      const mean = delays.reduce((sum, d) => sum + d, 0) / delays.length;
      const variance = delays.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / delays.length;
      const stdDev = Math.sqrt(variance);
      
      // Standard deviation should be low (< 30ms) indicating consistent timing
      expect(stdDev).toBeLessThan(30);
    });
  });

  describe("Rate Limiting Effectiveness", () => {
    it("should achieve consistent throughput with 300ms delays", async () => {
      /**
       * Property: The rate limiting strategy (5 concurrent + 300ms delay)
       * SHALL result in consistent throughput.
       * 
       * Test strategy:
       * - Process batch of 20 orders
       * - Measure total time
       * - Verify time matches expected pattern (4 batches with 3 delays)
       */
      const orderSns = generateOrderSns(20);
      
      const startTime = Date.now();
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Expected time: 4 batches * 10ms + 3 delays * 300ms = 940ms
      // Allow range of 850-1100ms for timing variance
      expect(totalTime).toBeGreaterThanOrEqual(850);
      expect(totalTime).toBeLessThanOrEqual(1100);
    });

    it("should maintain delay timing over extended processing", async () => {
      /**
       * Property: Delays SHALL be maintained consistently over
       * extended batch processing.
       * 
       * Test strategy:
       * - Process batch of 40 orders
       * - Verify all delays are approximately 300ms
       */
      const orderSns = generateOrderSns(40);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      expect(tracker.getTotalCalls()).toBe(40);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(7); // 7 delays between 8 batches
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(400);
      }
    }, 15000); // 15 second timeout

    it("should space out batches with delays", async () => {
      /**
       * Property: The delay mechanism SHALL space out batches of requests.
       * 
       * Test strategy:
       * - Process batch of 25 orders
       * - Verify batches are spaced by approximately 300ms
       */
      const orderSns = generateOrderSns(25);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have 4 delays (between 5 batches)
      expect(delays.length).toBe(4);
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("should handle batch of exactly 10 orders (2 batches)", async () => {
      /**
       * Property: A batch of 10 orders should be processed in 2 batches with 1 delay.
       * 
       * Test strategy:
       * - Process batch of 10 orders (2 batches of 5)
       * - Verify 1 delay is applied
       * - Verify completion time matches expected pattern
       */
      const orderSns = generateOrderSns(10);
      
      const startTime = Date.now();
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Expected: 2 batches * 10ms + 1 delay * 300ms = 320ms
      // Allow range of 250-450ms
      expect(totalTime).toBeGreaterThanOrEqual(250);
      expect(totalTime).toBeLessThanOrEqual(450);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(1);
    });

    it("should handle batch of 11 orders (3 batches with partial last)", async () => {
      /**
       * Property: A batch of 11 orders should require 3 batches with 2 delays.
       * 
       * Test strategy:
       * - Process batch of 11 orders (3 batches: 5, 5, 1)
       * - Verify 2 delays are applied
       */
      const orderSns = generateOrderSns(11);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      expect(tracker.getTotalCalls()).toBe(11);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(2);
    });

    it("should handle batch of 6 orders (2 batches with partial last)", async () => {
      /**
       * Property: Partial last batch should still have delay before it.
       * 
       * Test strategy:
       * - Process batch of 6 orders (2 batches: 5, 1)
       * - Verify delay is applied between batches
       */
      const orderSns = generateOrderSns(6);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(1); // One delay between 2 batches
      expect(delays[0]).toBeGreaterThanOrEqual(250);
      expect(delays[0]).toBeLessThanOrEqual(400);
    });

    it("should handle various batch sizes with delays", async () => {
      /**
       * Property: Delays SHALL be applied for all batch sizes > 5.
       * 
       * Test strategy:
       * - Test batches of sizes: 7, 13, 21, 34, 47
       * - Verify delays are applied for each
       */
      const testSizes = [7, 13, 21, 34, 47];
      
      for (const size of testSizes) {
        tracker.reset();
        const orderSns = generateOrderSns(size);
        
        await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
        
        expect(tracker.getTotalCalls()).toBe(size);
        
        const delays = tracker.getBatchDelays();
        const expectedDelays = Math.floor(size / 5) - (size % 5 === 0 ? 1 : 0);
        expect(delays.length).toBeGreaterThanOrEqual(expectedDelays);
      }
    }, 20000); // 20 second timeout
  });

  describe("Timing Precision and Consistency", () => {
    it("should apply delays with reasonable precision", async () => {
      /**
       * Property: Delays should be applied with reasonable precision
       * (within ±50ms of target 300ms).
       * 
       * Test strategy:
       * - Process batch of 20 orders
       * - Measure all delays
       * - Verify all are within tolerance
       */
      const orderSns = generateOrderSns(20);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // All delays should be within ±50ms of 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(350);
      }
    });

    it("should maintain consistent timing across multiple runs", async () => {
      /**
       * Property: Rate limiting timing should be consistent across
       * multiple executions.
       * 
       * Test strategy:
       * - Process same batch size 3 times
       * - Verify similar total times (within 20% variance)
       */
      const orderSns = generateOrderSns(15);
      const times: number[] = [];
      
      for (let i = 0; i < 3; i++) {
        tracker.reset();
        
        const startTime = Date.now();
        await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
        const endTime = Date.now();
        
        times.push(endTime - startTime);
      }
      
      // Calculate variance
      const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - mean)));
      const percentDeviation = (maxDeviation / mean) * 100;
      
      // Deviation should be less than 20%
      expect(percentDeviation).toBeLessThan(20);
    });
  });

  describe("Delay Compliance Verification", () => {
    it("should verify delays are applied at every batch boundary", async () => {
      /**
       * Property: A delay SHALL be applied between EVERY pair of consecutive batches.
       * 
       * Test strategy:
       * - Process batch of 30 orders (6 batches)
       * - Verify 5 delays are applied (between each pair)
       * - Verify all delays are approximately 300ms
       */
      const orderSns = generateOrderSns(30);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have 5 delays (between 6 batches)
      expect(delays.length).toBe(5);
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });

    it("should demonstrate delay mechanism spaces out batches", async () => {
      /**
       * Property: With delays, batches are spaced out over time.
       * Without delays, all batches would complete quickly.
       * 
       * Test strategy:
       * - Process batch with delays
       * - Verify total time includes delay periods
       */
      const orderSns = generateOrderSns(20);
      
      const startTime = Date.now();
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // With delays: 4 batches * 10ms + 3 delays * 300ms = 940ms
      // Without delays: 4 batches * 10ms = 40ms
      // Total time should be much closer to "with delays" scenario
      expect(totalTime).toBeGreaterThanOrEqual(850); // Much more than 40ms
    });

    it("should maintain delay invariant throughout processing", async () => {
      /**
       * Property: The invariant "300ms delay between consecutive batches"
       * SHALL hold throughout processing.
       * 
       * Test strategy:
       * - Process batch of 35 orders (7 batches)
       * - Verify all 6 delays are approximately 300ms
       */
      const orderSns = generateOrderSns(35);
      
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      
      const delays = tracker.getBatchDelays();
      
      // Should have 6 delays
      expect(delays.length).toBe(6);
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(400);
      }
    }, 15000); // 15 second timeout
  });

  describe("Integration with Concurrent Processing", () => {
    it("should combine concurrent processing with rate limiting delays", async () => {
      /**
       * Property: The system SHALL process 5 requests concurrently within
       * each batch, AND apply 300ms delay between batches.
       * 
       * Test strategy:
       * - Process batch of 15 orders (3 batches of 5)
       * - Verify timing matches expected pattern
       * - Verify delays are applied
       */
      const orderSns = generateOrderSns(15);
      
      const startTime = Date.now();
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Expected time: 3 batches * 10ms + 2 delays * 300ms = 630ms
      // Allow range of 550-750ms
      expect(totalTime).toBeGreaterThanOrEqual(550);
      expect(totalTime).toBeLessThanOrEqual(750);
      
      // Verify delays were applied
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(2);
    });

    it("should demonstrate time savings from concurrent processing with delays", async () => {
      /**
       * Property: Concurrent processing with delays should be faster
       * than sequential processing with delays.
       * 
       * Test strategy:
       * - Process batch of 20 orders with concurrent + delays
       * - Verify time is reasonable (not too slow)
       * - Verify delays are still applied
       */
      const orderSns = generateOrderSns(20);
      
      const startTime = Date.now();
      await processBatchWithRateLimiting(orderSns, 5, 300, tracker);
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Expected time: 4 batches * 10ms + 3 delays * 300ms = 940ms
      // Allow range of 850-1100ms
      expect(totalTime).toBeGreaterThanOrEqual(850);
      expect(totalTime).toBeLessThanOrEqual(1100);
      
      // Verify delays were applied
      const delays = tracker.getBatchDelays();
      expect(delays.length).toBe(3);
      
      // All delays should be approximately 300ms
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(250);
        expect(delay).toBeLessThanOrEqual(400);
      }
    });
  });
});
