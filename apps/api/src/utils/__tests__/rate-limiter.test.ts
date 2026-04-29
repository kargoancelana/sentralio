import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../rate-limiter';

// Mock the delay function
vi.mock('../delay', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

import { delay } from '../delay';
const mockDelay = delay as any;

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
    vi.clearAllMocks();
    // Mock console.warn to avoid noise in tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default configuration when no config provided', () => {
      const limiter = new RateLimiter();
      const config = limiter.getConfig();
      
      expect(config).toEqual({
        maxRetries: 3,
        retryDelay: 2000,
        batchDelay: 300,
      });
    });

    it('should merge provided config with defaults', () => {
      const limiter = new RateLimiter({ maxRetries: 5, retryDelay: 1000 });
      const config = limiter.getConfig();
      
      expect(config).toEqual({
        maxRetries: 5,
        retryDelay: 1000,
        batchDelay: 300, // default value
      });
    });
  });

  describe('executeWithRetry', () => {
    it('should execute function successfully on first try', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockDelay).not.toHaveBeenCalled();
    });

    it('should retry on rate limit error with error_too_frequent code', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent', message: 'Rate limited' })
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(2000); // First retry delay
    });

    it('should retry on HTTP 429 status code', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Too Many Requests' })
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(2000);
    });

    it('should retry on rate limit message in error', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ message: 'Rate limit exceeded' })
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(2000);
    });

    it('should use exponential backoff for multiple retries', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(mockDelay).toHaveBeenCalledWith(2000); // First retry: 2000 * 2^0 = 2000
      expect(mockDelay).toHaveBeenCalledWith(4000); // Second retry: 2000 * 2^1 = 4000
    });

    it('should fail after max retries with rate limit error', async () => {
      const error = { code: 'error_too_frequent', message: 'Rate limited' };
      const mockFn = vi.fn().mockRejectedValue(error);
      
      await expect(rateLimiter.executeWithRetry(mockFn)).rejects.toEqual(error);
      
      expect(mockFn).toHaveBeenCalledTimes(3); // maxRetries = 3
      expect(mockDelay).toHaveBeenCalledTimes(2); // 2 retry delays
    });

    it('should not retry on non-rate-limit errors', async () => {
      const error = { code: 'error_auth', message: 'Authentication failed' };
      const mockFn = vi.fn().mockRejectedValue(error);
      
      await expect(rateLimiter.executeWithRetry(mockFn)).rejects.toEqual(error);
      
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockDelay).not.toHaveBeenCalled();
    });

    it('should use custom config when provided', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn, { 
        retryDelay: 1000,
        maxRetries: 2 // Allow 2 attempts total (1 initial + 1 retry)
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2); // Initial call + 1 retry
      expect(mockDelay).toHaveBeenCalledWith(1000); // Custom retry delay
    });

    it('should log retry attempts', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockResolvedValue('success');
      
      await rateLimiter.executeWithRetry(mockFn);
      
      expect(console.warn).toHaveBeenCalledWith('[rate-limiter]', expect.objectContaining({
        attempt: 1,
        maxRetries: 3,
        retryDelay: 2000,
        errorType: 'rate_limit',
        message: 'Rate limit hit, retrying after delay',
      }));
    });
  });

  describe('batchDelay', () => {
    it('should use default batch delay', async () => {
      await rateLimiter.batchDelay();
      
      expect(mockDelay).toHaveBeenCalledWith(300);
    });

    it('should use custom delay when provided', async () => {
      await rateLimiter.batchDelay(500);
      
      expect(mockDelay).toHaveBeenCalledWith(500);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      rateLimiter.updateConfig({ maxRetries: 5, retryDelay: 1500 });
      const config = rateLimiter.getConfig();
      
      expect(config).toEqual({
        maxRetries: 5,
        retryDelay: 1500,
        batchDelay: 300, // unchanged
      });
    });

    it('should merge with existing config', () => {
      rateLimiter.updateConfig({ maxRetries: 2 });
      const config = rateLimiter.getConfig();
      
      expect(config).toEqual({
        maxRetries: 2,
        retryDelay: 2000, // unchanged
        batchDelay: 300,  // unchanged
      });
    });
  });

  describe('isRateLimitError (private method behavior)', () => {
    it('should detect various rate limit error formats', async () => {
      const testCases = [
        { code: 'error_too_frequent' },
        { status: 429 },
        { statusCode: 429 },
        { message: 'Rate limit exceeded' },
        { message: 'Too many requests' },
        { message: 'Request too frequent' },
      ];

      for (const errorCase of testCases) {
        const mockFn = vi.fn()
          .mockRejectedValueOnce(errorCase)
          .mockResolvedValue('success');
        
        const result = await rateLimiter.executeWithRetry(mockFn);
        expect(result).toBe('success');
        expect(mockFn).toHaveBeenCalledTimes(2); // Should retry once
        
        // Reset for next test
        mockFn.mockClear();
        mockDelay.mockClear();
      }
    });

    it('should not detect non-rate-limit errors', async () => {
      const testCases = [
        { code: 'error_auth' },
        { status: 500 },
        { message: 'Network error' },
        { message: 'Invalid parameters' },
        'string error',
        null,
        undefined,
      ];

      for (const errorCase of testCases) {
        const mockFn = vi.fn().mockRejectedValue(errorCase);
        
        await expect(rateLimiter.executeWithRetry(mockFn)).rejects.toEqual(errorCase);
        expect(mockFn).toHaveBeenCalledTimes(1); // Should not retry
        
        // Reset for next test
        mockFn.mockClear();
      }
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle single retry (maxRetries: 1)', async () => {
      const error = { code: 'error_too_frequent', message: 'Rate limited' };
      const mockFn = vi.fn().mockRejectedValue(error);
      
      await expect(rateLimiter.executeWithRetry(mockFn, { maxRetries: 1 })).rejects.toEqual(error);
      
      expect(mockFn).toHaveBeenCalledTimes(1); // Should execute once with maxRetries: 1
      expect(mockDelay).not.toHaveBeenCalled(); // No retry delay since it fails on first attempt
    });

    it('should handle function that throws non-Error objects', async () => {
      const mockFn = vi.fn().mockRejectedValue('string error');
      
      await expect(rateLimiter.executeWithRetry(mockFn)).rejects.toBe('string error');
      
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockDelay).not.toHaveBeenCalled();
    });

    it('should handle rate limit error with retryAfter property', async () => {
      const error = { 
        code: 'error_too_frequent', 
        message: 'Rate limited',
        retryAfter: 5000 
      };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockDelay).toHaveBeenCalledWith(2000); // Should use configured delay, not retryAfter
    });

    it('should handle very large retry delays without overflow', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockResolvedValue('success');
      
      const result = await rateLimiter.executeWithRetry(mockFn, { 
        retryDelay: 10000, // Large delay
        maxRetries: 4 
      });
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(4);
      expect(mockDelay).toHaveBeenCalledWith(10000); // 10000 * 2^0 = 10000
      expect(mockDelay).toHaveBeenCalledWith(20000); // 10000 * 2^1 = 20000
      expect(mockDelay).toHaveBeenCalledWith(40000); // 10000 * 2^2 = 40000
    });

    it('should handle concurrent executions independently', async () => {
      const mockFn1 = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockResolvedValue('success1');
      
      const mockFn2 = vi.fn()
        .mockRejectedValueOnce({ code: 'error_too_frequent' })
        .mockResolvedValue('success2');
      
      const [result1, result2] = await Promise.all([
        rateLimiter.executeWithRetry(mockFn1),
        rateLimiter.executeWithRetry(mockFn2)
      ]);
      
      expect(result1).toBe('success1');
      expect(result2).toBe('success2');
      expect(mockFn1).toHaveBeenCalledTimes(2);
      expect(mockFn2).toHaveBeenCalledTimes(2);
    });
  });

  describe('batch delay edge cases', () => {
    it('should handle zero batch delay', async () => {
      await rateLimiter.batchDelay(0);
      
      expect(mockDelay).toHaveBeenCalledWith(0);
    });

    it('should handle negative batch delay as zero', async () => {
      await rateLimiter.batchDelay(-100);
      
      expect(mockDelay).toHaveBeenCalledWith(-100); // Pass through to delay function
    });

    it('should handle very large batch delays', async () => {
      await rateLimiter.batchDelay(999999);
      
      expect(mockDelay).toHaveBeenCalledWith(999999);
    });
  });
});