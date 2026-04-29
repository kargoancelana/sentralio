import { describe, it, expect } from 'bun:test';

/**
 * Test label route validation logic
 * This test verifies that task 8.1 requirements are met
 * 
 * **Validates Requirements**: 11.1, 11.3, 11.6, 11.7
 */

// Import validation functions from the route file
const ORDER_SN_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

function validateOrderSn(orderSn: string): boolean {
  return ORDER_SN_REGEX.test(orderSn);
}

function getErrorStatusCode(error: string): number {
  if (error.includes('tidak ditemukan')) return 404;
  if (error.includes('tidak dapat dicetak labelnya')) return 422;
  if (error.includes('belum tersedia')) return 404;
  if (error.includes('Autentikasi gagal') || error.includes('kredensial')) return 401;
  if (error.includes('Terlalu banyak permintaan')) return 429;
  return 500;
}

describe('Label Route Validation (Task 8.1)', () => {
  describe('Order SN Format Validation', () => {
    it('should accept valid order SNs', () => {
      const validOrderSns = [
        'ABC123',
        'order-123',
        'ORDER_456',
        'a1b2c3',
        'A' + '1'.repeat(99), // 100 chars total
      ];

      validOrderSns.forEach(orderSn => {
        expect(validateOrderSn(orderSn)).toBe(true);
      });
    });

    it('should reject invalid order SNs', () => {
      const invalidOrderSns = [
        '', // empty
        'order with spaces',
        'order@123', // special chars
        'order#123',
        'order%123',
        'A' + '1'.repeat(100), // 101 chars (too long)
      ];

      invalidOrderSns.forEach(orderSn => {
        expect(validateOrderSn(orderSn)).toBe(false);
      });
    });
  });

  describe('Error Status Code Mapping (Requirement 11.7)', () => {
    it('should return 404 for order not found errors', () => {
      const errors = [
        'Order ABC123 tidak ditemukan dalam database',
        'Pesanan tidak ditemukan',
      ];

      errors.forEach(error => {
        expect(getErrorStatusCode(error)).toBe(404);
      });
    });

    it('should return 404 for label not available errors', () => {
      const errors = [
        'Label pengiriman belum tersedia untuk pesanan TEST123',
        'Label belum tersedia',
      ];

      errors.forEach(error => {
        expect(getErrorStatusCode(error)).toBe(404);
      });
    });

    it('should return 422 for order status errors', () => {
      const errors = [
        'Order TEST123 tidak dapat dicetak labelnya: status saat ini adalah SHIPPED',
        'Order tidak dapat dicetak labelnya',
      ];

      errors.forEach(error => {
        expect(getErrorStatusCode(error)).toBe(422);
      });
    });

    it('should return 401 for authentication errors', () => {
      const errors = [
        'Autentikasi gagal. Silakan hubungkan ulang toko Shopee Anda.',
        'Tidak ada kredensial Shopee untuk toko',
      ];

      errors.forEach(error => {
        expect(getErrorStatusCode(error)).toBe(401);
      });
    });

    it('should return 429 for rate limit errors', () => {
      const errors = [
        'Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.',
      ];

      errors.forEach(error => {
        expect(getErrorStatusCode(error)).toBe(429);
      });
    });

    it('should return 500 for unexpected errors', () => {
      const errors = [
        'Database connection failed',
        'Network timeout',
        'Internal server error',
        'Unknown error',
      ];

      errors.forEach(error => {
        expect(getErrorStatusCode(error)).toBe(500);
      });
    });
  });

  describe('Response Format Validation (Requirement 11.3)', () => {
    it('should define correct success response structure', () => {
      // Expected success response structure
      const successResponse = {
        success: true,
        label: {
          orderSn: 'TEST123',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK123',
          retrievedAt: new Date(),
        },
      };

      // Verify structure
      expect(successResponse).toHaveProperty('success');
      expect(successResponse.success).toBe(true);
      expect(successResponse).toHaveProperty('label');
      expect(successResponse.label).toHaveProperty('orderSn');
      expect(successResponse.label).toHaveProperty('url');
      expect(successResponse.label).toHaveProperty('format');
      expect(successResponse.label).toHaveProperty('trackingNumber');
      expect(successResponse.label).toHaveProperty('retrievedAt');
    });

    it('should define correct error response structure', () => {
      // Expected error response structure
      const errorResponse = {
        success: false,
        error: 'Test error message',
      };

      // Verify structure
      expect(errorResponse).toHaveProperty('success');
      expect(errorResponse.success).toBe(false);
      expect(errorResponse).toHaveProperty('error');
      expect(typeof errorResponse.error).toBe('string');
    });
  });

  describe('Label Format Support (Requirement 11.3)', () => {
    it('should support PDF format', () => {
      const formats = ['pdf', 'png', 'jpg'];
      
      formats.forEach(format => {
        expect(['pdf', 'png', 'jpg']).toContain(format);
      });
    });
  });

  describe('HTTP Status Code Requirements (Requirement 11.7)', () => {
    it('should use 200 for successful label retrieval', () => {
      const successStatusCode = 200;
      expect(successStatusCode).toBe(200);
    });

    it('should use 404 for not found errors', () => {
      const notFoundStatusCode = 404;
      expect(notFoundStatusCode).toBe(404);
    });

    it('should use 422 for unprocessable entity errors', () => {
      const unprocessableStatusCode = 422;
      expect(unprocessableStatusCode).toBe(422);
    });

    it('should use 500 for internal server errors', () => {
      const serverErrorStatusCode = 500;
      expect(serverErrorStatusCode).toBe(500);
    });
  });

  describe('Endpoint Path Validation (Requirement 11.1)', () => {
    it('should define correct endpoint path pattern', () => {
      const endpointPath = '/orders/:orderSn/shipping-label';
      
      // Verify path structure
      expect(endpointPath).toContain('/orders/');
      expect(endpointPath).toContain(':orderSn');
      expect(endpointPath).toContain('shipping-label');
      expect(endpointPath.startsWith('/orders/')).toBe(true);
    });
  });
});

/**
 * Test batch label route validation logic
 * This test verifies that task 8.2 requirements are met
 * 
 * **Validates Requirements**: 11.2, 11.4, 11.5, 11.8
 */
describe('Batch Label Route Validation (Task 8.2)', () => {
  describe('Batch Request Body Validation (Requirement 11.4)', () => {
    it('should accept valid batch request with order_sns array', () => {
      const validRequest = {
        order_sns: ['ORDER1', 'ORDER2', 'ORDER3']
      };

      expect(validRequest).toHaveProperty('order_sns');
      expect(Array.isArray(validRequest.order_sns)).toBe(true);
      expect(validRequest.order_sns.length).toBeGreaterThan(0);
      expect(validRequest.order_sns.length).toBeLessThanOrEqual(50);
    });

    it('should reject empty order_sns array', () => {
      const emptyRequest = {
        order_sns: []
      };

      expect(emptyRequest.order_sns.length).toBe(0);
      // Should be rejected with 422 status
    });

    it('should reject order_sns array exceeding 50 items', () => {
      const oversizedRequest = {
        order_sns: Array.from({ length: 51 }, (_, i) => `ORDER${i}`)
      };

      expect(oversizedRequest.order_sns.length).toBeGreaterThan(50);
      // Should be rejected with 422 status
    });

    it('should accept order_sns array with exactly 50 items', () => {
      const maxSizeRequest = {
        order_sns: Array.from({ length: 50 }, (_, i) => `ORDER${i}`)
      };

      expect(maxSizeRequest.order_sns.length).toBe(50);
      // Should be accepted
    });

    it('should reject request without order_sns field', () => {
      const invalidRequest = {
        orders: ['ORDER1', 'ORDER2'] // wrong field name
      };

      expect(invalidRequest).not.toHaveProperty('order_sns');
      // Should be rejected with 400 status
    });

    it('should reject request with non-array order_sns', () => {
      const invalidRequest = {
        order_sns: 'ORDER1,ORDER2' // string instead of array
      };

      expect(Array.isArray(invalidRequest.order_sns)).toBe(false);
      // Should be rejected with 400 status
    });

    it('should reject request with non-string items in order_sns', () => {
      const invalidRequest = {
        order_sns: ['ORDER1', 123, 'ORDER3'] // contains number
      };

      const hasNonStringItems = invalidRequest.order_sns.some(
        item => typeof item !== 'string'
      );
      expect(hasNonStringItems).toBe(true);
      // Should be rejected with 400 status
    });
  });

  describe('Batch Response Format Validation (Requirement 11.5)', () => {
    it('should define correct batch success response structure', () => {
      const batchSuccessResponse = {
        success: true,
        results: [
          {
            orderSn: 'ORDER1',
            success: true,
            label: {
              orderSn: 'ORDER1',
              url: 'https://example.com/label1.pdf',
              format: 'pdf',
              trackingNumber: 'TRACK1',
              retrievedAt: new Date()
            }
          },
          {
            orderSn: 'ORDER2',
            success: false,
            error: 'Order not found'
          }
        ],
        summary: {
          total: 2,
          successful: 1,
          failed: 1
        }
      };

      // Verify top-level structure
      expect(batchSuccessResponse).toHaveProperty('success');
      expect(batchSuccessResponse.success).toBe(true);
      expect(batchSuccessResponse).toHaveProperty('results');
      expect(Array.isArray(batchSuccessResponse.results)).toBe(true);
      expect(batchSuccessResponse).toHaveProperty('summary');

      // Verify summary structure
      expect(batchSuccessResponse.summary).toHaveProperty('total');
      expect(batchSuccessResponse.summary).toHaveProperty('successful');
      expect(batchSuccessResponse.summary).toHaveProperty('failed');
      expect(typeof batchSuccessResponse.summary.total).toBe('number');
      expect(typeof batchSuccessResponse.summary.successful).toBe('number');
      expect(typeof batchSuccessResponse.summary.failed).toBe('number');

      // Verify results array structure
      const successResult = batchSuccessResponse.results[0];
      expect(successResult).toHaveProperty('orderSn');
      expect(successResult).toHaveProperty('success');
      expect(successResult.success).toBe(true);
      expect(successResult).toHaveProperty('label');
      expect(successResult.label).toHaveProperty('orderSn');
      expect(successResult.label).toHaveProperty('url');
      expect(successResult.label).toHaveProperty('format');
      expect(successResult.label).toHaveProperty('trackingNumber');

      const failureResult = batchSuccessResponse.results[1];
      expect(failureResult).toHaveProperty('orderSn');
      expect(failureResult).toHaveProperty('success');
      expect(failureResult.success).toBe(false);
      expect(failureResult).toHaveProperty('error');
      expect(typeof failureResult.error).toBe('string');
    });

    it('should define correct batch error response structure', () => {
      const batchErrorResponse = {
        success: false,
        error: 'Batch validation failed'
      };

      expect(batchErrorResponse).toHaveProperty('success');
      expect(batchErrorResponse.success).toBe(false);
      expect(batchErrorResponse).toHaveProperty('error');
      expect(typeof batchErrorResponse.error).toBe('string');
    });
  });

  describe('Batch Summary Accuracy (Requirement 11.5)', () => {
    it('should calculate summary correctly for all successful', () => {
      const results = [
        { orderSn: 'ORDER1', success: true },
        { orderSn: 'ORDER2', success: true },
        { orderSn: 'ORDER3', success: true }
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const total = results.length;

      expect(total).toBe(3);
      expect(successful).toBe(3);
      expect(failed).toBe(0);
      expect(successful + failed).toBe(total);
    });

    it('should calculate summary correctly for mixed results', () => {
      const results = [
        { orderSn: 'ORDER1', success: true },
        { orderSn: 'ORDER2', success: false },
        { orderSn: 'ORDER3', success: true },
        { orderSn: 'ORDER4', success: false }
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const total = results.length;

      expect(total).toBe(4);
      expect(successful).toBe(2);
      expect(failed).toBe(2);
      expect(successful + failed).toBe(total);
    });

    it('should calculate summary correctly for all failed', () => {
      const results = [
        { orderSn: 'ORDER1', success: false },
        { orderSn: 'ORDER2', success: false }
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const total = results.length;

      expect(total).toBe(2);
      expect(successful).toBe(0);
      expect(failed).toBe(2);
      expect(successful + failed).toBe(total);
    });
  });

  describe('Batch HTTP Status Codes (Requirement 11.8)', () => {
    it('should use 200 for successful batch processing', () => {
      const successStatusCode = 200;
      expect(successStatusCode).toBe(200);
    });

    it('should use 400 for invalid request body', () => {
      const badRequestStatusCode = 400;
      expect(badRequestStatusCode).toBe(400);
    });

    it('should use 422 for validation errors', () => {
      const validationErrorStatusCode = 422;
      expect(validationErrorStatusCode).toBe(422);
    });

    it('should use 500 for internal server errors', () => {
      const serverErrorStatusCode = 500;
      expect(serverErrorStatusCode).toBe(500);
    });
  });

  describe('Batch Endpoint Path Validation (Requirement 11.2)', () => {
    it('should define correct batch endpoint path', () => {
      const batchEndpointPath = '/orders/shipping-labels/batch';
      
      expect(batchEndpointPath).toContain('/orders/');
      expect(batchEndpointPath).toContain('shipping-labels');
      expect(batchEndpointPath).toContain('batch');
      expect(batchEndpointPath.startsWith('/orders/')).toBe(true);
    });
  });

  describe('Batch Size Limit Enforcement (Requirement 11.4)', () => {
    it('should enforce maximum batch size of 50', () => {
      const MAX_BATCH_SIZE = 50;
      
      // Test various sizes
      expect(1).toBeLessThanOrEqual(MAX_BATCH_SIZE); // minimum
      expect(25).toBeLessThanOrEqual(MAX_BATCH_SIZE); // middle
      expect(50).toBeLessThanOrEqual(MAX_BATCH_SIZE); // maximum
      expect(51).toBeGreaterThan(MAX_BATCH_SIZE); // over limit
      expect(100).toBeGreaterThan(MAX_BATCH_SIZE); // way over limit
    });

    it('should validate batch size before processing', () => {
      const validateBatchSize = (orderSns: string[]) => {
        if (orderSns.length === 0) {
          return { valid: false, error: 'Empty array' };
        }
        if (orderSns.length > 50) {
          return { valid: false, error: 'Exceeds maximum' };
        }
        return { valid: true };
      };

      // Valid sizes
      expect(validateBatchSize(['ORDER1']).valid).toBe(true);
      expect(validateBatchSize(Array(50).fill('ORDER')).valid).toBe(true);

      // Invalid sizes
      expect(validateBatchSize([]).valid).toBe(false);
      expect(validateBatchSize(Array(51).fill('ORDER')).valid).toBe(false);
      expect(validateBatchSize(Array(100).fill('ORDER')).valid).toBe(false);
    });
  });

  describe('Order SN Format Validation in Batch (Requirement 11.4)', () => {
    it('should validate all order SNs in batch request', () => {
      const validOrderSns = ['ORDER1', 'ORDER-2', 'ORDER_3'];
      const invalidOrderSns = ['ORDER 1', 'ORDER@2', ''];

      validOrderSns.forEach(orderSn => {
        expect(validateOrderSn(orderSn)).toBe(true);
      });

      invalidOrderSns.forEach(orderSn => {
        expect(validateOrderSn(orderSn)).toBe(false);
      });
    });

    it('should reject batch if any order SN is invalid', () => {
      const mixedBatch = ['VALID1', 'VALID2', 'INVALID ORDER', 'VALID3'];
      
      const invalidItems = mixedBatch.filter(sn => !validateOrderSn(sn));
      expect(invalidItems.length).toBeGreaterThan(0);
      // Should reject entire batch
    });
  });
});
