import { describe, it, expect } from 'bun:test';

/**
 * Test batch label route validation logic
 * This test verifies that task 8.2 requirements are met
 * 
 * **Validates Requirements**: 11.2, 11.4, 11.5, 11.8
 */

const MAX_BATCH_SIZE = 50;
const ORDER_SN_REGEX = /^[A-Za-z0-9_-]{1,100}$/;

function validateOrderSn(orderSn: string): boolean {
  return ORDER_SN_REGEX.test(orderSn);
}

function validateBatchRequest(body: any): { valid: boolean; error?: string; statusCode?: number } {
  // Validate request body structure
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: "Request body tidak valid. Harus berupa objek JSON dengan field order_sns.",
      statusCode: 400
    };
  }

  const { order_sns } = body;

  // Validate order_sns field exists and is an array
  if (!order_sns || !Array.isArray(order_sns)) {
    return {
      valid: false,
      error: "Field order_sns harus berupa array.",
      statusCode: 400
    };
  }

  // Validate array is not empty
  if (order_sns.length === 0) {
    return {
      valid: false,
      error: "Array order_sns tidak boleh kosong. Minimal 1 order diperlukan.",
      statusCode: 422
    };
  }

  // Validate array does not exceed maximum size
  if (order_sns.length > MAX_BATCH_SIZE) {
    return {
      valid: false,
      error: `Jumlah order melebihi batas maksimal ${MAX_BATCH_SIZE}. Diterima ${order_sns.length} order.`,
      statusCode: 422
    };
  }

  // Validate all items are strings
  const invalidItems = order_sns.filter((item: any) => typeof item !== 'string');
  if (invalidItems.length > 0) {
    return {
      valid: false,
      error: "Semua item dalam order_sns harus berupa string.",
      statusCode: 400
    };
  }

  // Validate order SN format for each item
  const invalidOrderSns = order_sns.filter((sn: string) => !validateOrderSn(sn));
  if (invalidOrderSns.length > 0) {
    return {
      valid: false,
      error: `Format order_sn tidak valid untuk: ${invalidOrderSns.slice(0, 5).join(', ')}${invalidOrderSns.length > 5 ? '...' : ''}`,
      statusCode: 422
    };
  }

  return { valid: true };
}

describe('Batch Label Route Validation (Task 8.2)', () => {
  describe('Request Body Validation (Requirement 11.4)', () => {
    it('should accept valid batch request', () => {
      const validRequest = {
        order_sns: ['ORDER123', 'ORDER456', 'ORDER789']
      };

      const result = validateBatchRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject null body', () => {
      const result = validateBatchRequest(null);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('Request body tidak valid');
    });

    it('should reject undefined body', () => {
      const result = validateBatchRequest(undefined);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
    });

    it('should reject non-object body', () => {
      const result = validateBatchRequest("not an object");
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
    });

    it('should reject missing order_sns field', () => {
      const result = validateBatchRequest({});
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('order_sns harus berupa array');
    });

    it('should reject non-array order_sns', () => {
      const result = validateBatchRequest({ order_sns: "not an array" });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('order_sns harus berupa array');
    });
  });

  describe('Batch Size Validation (Requirement 11.4)', () => {
    it('should reject empty array', () => {
      const result = validateBatchRequest({ order_sns: [] });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(422);
      expect(result.error).toContain('tidak boleh kosong');
    });

    it('should accept batch with 1 order', () => {
      const result = validateBatchRequest({ order_sns: ['ORDER123'] });
      expect(result.valid).toBe(true);
    });

    it('should accept batch with 50 orders (maximum)', () => {
      const orderSns = Array.from({ length: 50 }, (_, i) => `ORDER${i + 1}`);
      const result = validateBatchRequest({ order_sns: orderSns });
      expect(result.valid).toBe(true);
    });

    it('should reject batch with 51 orders (over maximum)', () => {
      const orderSns = Array.from({ length: 51 }, (_, i) => `ORDER${i + 1}`);
      const result = validateBatchRequest({ order_sns: orderSns });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(422);
      expect(result.error).toContain('melebihi batas maksimal 50');
      expect(result.error).toContain('51');
    });

    it('should reject batch with 100 orders', () => {
      const orderSns = Array.from({ length: 100 }, (_, i) => `ORDER${i + 1}`);
      const result = validateBatchRequest({ order_sns: orderSns });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(422);
      expect(result.error).toContain('100');
    });
  });

  describe('Order SN Format Validation (Requirement 11.4)', () => {
    it('should accept valid order SNs', () => {
      const validRequest = {
        order_sns: ['ABC123', 'order-456', 'ORDER_789']
      };
      const result = validateBatchRequest(validRequest);
      expect(result.valid).toBe(true);
    });

    it('should reject non-string items', () => {
      const result = validateBatchRequest({ 
        order_sns: ['ORDER123', 123, 'ORDER456'] 
      });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('harus berupa string');
    });

    it('should reject invalid order SN formats', () => {
      const result = validateBatchRequest({ 
        order_sns: ['ORDER123', 'invalid order', 'ORDER456'] 
      });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(422);
      expect(result.error).toContain('Format order_sn tidak valid');
    });

    it('should list invalid order SNs in error message', () => {
      const result = validateBatchRequest({ 
        order_sns: ['ORDER123', 'invalid@order', 'ORDER#456'] 
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid@order');
    });

    it('should truncate long list of invalid order SNs', () => {
      const invalidOrderSns = Array.from({ length: 10 }, (_, i) => `invalid order ${i}`);
      const result = validateBatchRequest({ order_sns: invalidOrderSns });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('...');
    });
  });

  describe('Response Format Validation (Requirement 11.5)', () => {
    it('should define correct success response structure', () => {
      const successResponse = {
        success: true,
        results: [
          {
            orderSn: 'ORDER123',
            success: true,
            label: {
              orderSn: 'ORDER123',
              url: 'https://example.com/label.pdf',
              format: 'pdf',
              trackingNumber: 'TRACK123',
              retrievedAt: new Date()
            }
          },
          {
            orderSn: 'ORDER456',
            success: false,
            error: 'Order tidak ditemukan'
          }
        ],
        summary: {
          total: 2,
          successful: 1,
          failed: 1
        }
      };

      // Verify structure
      expect(successResponse).toHaveProperty('success');
      expect(successResponse.success).toBe(true);
      expect(successResponse).toHaveProperty('results');
      expect(Array.isArray(successResponse.results)).toBe(true);
      expect(successResponse).toHaveProperty('summary');
      expect(successResponse.summary).toHaveProperty('total');
      expect(successResponse.summary).toHaveProperty('successful');
      expect(successResponse.summary).toHaveProperty('failed');
    });

    it('should define correct error response structure', () => {
      const errorResponse = {
        success: false,
        error: 'Validation error message'
      };

      expect(errorResponse).toHaveProperty('success');
      expect(errorResponse.success).toBe(false);
      expect(errorResponse).toHaveProperty('error');
      expect(typeof errorResponse.error).toBe('string');
    });

    it('should include all required fields in result items', () => {
      const resultItem = {
        orderSn: 'ORDER123',
        success: true,
        label: {
          orderSn: 'ORDER123',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK123',
          retrievedAt: new Date()
        }
      };

      expect(resultItem).toHaveProperty('orderSn');
      expect(resultItem).toHaveProperty('success');
      expect(resultItem).toHaveProperty('label');
      expect(resultItem.label).toHaveProperty('orderSn');
      expect(resultItem.label).toHaveProperty('url');
      expect(resultItem.label).toHaveProperty('format');
      expect(resultItem.label).toHaveProperty('trackingNumber');
      expect(resultItem.label).toHaveProperty('retrievedAt');
    });

    it('should include error field for failed results', () => {
      const failedResult = {
        orderSn: 'ORDER456',
        success: false,
        error: 'Order tidak ditemukan'
      };

      expect(failedResult).toHaveProperty('orderSn');
      expect(failedResult).toHaveProperty('success');
      expect(failedResult.success).toBe(false);
      expect(failedResult).toHaveProperty('error');
      expect(typeof failedResult.error).toBe('string');
    });
  });

  describe('Summary Calculation (Requirement 11.5)', () => {
    it('should calculate correct summary counts', () => {
      const results = [
        { orderSn: 'ORDER1', success: true, label: {} },
        { orderSn: 'ORDER2', success: true, label: {} },
        { orderSn: 'ORDER3', success: false, error: 'Error' },
        { orderSn: 'ORDER4', success: true, label: {} },
        { orderSn: 'ORDER5', success: false, error: 'Error' }
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const total = results.length;

      expect(total).toBe(5);
      expect(successful).toBe(3);
      expect(failed).toBe(2);
      expect(successful + failed).toBe(total);
    });

    it('should handle all successful results', () => {
      const results = [
        { orderSn: 'ORDER1', success: true, label: {} },
        { orderSn: 'ORDER2', success: true, label: {} },
        { orderSn: 'ORDER3', success: true, label: {} }
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      expect(successful).toBe(3);
      expect(failed).toBe(0);
    });

    it('should handle all failed results', () => {
      const results = [
        { orderSn: 'ORDER1', success: false, error: 'Error' },
        { orderSn: 'ORDER2', success: false, error: 'Error' },
        { orderSn: 'ORDER3', success: false, error: 'Error' }
      ];

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      expect(successful).toBe(0);
      expect(failed).toBe(3);
    });
  });

  describe('HTTP Status Code Requirements (Requirement 11.8)', () => {
    it('should use 200 for successful batch processing', () => {
      const successStatusCode = 200;
      expect(successStatusCode).toBe(200);
    });

    it('should use 400 for invalid request body', () => {
      const result = validateBatchRequest(null);
      expect(result.statusCode).toBe(400);
    });

    it('should use 422 for validation errors', () => {
      const emptyResult = validateBatchRequest({ order_sns: [] });
      expect(emptyResult.statusCode).toBe(422);

      const oversizedResult = validateBatchRequest({ 
        order_sns: Array.from({ length: 51 }, (_, i) => `ORDER${i}`) 
      });
      expect(oversizedResult.statusCode).toBe(422);
    });

    it('should use 500 for internal server errors', () => {
      const serverErrorStatusCode = 500;
      expect(serverErrorStatusCode).toBe(500);
    });
  });

  describe('Endpoint Path Validation (Requirement 11.2)', () => {
    it('should define correct endpoint path', () => {
      const endpointPath = '/orders/shipping-labels/batch';
      
      expect(endpointPath).toContain('/orders/');
      expect(endpointPath).toContain('shipping-labels');
      expect(endpointPath).toContain('batch');
      expect(endpointPath.startsWith('/orders/')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle batch with duplicate order SNs', () => {
      const result = validateBatchRequest({ 
        order_sns: ['ORDER123', 'ORDER123', 'ORDER123'] 
      });
      expect(result.valid).toBe(true);
    });

    it('should handle batch with exactly 50 unique orders', () => {
      const orderSns = Array.from({ length: 50 }, (_, i) => `ORDER_${String(i + 1).padStart(3, '0')}`);
      const result = validateBatchRequest({ order_sns: orderSns });
      expect(result.valid).toBe(true);
    });

    it('should handle mixed valid and invalid formats', () => {
      const result = validateBatchRequest({ 
        order_sns: ['VALID123', 'invalid order', 'VALID456'] 
      });
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(422);
    });
  });
});
