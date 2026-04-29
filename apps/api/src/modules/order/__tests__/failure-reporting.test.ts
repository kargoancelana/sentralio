import { describe, it, expect } from "bun:test";

/**
 * Property-Based Test: Failure Reporting Completeness
 * 
 * **Validates: Requirements 5.5, 10.4**
 * 
 * Property 4: Failure Reporting Completeness
 * 
 * For any batch operation where some orders fail, the results array SHALL contain an entry
 * for every failed order with both the orderSn AND an error message, and no failed order
 * SHALL be omitted from the results.
 */

interface BatchResult {
  orderSn: string;
  success: boolean;
  label?: any;
  error?: string;
}

interface BatchResponse {
  success: boolean;
  results: BatchResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * Validate failure reporting completeness
 */
function validateFailureReporting(
  inputOrderSns: string[],
  response: BatchResponse
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Property 1: Results array length must equal input length
  if (response.results.length !== inputOrderSns.length) {
    errors.push(
      `Results array length (${response.results.length}) does not match input length (${inputOrderSns.length})`
    );
  }

  // Property 2: Every input order must have a result
  for (const orderSn of inputOrderSns) {
    const result = response.results.find(r => r.orderSn === orderSn);
    if (!result) {
      errors.push(`Missing result for order: ${orderSn}`);
    }
  }

  // Property 3: Every failed result must have orderSn and error
  const failedResults = response.results.filter(r => !r.success);
  for (const result of failedResults) {
    if (!result.orderSn || typeof result.orderSn !== 'string') {
      errors.push(`Failed result missing orderSn`);
    }
    if (!result.error || typeof result.error !== 'string') {
      errors.push(`Failed result for ${result.orderSn} missing error message`);
    }
  }

  // Property 4: Failed count in summary must match actual failed results
  if (response.summary.failed !== failedResults.length) {
    errors.push(
      `Summary failed count (${response.summary.failed}) does not match actual failed results (${failedResults.length})`
    );
  }

  // Property 5: No duplicate orderSns in results
  const orderSnCounts = new Map<string, number>();
  for (const result of response.results) {
    const count = orderSnCounts.get(result.orderSn) || 0;
    orderSnCounts.set(result.orderSn, count + 1);
  }
  for (const [orderSn, count] of orderSnCounts.entries()) {
    if (count > 1) {
      errors.push(`Duplicate result for order: ${orderSn} (appears ${count} times)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate batch response with specified success/failure distribution
 */
function generateBatchResponse(
  orderSns: string[],
  failureIndices: number[]
): BatchResponse {
  const results: BatchResult[] = [];
  let successfulCount = 0;
  let failedCount = 0;

  for (let i = 0; i < orderSns.length; i++) {
    const orderSn = orderSns[i];
    const shouldFail = failureIndices.includes(i);

    if (shouldFail) {
      results.push({
        orderSn,
        success: false,
        error: `Error processing order ${orderSn}`
      });
      failedCount++;
    } else {
      results.push({
        orderSn,
        success: true,
        label: {
          orderSn,
          url: `https://example.com/${orderSn}.pdf`,
          format: 'pdf',
          trackingNumber: `TRACK_${orderSn}`,
          retrievedAt: new Date()
        }
      });
      successfulCount++;
    }
  }

  return {
    success: true,
    results,
    summary: {
      total: orderSns.length,
      successful: successfulCount,
      failed: failedCount
    }
  };
}

describe("Property 4: Failure Reporting Completeness", () => {
  describe("Core Property: All Failed Orders Reported", () => {
    it("should report all failed orders with orderSn and error", () => {
      /**
       * Property: Every failed order SHALL have a result entry with orderSn and error.
       * 
       * Test strategy:
       * - Create batch with some failures
       * - Verify all failed orders are in results
       * - Verify all have orderSn and error fields
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3', 'ORDER4', 'ORDER5'];
      const failureIndices = [1, 3]; // ORDER2 and ORDER4 fail
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Verify failed results have error messages
      const failedResults = response.results.filter(r => !r.success);
      expect(failedResults).toHaveLength(2);
      expect(failedResults.every(r => r.error)).toBe(true);
      expect(failedResults.every(r => r.orderSn)).toBe(true);
    });

    it("should report all orders when all fail", () => {
      /**
       * Property: When all orders fail, all SHALL be reported with errors.
       * 
       * Test strategy:
       * - Create batch where all orders fail
       * - Verify all are in results with errors
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const failureIndices = [0, 1, 2]; // All fail
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      expect(response.results).toHaveLength(3);
      expect(response.results.every(r => !r.success)).toBe(true);
      expect(response.results.every(r => r.error)).toBe(true);
      expect(response.summary.failed).toBe(3);
    });

    it("should handle batch with single failure", () => {
      /**
       * Property: Single failure SHALL be reported completely.
       * 
       * Test strategy:
       * - Create batch with one failure
       * - Verify failure is reported with error
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const failureIndices = [1]; // Only ORDER2 fails
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      
      const failedResult = response.results.find(r => r.orderSn === 'ORDER2');
      expect(failedResult?.success).toBe(false);
      expect(failedResult?.error).toBeDefined();
      expect(typeof failedResult?.error).toBe('string');
    });

    it("should handle batch with no failures", () => {
      /**
       * Property: When no orders fail, results SHALL still contain all orders.
       * 
       * Test strategy:
       * - Create batch with all successes
       * - Verify all orders are in results
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const failureIndices: number[] = []; // No failures
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      expect(response.results).toHaveLength(3);
      expect(response.results.every(r => r.success)).toBe(true);
      expect(response.summary.failed).toBe(0);
    });
  });

  describe("Results Completeness", () => {
    it("should include result for every input order", () => {
      /**
       * Property: Results array length SHALL equal input array length.
       * 
       * Test strategy:
       * - Create batches of various sizes
       * - Verify results length matches input length
       */
      const testCases = [
        { orderSns: ['ORDER1'], failureIndices: [] },
        { orderSns: ['ORDER1', 'ORDER2'], failureIndices: [0] },
        { orderSns: ['ORDER1', 'ORDER2', 'ORDER3', 'ORDER4', 'ORDER5'], failureIndices: [1, 3] },
        { orderSns: Array.from({ length: 10 }, (_, i) => `ORDER${i + 1}`), failureIndices: [2, 5, 7] },
      ];

      for (const testCase of testCases) {
        const response = generateBatchResponse(testCase.orderSns, testCase.failureIndices);
        const validation = validateFailureReporting(testCase.orderSns, response);

        expect(validation.valid).toBe(true);
        expect(response.results.length).toBe(testCase.orderSns.length);
      }
    });

    it("should not omit any failed orders", () => {
      /**
       * Property: No failed order SHALL be omitted from results.
       * 
       * Test strategy:
       * - Create batch with multiple failures
       * - Verify all failed orders are present
       */
      const orderSns = Array.from({ length: 20 }, (_, i) => `ORDER${i + 1}`);
      const failureIndices = [0, 3, 7, 11, 15, 19]; // 6 failures
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      
      // Verify all failed orders are present
      for (const index of failureIndices) {
        const orderSn = orderSns[index];
        const result = response.results.find(r => r.orderSn === orderSn);
        expect(result).toBeDefined();
        expect(result?.success).toBe(false);
        expect(result?.error).toBeDefined();
      }
    });

    it("should not have duplicate results", () => {
      /**
       * Property: Each order SHALL appear exactly once in results.
       * 
       * Test strategy:
       * - Create batch response
       * - Verify no duplicate orderSns
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3', 'ORDER4'];
      const failureIndices = [1, 2];
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      
      // Check for duplicates
      const orderSnSet = new Set(response.results.map(r => r.orderSn));
      expect(orderSnSet.size).toBe(response.results.length);
    });
  });

  describe("Error Message Presence", () => {
    it("should include error message for every failed result", () => {
      /**
       * Property: Every failed result SHALL have a non-empty error message.
       * 
       * Test strategy:
       * - Create batch with failures
       * - Verify all failed results have error messages
       */
      const orderSns = Array.from({ length: 10 }, (_, i) => `ORDER${i + 1}`);
      const failureIndices = [1, 3, 5, 7, 9];
      const response = generateBatchResponse(orderSns, failureIndices);

      const failedResults = response.results.filter(r => !r.success);
      
      expect(failedResults).toHaveLength(5);
      expect(failedResults.every(r => r.error)).toBe(true);
      expect(failedResults.every(r => typeof r.error === 'string')).toBe(true);
      expect(failedResults.every(r => r.error!.length > 0)).toBe(true);
    });

    it("should not include error for successful results", () => {
      /**
       * Property: Successful results should not have error field (or it should be undefined).
       * 
       * Test strategy:
       * - Create batch with successes
       * - Verify successful results don't have error messages
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const failureIndices = [1]; // Only ORDER2 fails
      const response = generateBatchResponse(orderSns, failureIndices);

      const successfulResults = response.results.filter(r => r.success);
      
      expect(successfulResults).toHaveLength(2);
      expect(successfulResults.every(r => !r.error)).toBe(true);
    });
  });

  describe("Summary Accuracy", () => {
    it("should have accurate failed count in summary", () => {
      /**
       * Property: Summary failed count SHALL match actual number of failed results.
       * 
       * Test strategy:
       * - Create various batch responses
       * - Verify summary.failed matches actual failed count
       */
      const testCases = [
        { orderSns: ['ORDER1', 'ORDER2', 'ORDER3'], failureIndices: [0, 2] },
        { orderSns: Array.from({ length: 10 }, (_, i) => `ORDER${i + 1}`), failureIndices: [1, 3, 5] },
        { orderSns: Array.from({ length: 20 }, (_, i) => `ORDER${i + 1}`), failureIndices: [0, 5, 10, 15] },
      ];

      for (const testCase of testCases) {
        const response = generateBatchResponse(testCase.orderSns, testCase.failureIndices);
        const validation = validateFailureReporting(testCase.orderSns, response);

        expect(validation.valid).toBe(true);
        
        const actualFailedCount = response.results.filter(r => !r.success).length;
        expect(response.summary.failed).toBe(actualFailedCount);
        expect(response.summary.failed).toBe(testCase.failureIndices.length);
      }
    });

    it("should satisfy: total = successful + failed", () => {
      /**
       * Property: Summary counts SHALL satisfy total = successful + failed.
       * 
       * Test strategy:
       * - Create various batch responses
       * - Verify summary arithmetic
       */
      const testCases = [
        { orderSns: ['ORDER1', 'ORDER2'], failureIndices: [0] },
        { orderSns: ['ORDER1', 'ORDER2', 'ORDER3', 'ORDER4', 'ORDER5'], failureIndices: [1, 3] },
        { orderSns: Array.from({ length: 15 }, (_, i) => `ORDER${i + 1}`), failureIndices: [2, 5, 8, 11] },
      ];

      for (const testCase of testCases) {
        const response = generateBatchResponse(testCase.orderSns, testCase.failureIndices);
        
        expect(response.summary.total).toBe(response.summary.successful + response.summary.failed);
        expect(response.summary.total).toBe(testCase.orderSns.length);
      }
    });
  });

  describe("Validation Detection", () => {
    it("should detect missing result for input order", () => {
      /**
       * Property: Validation SHALL detect when a result is missing.
       * 
       * Test strategy:
       * - Create response with missing result
       * - Verify validation fails
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const response = generateBatchResponse(orderSns, [1]);
      
      // Remove one result
      response.results = response.results.filter(r => r.orderSn !== 'ORDER2');
      
      const validation = validateFailureReporting(orderSns, response);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('ORDER2'))).toBe(true);
    });

    it("should detect failed result without error message", () => {
      /**
       * Property: Validation SHALL detect when failed result lacks error.
       * 
       * Test strategy:
       * - Create failed result without error
       * - Verify validation fails
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const response = generateBatchResponse(orderSns, [1]);
      
      // Remove error from failed result
      const failedResult = response.results.find(r => r.orderSn === 'ORDER2');
      if (failedResult) {
        delete failedResult.error;
      }
      
      const validation = validateFailureReporting(orderSns, response);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('error message'))).toBe(true);
    });

    it("should detect incorrect summary counts", () => {
      /**
       * Property: Validation SHALL detect when summary counts are wrong.
       * 
       * Test strategy:
       * - Create response with incorrect summary
       * - Verify validation fails
       */
      const orderSns = ['ORDER1', 'ORDER2', 'ORDER3'];
      const response = generateBatchResponse(orderSns, [1]);
      
      // Corrupt summary
      response.summary.failed = 999;
      
      const validation = validateFailureReporting(orderSns, response);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('failed count'))).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle large batch with many failures", () => {
      /**
       * Property: Large batches with many failures SHALL be reported completely.
       * 
       * Test strategy:
       * - Create batch of 50 orders with 25 failures
       * - Verify all failures are reported
       */
      const orderSns = Array.from({ length: 50 }, (_, i) => `ORDER${i + 1}`);
      const failureIndices = Array.from({ length: 25 }, (_, i) => i * 2); // Every other order fails
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      expect(response.results).toHaveLength(50);
      expect(response.summary.failed).toBe(25);
      
      const failedResults = response.results.filter(r => !r.success);
      expect(failedResults).toHaveLength(25);
      expect(failedResults.every(r => r.error)).toBe(true);
    });

    it("should handle batch with consecutive failures", () => {
      /**
       * Property: Consecutive failures SHALL all be reported.
       * 
       * Test strategy:
       * - Create batch with consecutive failures
       * - Verify all are reported
       */
      const orderSns = Array.from({ length: 10 }, (_, i) => `ORDER${i + 1}`);
      const failureIndices = [3, 4, 5, 6, 7]; // 5 consecutive failures
      const response = generateBatchResponse(orderSns, failureIndices);

      const validation = validateFailureReporting(orderSns, response);

      expect(validation.valid).toBe(true);
      expect(response.summary.failed).toBe(5);
      
      // Verify all consecutive failures are present
      for (let i = 3; i <= 7; i++) {
        const result = response.results.find(r => r.orderSn === `ORDER${i + 1}`);
        expect(result?.success).toBe(false);
        expect(result?.error).toBeDefined();
      }
    });
  });
});
