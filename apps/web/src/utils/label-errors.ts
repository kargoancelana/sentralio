/**
 * Label Error Handling Utilities
 * 
 * Provides utilities for mapping error types to user-friendly Indonesian messages.
 * 
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

/**
 * Error types for label printing operations
 */
export type LabelErrorType =
  | 'network_error'
  | 'auth_error'
  | 'not_found'
  | 'not_eligible'
  | 'label_not_available'
  | 'validation_error'
  | 'timeout_error'
  | 'rate_limit_error'
  | 'unknown_error';

/**
 * Error information structure
 */
export interface LabelError {
  type: LabelErrorType;
  message: string;
  originalError?: any;
}

/**
 * Map HTTP status codes and error messages to user-friendly Indonesian messages
 * 
 * @param error - Error object from API call
 * @returns User-friendly error message in Indonesian
 * 
 * **Requirements:**
 * - 10.1: Network errors
 * - 10.2: Authentication errors
 * - 10.3: Label not available errors
 */
export function mapLabelError(error: any): LabelError {
  // Network errors
  if (!error.status && (error.message?.includes('fetch') || error.message?.includes('network'))) {
    return {
      type: 'network_error',
      message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
      originalError: error,
    };
  }

  // Authentication errors (401, 403)
  if (error.status === 401 || error.status === 403) {
    return {
      type: 'auth_error',
      message: 'Sesi Anda telah berakhir. Silakan login kembali.',
      originalError: error,
    };
  }

  // Not found errors (404)
  if (error.status === 404) {
    return {
      type: 'not_found',
      message: 'Pesanan tidak ditemukan.',
      originalError: error,
    };
  }

  // Validation errors (422)
  if (error.status === 422) {
    // Check if it's specifically about label eligibility
    if (error.message?.includes('not eligible') || error.message?.includes('status')) {
      return {
        type: 'not_eligible',
        message: 'Label pengiriman belum tersedia. Pastikan pesanan sudah diproses.',
        originalError: error,
      };
    }
    
    if (error.message?.includes('tracking')) {
      return {
        type: 'not_eligible',
        message: 'Nomor resi belum tersedia untuk pesanan ini.',
        originalError: error,
      };
    }

    return {
      type: 'validation_error',
      message: 'Data pesanan tidak valid.',
      originalError: error,
    };
  }

  // Rate limit errors (429)
  if (error.status === 429) {
    return {
      type: 'rate_limit_error',
      message: 'Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.',
      originalError: error,
    };
  }

  // Timeout errors (408, 504)
  if (error.status === 408 || error.status === 504) {
    return {
      type: 'timeout_error',
      message: 'Permintaan memakan waktu terlalu lama. Silakan coba lagi.',
      originalError: error,
    };
  }

  // Server errors (500, 502, 503)
  if (error.status >= 500 && error.status < 600) {
    return {
      type: 'unknown_error',
      message: 'Terjadi kesalahan pada server. Silakan coba lagi nanti.',
      originalError: error,
    };
  }

  // Label not available from Shopee API
  if (error.message?.includes('label not available') || error.message?.includes('document not found')) {
    return {
      type: 'label_not_available',
      message: 'Label pengiriman belum tersedia dari Shopee. Silakan coba lagi nanti.',
      originalError: error,
    };
  }

  // Default unknown error
  return {
    type: 'unknown_error',
    message: error.message || 'Terjadi kesalahan saat mencetak label. Silakan coba lagi.',
    originalError: error,
  };
}

/**
 * Get user-friendly error message for a specific order
 * 
 * @param orderSn - Order serial number
 * @param error - Error object
 * @returns Formatted error message with order number
 */
export function getOrderErrorMessage(orderSn: string, error: any): string {
  const labelError = mapLabelError(error);
  return `Pesanan #${orderSn}: ${labelError.message}`;
}

/**
 * Get batch error summary message
 * 
 * @param successful - Number of successful operations
 * @param failed - Number of failed operations
 * @param total - Total number of operations
 * @returns Summary message in Indonesian
 */
export function getBatchSummaryMessage(successful: number, failed: number, total: number): string {
  if (failed === 0) {
    return `Semua ${total} label berhasil dicetak`;
  }
  
  if (successful === 0) {
    return `Gagal mencetak semua ${total} label`;
  }
  
  return `${successful} label berhasil dicetak, ${failed} gagal dari ${total} pesanan`;
}

/**
 * Check if error is retryable
 * 
 * @param error - Error object
 * @returns True if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const labelError = mapLabelError(error);
  
  // Network, timeout, and rate limit errors are retryable
  return (
    labelError.type === 'network_error' ||
    labelError.type === 'timeout_error' ||
    labelError.type === 'rate_limit_error' ||
    labelError.type === 'unknown_error'
  );
}
