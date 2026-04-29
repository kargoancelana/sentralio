import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from '../api';

/**
 * Unit Tests for Label API Client Methods
 * 
 * Tests the orderLabel and orderLabelsBatch methods in the API client.
 * 
 * **Validates: Requirements 11.1, 11.2**
 */

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Label API Client Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('orderLabel - Single Label Retrieval', () => {
    describe('Successful API Calls', () => {
      it('should make GET request to correct endpoint', async () => {
        /**
         * Test: Verify correct endpoint is called
         * Requirement: 11.1
         */
        const orderSn = 'ORDER_123456';
        const mockResponse = {
          success: true,
          data: {
            orderSn: 'ORDER_123456',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK123'
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        await api.orderLabel(orderSn);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/orders/${orderSn}/shipping-label`,
          expect.objectContaining({
            headers: { 'Content-Type': 'application/json' }
          })
        );
      });

      it('should return typed response with label data', async () => {
        /**
         * Test: Verify response type matches interface
         * Requirement: 11.3
         */
        const orderSn = 'ORDER_123456';
        const mockResponse = {
          success: true,
          data: {
            orderSn: 'ORDER_123456',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK123'
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabel(orderSn);

        expect(result).toEqual(mockResponse);
        expect(result.success).toBe(true);
        expect(result.data.orderSn).toBe(orderSn);
        expect(result.data.url).toBe('https://example.com/label.pdf');
        expect(result.data.format).toBe('pdf');
        expect(result.data.trackingNumber).toBe('TRACK123');
      });

      it('should handle PDF format labels', async () => {
        /**
         * Test: Verify PDF format is handled correctly
         */
        const mockResponse = {
          success: true,
          data: {
            orderSn: 'ORDER_001',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK001'
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabel('ORDER_001');

        expect(result.data.format).toBe('pdf');
        expect(result.data.url).toContain('.pdf');
      });

      it('should handle PNG format labels', async () => {
        /**
         * Test: Verify PNG format is handled correctly
         */
        const mockResponse = {
          success: true,
          data: {
            orderSn: 'ORDER_002',
            url: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
            format: 'png' as const,
            trackingNumber: 'TRACK002'
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabel('ORDER_002');

        expect(result.data.format).toBe('png');
        expect(result.data.url).toContain('data:image/png');
      });

      it('should handle JPG format labels', async () => {
        /**
         * Test: Verify JPG format is handled correctly
         */
        const mockResponse = {
          success: true,
          data: {
            orderSn: 'ORDER_003',
            url: 'data:image/jpg;base64,/9j/4AAQSkZJRg...',
            format: 'jpg' as const,
            trackingNumber: 'TRACK003'
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabel('ORDER_003');

        expect(result.data.format).toBe('jpg');
        expect(result.data.url).toContain('data:image/jpg');
      });

      it('should handle various order SN formats', async () => {
        /**
         * Test: Verify different order SN formats work
         */
        const orderSns = [
          'ORDER_123456',
          'TEST_000001',
          '240101ABCDEF',
          'SHP-2024-001'
        ];

        for (const orderSn of orderSns) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                orderSn,
                url: 'https://example.com/label.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK'
              }
            })
          });

          const result = await api.orderLabel(orderSn);
          expect(result.data.orderSn).toBe(orderSn);
        }
      });
    });

    describe('Error Handling', () => {
      it('should throw ApiError on 404 (order not found)', async () => {
        /**
         * Test: Verify 404 error handling
         * Requirement: 11.7
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({
            success: false,
            message: 'Order ORDER_999 tidak ditemukan dalam database'
          })
        });

        await expect(api.orderLabel('ORDER_999')).rejects.toThrow(ApiError);
        await expect(api.orderLabel('ORDER_999')).rejects.toThrow('Order ORDER_999 tidak ditemukan dalam database');
      });

      it('should throw ApiError on 422 (order not PROCESSED)', async () => {
        /**
         * Test: Verify 422 error handling
         * Requirement: 11.8
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({
            success: false,
            message: 'Order ORDER_001 tidak dapat dicetak labelnya: status saat ini adalah READY_TO_SHIP'
          })
        });

        await expect(api.orderLabel('ORDER_001')).rejects.toThrow(ApiError);
      });

      it('should throw ApiError on 500 (server error)', async () => {
        /**
         * Test: Verify 500 error handling
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            message: 'Internal server error'
          })
        });

        await expect(api.orderLabel('ORDER_001')).rejects.toThrow(ApiError);
      });

      it('should throw ApiError on network failure', async () => {
        /**
         * Test: Verify network error handling
         */
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(api.orderLabel('ORDER_001')).rejects.toThrow('Network error');
      });

      it('should include status code in ApiError', async () => {
        /**
         * Test: Verify ApiError contains status code
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({
            success: false,
            message: 'Not found'
          })
        });

        try {
          await api.orderLabel('ORDER_001');
          expect.fail('Should have thrown ApiError');
        } catch (error: any) {
          expect(error).toBeInstanceOf(ApiError);
          expect(error.status).toBe(404);
        }
      });

      it('should handle missing error message gracefully', async () => {
        /**
         * Test: Verify fallback error message
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            success: false
          })
        });

        await expect(api.orderLabel('ORDER_001')).rejects.toThrow('API error 500');
      });
    });

    describe('Request/Response Type Safety', () => {
      it('should enforce orderSn parameter type', async () => {
        /**
         * Test: Verify TypeScript type safety for orderSn
         */
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              orderSn: 'ORDER_001',
              url: 'https://example.com/label.pdf',
              format: 'pdf',
              trackingNumber: 'TRACK001'
            }
          })
        });

        // TypeScript should enforce string type
        const orderSn: string = 'ORDER_001';
        const result = await api.orderLabel(orderSn);

        expect(result.data.orderSn).toBe(orderSn);
      });

      it('should enforce response type structure', async () => {
        /**
         * Test: Verify response matches expected type
         */
        const mockResponse = {
          success: true,
          data: {
            orderSn: 'ORDER_001',
            url: 'https://example.com/label.pdf',
            format: 'pdf' as const,
            trackingNumber: 'TRACK001'
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabel('ORDER_001');

        // Verify all required fields exist
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('orderSn');
        expect(result.data).toHaveProperty('url');
        expect(result.data).toHaveProperty('format');
        expect(result.data).toHaveProperty('trackingNumber');
      });

      it('should enforce format enum type', async () => {
        /**
         * Test: Verify format is one of allowed values
         */
        const formats: Array<'pdf' | 'png' | 'jpg'> = ['pdf', 'png', 'jpg'];

        for (const format of formats) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                orderSn: 'ORDER_001',
                url: 'https://example.com/label',
                format,
                trackingNumber: 'TRACK001'
              }
            })
          });

          const result = await api.orderLabel('ORDER_001');
          expect(['pdf', 'png', 'jpg']).toContain(result.data.format);
        }
      });
    });
  });

  describe('orderLabelsBatch - Batch Label Retrieval', () => {
    describe('Successful API Calls', () => {
      it('should make POST request to correct endpoint', async () => {
        /**
         * Test: Verify correct endpoint is called
         * Requirement: 11.2
         */
        const orderSns = ['ORDER_001', 'ORDER_002', 'ORDER_003'];
        const mockResponse = {
          success: true,
          data: {
            total: 3,
            successful: 3,
            failed: 0,
            results: orderSns.map(sn => ({
              orderSn: sn,
              success: true,
              url: `https://example.com/${sn}.pdf`,
              format: 'pdf' as const,
              trackingNumber: `TRACK_${sn}`
            }))
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        await api.orderLabelsBatch(orderSns);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/orders/shipping-labels/batch',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_sns: orderSns })
          })
        );
      });

      it('should return typed response with batch results', async () => {
        /**
         * Test: Verify response type matches interface
         * Requirement: 11.5
         */
        const orderSns = ['ORDER_001', 'ORDER_002'];
        const mockResponse = {
          success: true,
          data: {
            total: 2,
            successful: 2,
            failed: 0,
            results: [
              {
                orderSn: 'ORDER_001',
                success: true,
                url: 'https://example.com/label1.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK001'
              },
              {
                orderSn: 'ORDER_002',
                success: true,
                url: 'https://example.com/label2.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK002'
              }
            ]
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(orderSns);

        expect(result).toEqual(mockResponse);
        expect(result.success).toBe(true);
        expect(result.data.total).toBe(2);
        expect(result.data.successful).toBe(2);
        expect(result.data.failed).toBe(0);
        expect(result.data.results).toHaveLength(2);
      });

      it('should handle all successful batch', async () => {
        /**
         * Test: Verify all successful scenario
         */
        const orderSns = ['ORDER_001', 'ORDER_002', 'ORDER_003'];
        const mockResponse = {
          success: true,
          data: {
            total: 3,
            successful: 3,
            failed: 0,
            results: orderSns.map(sn => ({
              orderSn: sn,
              success: true,
              url: `https://example.com/${sn}.pdf`,
              format: 'pdf' as const,
              trackingNumber: `TRACK_${sn}`
            }))
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(orderSns);

        expect(result.data.successful).toBe(3);
        expect(result.data.failed).toBe(0);
        expect(result.data.results.every(r => r.success)).toBe(true);
      });

      it('should handle partial failures', async () => {
        /**
         * Test: Verify partial failure scenario
         */
        const orderSns = ['ORDER_001', 'ORDER_002', 'ORDER_003'];
        const mockResponse = {
          success: true,
          data: {
            total: 3,
            successful: 2,
            failed: 1,
            results: [
              {
                orderSn: 'ORDER_001',
                success: true,
                url: 'https://example.com/label1.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK001'
              },
              {
                orderSn: 'ORDER_002',
                success: false,
                error: 'Label tidak tersedia'
              },
              {
                orderSn: 'ORDER_003',
                success: true,
                url: 'https://example.com/label3.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK003'
              }
            ]
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(orderSns);

        expect(result.data.successful).toBe(2);
        expect(result.data.failed).toBe(1);
        expect(result.data.results[1].success).toBe(false);
        expect(result.data.results[1].error).toBe('Label tidak tersedia');
      });

      it('should handle all failed batch', async () => {
        /**
         * Test: Verify all failed scenario
         */
        const orderSns = ['ORDER_001', 'ORDER_002'];
        const mockResponse = {
          success: true,
          data: {
            total: 2,
            successful: 0,
            failed: 2,
            results: [
              {
                orderSn: 'ORDER_001',
                success: false,
                error: 'Order tidak ditemukan'
              },
              {
                orderSn: 'ORDER_002',
                success: false,
                error: 'Status tidak valid'
              }
            ]
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(orderSns);

        expect(result.data.successful).toBe(0);
        expect(result.data.failed).toBe(2);
        expect(result.data.results.every(r => !r.success)).toBe(true);
      });

      it('should handle single order batch', async () => {
        /**
         * Test: Verify single order batch works
         */
        const orderSns = ['ORDER_001'];
        const mockResponse = {
          success: true,
          data: {
            total: 1,
            successful: 1,
            failed: 0,
            results: [
              {
                orderSn: 'ORDER_001',
                success: true,
                url: 'https://example.com/label.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK001'
              }
            ]
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(orderSns);

        expect(result.data.total).toBe(1);
        expect(result.data.results).toHaveLength(1);
      });

      it('should handle maximum batch size (50 orders)', async () => {
        /**
         * Test: Verify maximum batch size
         * Requirement: 11.4
         */
        const orderSns = Array.from({ length: 50 }, (_, i) => `ORDER_${String(i + 1).padStart(3, '0')}`);
        const mockResponse = {
          success: true,
          data: {
            total: 50,
            successful: 50,
            failed: 0,
            results: orderSns.map(sn => ({
              orderSn: sn,
              success: true,
              url: `https://example.com/${sn}.pdf`,
              format: 'pdf' as const,
              trackingNumber: `TRACK_${sn}`
            }))
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(orderSns);

        expect(result.data.total).toBe(50);
        expect(result.data.results).toHaveLength(50);
      });
    });

    describe('Error Handling', () => {
      it('should throw ApiError on 400 (invalid request)', async () => {
        /**
         * Test: Verify 400 error handling
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            message: 'Invalid request body'
          })
        });

        await expect(api.orderLabelsBatch(['ORDER_001'])).rejects.toThrow(ApiError);
      });

      it('should throw ApiError on 422 (batch size exceeded)', async () => {
        /**
         * Test: Verify batch size limit error
         * Requirement: 11.4
         */
        const orderSns = Array.from({ length: 51 }, (_, i) => `ORDER_${i}`);
        
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({
            success: false,
            message: 'Batch size exceeds maximum limit of 50'
          })
        });

        await expect(api.orderLabelsBatch(orderSns)).rejects.toThrow(ApiError);
      });

      it('should throw ApiError on 500 (server error)', async () => {
        /**
         * Test: Verify 500 error handling
         */
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            message: 'Internal server error'
          })
        });

        await expect(api.orderLabelsBatch(['ORDER_001'])).rejects.toThrow(ApiError);
      });

      it('should throw ApiError on network failure', async () => {
        /**
         * Test: Verify network error handling
         */
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(api.orderLabelsBatch(['ORDER_001'])).rejects.toThrow('Network error');
      });
    });

    describe('Request/Response Type Safety', () => {
      it('should enforce orderSns array parameter type', async () => {
        /**
         * Test: Verify TypeScript type safety for orderSns array
         */
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              total: 2,
              successful: 2,
              failed: 0,
              results: []
            }
          })
        });

        // TypeScript should enforce string array type
        const orderSns: string[] = ['ORDER_001', 'ORDER_002'];
        const result = await api.orderLabelsBatch(orderSns);

        expect(result.data.total).toBe(2);
      });

      it('should enforce response type structure', async () => {
        /**
         * Test: Verify response matches expected type
         */
        const mockResponse = {
          success: true,
          data: {
            total: 1,
            successful: 1,
            failed: 0,
            results: [
              {
                orderSn: 'ORDER_001',
                success: true,
                url: 'https://example.com/label.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK001'
              }
            ]
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(['ORDER_001']);

        // Verify all required fields exist
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('total');
        expect(result.data).toHaveProperty('successful');
        expect(result.data).toHaveProperty('failed');
        expect(result.data).toHaveProperty('results');
        expect(Array.isArray(result.data.results)).toBe(true);
      });

      it('should enforce result item type structure', async () => {
        /**
         * Test: Verify result items match expected type
         */
        const mockResponse = {
          success: true,
          data: {
            total: 2,
            successful: 1,
            failed: 1,
            results: [
              {
                orderSn: 'ORDER_001',
                success: true,
                url: 'https://example.com/label.pdf',
                format: 'pdf' as const,
                trackingNumber: 'TRACK001'
              },
              {
                orderSn: 'ORDER_002',
                success: false,
                error: 'Error message'
              }
            ]
          }
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse
        });

        const result = await api.orderLabelsBatch(['ORDER_001', 'ORDER_002']);

        // Verify successful result structure
        const successResult = result.data.results[0];
        expect(successResult).toHaveProperty('orderSn');
        expect(successResult).toHaveProperty('success');
        expect(successResult.success).toBe(true);
        expect(successResult).toHaveProperty('url');
        expect(successResult).toHaveProperty('format');
        expect(successResult).toHaveProperty('trackingNumber');

        // Verify failed result structure
        const failedResult = result.data.results[1];
        expect(failedResult).toHaveProperty('orderSn');
        expect(failedResult).toHaveProperty('success');
        expect(failedResult.success).toBe(false);
        expect(failedResult).toHaveProperty('error');
      });
    });
  });
});
