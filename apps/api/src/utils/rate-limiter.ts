import { delay } from './delay';

export interface RateLimitConfig {
  maxRetries: number;        // Default: 3
  retryDelay: number;        // Default: 2000ms
  batchDelay: number;        // Default: 300ms
}

export interface RateLimitError extends Error {
  code: string;
  retryAfter?: number;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRetries: 3,
      retryDelay: 2000,
      batchDelay: 300,
      ...config,
    };
  }

  /**
   * Execute function with rate limit handling and exponential backoff
   * @param fn - Async function to execute
   * @param config - Override configuration for this execution
   * @returns Function result or throws error after max retries
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    config?: Partial<RateLimitConfig>
  ): Promise<T> {
    const effectiveConfig = { ...this.config, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= effectiveConfig.maxRetries; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if this is a rate limit error
        const isRateLimitError = this.isRateLimitError(error);
        
        if (!isRateLimitError || attempt === effectiveConfig.maxRetries) {
          // If not a rate limit error or we've exhausted retries, throw immediately
          throw error;
        }

        // Log retry attempt
        console.warn('[rate-limiter]', {
          timestamp: new Date().toISOString(),
          attempt,
          maxRetries: effectiveConfig.maxRetries,
          retryDelay: effectiveConfig.retryDelay,
          errorType: 'rate_limit',
          message: 'Rate limit hit, retrying after delay',
        });

        // Wait before retry with exponential backoff
        const delayMs = effectiveConfig.retryDelay * Math.pow(2, attempt - 1);
        await delay(delayMs);
      }
    }

    // This should never be reached due to the throw in the loop, but TypeScript needs it
    throw lastError!;
  }

  /**
   * Delay execution for batch processing to prevent hitting rate limits
   * @param customDelay - Optional custom delay in milliseconds
   */
  async batchDelay(customDelay?: number): Promise<void> {
    const delayMs = customDelay ?? this.config.batchDelay;
    await delay(delayMs);
  }

  /**
   * Check if an error is a rate limit error
   * @param error - Error to check
   * @returns True if error indicates rate limiting
   */
  private isRateLimitError(error: any): boolean {
    // Check for Shopee API rate limit error
    if (error?.code === 'error_too_frequent') {
      return true;
    }

    // Check for HTTP 429 Too Many Requests
    if (error?.status === 429 || error?.statusCode === 429) {
      return true;
    }

    // Check for rate limit in error message
    if (typeof error?.message === 'string') {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') || 
             message.includes('too many requests') ||
             message.includes('too frequent');
    }

    return false;
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export a default instance for convenience
export const defaultRateLimiter = new RateLimiter();