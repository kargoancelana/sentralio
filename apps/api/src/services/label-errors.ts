/**
 * Label Service Error Types
 * 
 * Defines error types and error handling utilities for label operations.
 * Provides user-friendly error messages in Indonesian.
 * 
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

/**
 * Error type enumeration
 */
export enum LabelErrorType {
  VALIDATION = 'validation',
  AUTH = 'auth',
  NETWORK = 'network',
  SHOPEE_API = 'shopee_api',
  RATE_LIMIT = 'rate_limit',
  NOT_AVAILABLE = 'not_available',
  UNEXPECTED = 'unexpected'
}

/**
 * Label service error class
 */
export class LabelError extends Error {
  public readonly type: LabelErrorType;
  public readonly orderSn?: string;
  public readonly shopId?: number;
  public readonly originalError?: any;

  constructor(
    message: string,
    type: LabelErrorType,
    orderSn?: string,
    shopId?: number,
    originalError?: any
  ) {
    super(message);
    this.name = 'LabelError';
    this.type = type;
    this.orderSn = orderSn;
    this.shopId = shopId;
    this.originalError = originalError;
  }
}

/**
 * Map error to user-friendly Indonesian message
 * 
 * @param error - Error object
 * @param orderSn - Order serial number (optional)
 * @returns User-friendly error message
 * 
 * **Validates: Requirements 10.1, 10.2, 10.3, 15.1, 15.4**
 */
export function mapErrorToUserMessage(error: any, orderSn?: string): string {
  const orderRef = orderSn ? ` untuk pesanan ${orderSn}` : '';

  // Handle LabelError instances
  if (error instanceof LabelError) {
    switch (error.type) {
      case LabelErrorType.VALIDATION:
        return error.message; // Validation errors already have user-friendly messages
      
      case LabelErrorType.AUTH:
        return `Sesi Shopee berakhir. Silakan hubungkan ulang toko Anda`;
      
      case LabelErrorType.NETWORK:
        return `Koneksi gagal${orderRef}. Silakan coba lagi`;
      
      case LabelErrorType.SHOPEE_API:
        return error.message; // Shopee API errors already have user-friendly messages
      
      case LabelErrorType.RATE_LIMIT:
        return `Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat`;
      
      case LabelErrorType.NOT_AVAILABLE:
        return `Label pengiriman belum tersedia${orderRef}. Silakan coba lagi dalam beberapa menit`;
      
      case LabelErrorType.UNEXPECTED:
      default:
        return `Terjadi kesalahan tidak terduga${orderRef}. Silakan coba lagi`;
    }
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return `Koneksi gagal${orderRef}. Silakan coba lagi`;
    }

    // Authentication errors
    if (message.includes('auth') || message.includes('token') || message.includes('credentials')) {
      return `Sesi Shopee berakhir. Silakan hubungkan ulang toko Anda`;
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too frequent')) {
      return `Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat`;
    }

    // Label not available
    if (message.includes('belum tersedia') || message.includes('not available')) {
      return `Label pengiriman belum tersedia${orderRef}. Silakan coba lagi dalam beberapa menit`;
    }

    // Validation errors (already in Indonesian)
    if (message.includes('tidak ditemukan') || message.includes('tidak dapat')) {
      return error.message;
    }

    // Default error message
    return `Terjadi kesalahan${orderRef}: ${error.message}`;
  }

  // Handle unknown error types
  return `Terjadi kesalahan tidak terduga${orderRef}. Silakan coba lagi`;
}

/**
 * Determine error type from error object
 * 
 * @param error - Error object
 * @returns Error type
 */
export function determineErrorType(error: any): LabelErrorType {
  if (error instanceof LabelError) {
    return error.type;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('auth') || message.includes('token') || message.includes('credentials')) {
      return LabelErrorType.AUTH;
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return LabelErrorType.NETWORK;
    }

    if (message.includes('rate limit') || message.includes('too frequent')) {
      return LabelErrorType.RATE_LIMIT;
    }

    if (message.includes('belum tersedia') || message.includes('not available')) {
      return LabelErrorType.NOT_AVAILABLE;
    }

    if (message.includes('tidak ditemukan') || message.includes('tidak dapat')) {
      return LabelErrorType.VALIDATION;
    }

    if (message.includes('shopee') || message.includes('api')) {
      return LabelErrorType.SHOPEE_API;
    }
  }

  return LabelErrorType.UNEXPECTED;
}
