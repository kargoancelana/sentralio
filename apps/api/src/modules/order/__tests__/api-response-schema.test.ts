import { describe, it, expect } from "bun:test";

/**
 * Property-Based Test: API Response Schema Compliance
 * 
 * **Validates: Requirements 11.3, 11.5**
 * 
 * Property 5: API Response Schema Compliance
 * 
 * For any successful single label API response, the response SHALL contain a success field (boolean),
 * a label object with orderSn, url (string), format (string), and trackingNumber (string) fields.
 * 
 * For any successful batch API response, the response SHALL contain success field and results array
 * with total, successful, failed (all numbers) and results array.
 */

interface SingleLabelResponse {
  success: boolean;
  label?: {
    orderSn: string;
    url?: string;
    base64Data?: string;
    format: string;
    trackingNumber: string;
    retrievedAt: Date;
  };
  error?: string;
}

interface BatchLabelResponse {
  success: boolean;
  results?: Array<{
    orderSn: string;
    success: boolean;
    label?: any;
    error?: string;
  }>;
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
  error?: string;
}

function validateSingleLabelSchema(response: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof response.success !== 'boolean') {
    errors.push('Missing or invalid "success" field');
  }

  if (response.success === true) {
    if (!response.label) {
      errors.push('Missing "label" object for successful response');
    } else {
      if (typeof response.label.orderSn !== 'string') errors.push('Missing "label.orderSn"');
      if (!response.label.url && !response.label.base64Data) errors.push('Missing "url" or "base64Data"');
      if (typeof response.label.format !== 'string') errors.push('Missing "label.format"');
      if (typeof response.label.trackingNumber !== 'string') errors.push('Missing "label.trackingNumber"');
    }
  }

  if (response.success === false && typeof response.error !== 'string') {
    errors.push('Missing "error" field for failed response');
  }

  return { valid: errors.length === 0, errors };
}

function validateBatchLabelSchema(response: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof response.success !== 'boolean') {
    errors.push('Missing "success" field');
  }

  if (response.success === true) {
    if (!Array.isArray(response.results)) {
      errors.push('Missing "results" array');
    } else {
      response.results.forEach((result: any, i: number) => {
        if (typeof result.orderSn !== 'string') errors.push(`results[${i}]: Missing "orderSn"`);
        if (typeof result.success !== 'boolean') errors.push(`results[${i}]: Missing "success"`);
        if (result.success && !result.label) errors.push(`results[${i}]: Missing "label"`);
        if (!result.success && typeof result.error !== 'string') errors.push(`results[${i}]: Missing "error"`);
      });
    }

    if (!response.summary) {
      errors.push('Missing "summary" object');
    } else {
      if (typeof response.summary.total !== 'number') errors.push('Missing "summary.total"');
      if (typeof response.summary.successful !== 'number') errors.push('Missing "summary.successful"');
      if (typeof response.summary.failed !== 'number') errors.push('Missing "summary.failed"');
    }
  }

  return { valid: errors.length === 0, errors };
}

describe("Property 5: API Response Schema Compliance", () => {
  describe("Single Label Response Schema", () => {
    it("should validate successful response", () => {
      const response = {
        success: true,
        label: {
          orderSn: 'ORDER123',
          url: 'https://example.com/label.pdf',
          format: 'pdf',
          trackingNumber: 'TRACK123',
          retrievedAt: new Date()
        }
      };

      const validation = validateSingleLabelSchema(response);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should validate failed response", () => {
      const response = {
        success: false,
        error: 'Order tidak ditemukan'
      };

      const validation = validateSingleLabelSchema(response);
      expect(validation.valid).toBe(true);
    });

    it("should detect missing success field", () => {
      const response: any = { label: {} };
      const validation = validateSingleLabelSchema(response);
      expect(validation.valid).toBe(false);
    });

    it("should detect missing label for successful response", () => {
      const response = { success: true };
      const validation = validateSingleLabelSchema(response);
      expect(validation.valid).toBe(false);
    });

    it("should detect missing required label fields", () => {
      const response = {
        success: true,
        label: { orderSn: 'ORDER123' }
      };
      const validation = validateSingleLabelSchema(response);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Batch Label Response Schema", () => {
    it("should validate successful batch response", () => {
      const response = {
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
            error: 'Order tidak ditemukan'
          }
        ],
        summary: {
          total: 2,
          successful: 1,
          failed: 1
        }
      };

      const validation = validateBatchLabelSchema(response);
      expect(validation.valid).toBe(true);
    });

    it("should detect missing results array", () => {
      const response = {
        success: true,
        summary: { total: 0, successful: 0, failed: 0 }
      };
      const validation = validateBatchLabelSchema(response);
      expect(validation.valid).toBe(false);
    });

    it("should detect missing summary", () => {
      const response = {
        success: true,
        results: []
      };
      const validation = validateBatchLabelSchema(response);
      expect(validation.valid).toBe(false);
    });

    it("should detect invalid result items", () => {
      const response = {
        success: true,
        results: [{ orderSn: 'ORDER1' }],
        summary: { total: 1, successful: 0, failed: 1 }
      };
      const validation = validateBatchLabelSchema(response);
      expect(validation.valid).toBe(false);
    });
  });
});
