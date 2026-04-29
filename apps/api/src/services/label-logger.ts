/**
 * Label Service Logging Utilities
 * 
 * Provides structured logging for label operations with JSON formatting.
 * Logs include timestamps, context, and operation details for monitoring.
 * 
 * **Validates: Requirements 6.7, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**
 */

import type { LabelErrorType } from "./label-errors";

/**
 * Log level enumeration
 */
export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Base log entry interface
 */
export interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation?: string;
  message: string;
}

/**
 * Label operation log entry
 */
export interface LabelOperationLog extends BaseLogEntry {
  orderSn?: string;
  shopId?: number;
  operationType: 'single' | 'batch' | 'validation' | 'cache';
  result: 'success' | 'failure';
  duration?: number;
  errorType?: LabelErrorType;
  errorMessage?: string;
}

/**
 * Batch operation summary log entry
 */
export interface BatchSummaryLog extends BaseLogEntry {
  operationType: 'batch';
  total: number;
  successful: number;
  failed: number;
  duration?: number;
}

/**
 * Performance log entry
 */
export interface PerformanceLog extends BaseLogEntry {
  operation: string;
  duration: number;
  orderSn?: string;
  shopId?: number;
}

/**
 * Format log entry as JSON string
 * 
 * @param entry - Log entry object
 * @returns JSON string
 */
function formatLogEntry(entry: any): string {
  try {
    return JSON.stringify(entry);
  } catch (error) {
    // Fallback if JSON.stringify fails
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      service: 'label-logger',
      message: 'Failed to format log entry',
      error: String(error)
    });
  }
}

/**
 * Log label operation
 * 
 * @param params - Operation log parameters
 * 
 * **Validates: Requirements 12.1, 12.2, 12.4**
 */
export function logLabelOperation(params: {
  orderSn?: string;
  shopId?: number;
  operationType: 'single' | 'batch' | 'validation' | 'cache';
  result: 'success' | 'failure';
  message: string;
  duration?: number;
  errorType?: LabelErrorType;
  errorMessage?: string;
}): void {
  const level = params.result === 'success' ? LogLevel.INFO : LogLevel.ERROR;
  
  const logEntry: LabelOperationLog = {
    timestamp: new Date().toISOString(),
    level,
    service: 'label-service',
    operation: 'label_operation',
    message: params.message,
    orderSn: params.orderSn,
    shopId: params.shopId,
    operationType: params.operationType,
    result: params.result,
    duration: params.duration,
    errorType: params.errorType,
    errorMessage: params.errorMessage
  };

  const formatted = formatLogEntry(logEntry);
  
  if (level === LogLevel.ERROR) {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
}

/**
 * Log batch operation summary
 * 
 * @param params - Batch summary parameters
 * 
 * **Validates: Requirements 12.3, 12.4**
 */
export function logBatchSummary(params: {
  total: number;
  successful: number;
  failed: number;
  duration?: number;
  message?: string;
}): void {
  const logEntry: BatchSummaryLog = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    service: 'label-service',
    operation: 'batch_summary',
    message: params.message || `Batch operation completed: ${params.successful}/${params.total} successful`,
    operationType: 'batch',
    total: params.total,
    successful: params.successful,
    failed: params.failed,
    duration: params.duration
  };

  console.log(formatLogEntry(logEntry));
}

/**
 * Log performance metrics
 * 
 * @param params - Performance log parameters
 * 
 * **Validates: Requirements 12.6**
 */
export function logPerformance(params: {
  operation: string;
  duration: number;
  orderSn?: string;
  shopId?: number;
  message?: string;
}): void {
  const logEntry: PerformanceLog = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    service: 'label-service',
    operation: params.operation,
    message: params.message || `Operation completed in ${params.duration}ms`,
    duration: params.duration,
    orderSn: params.orderSn,
    shopId: params.shopId
  };

  console.log(formatLogEntry(logEntry));
}

/**
 * Log info message
 * 
 * @param message - Log message
 * @param context - Additional context
 */
export function logInfo(message: string, context?: Record<string, any>): void {
  const logEntry: BaseLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    service: 'label-service',
    message,
    ...context
  };

  console.log(formatLogEntry(logEntry));
}

/**
 * Log warning message
 * 
 * @param message - Log message
 * @param context - Additional context
 */
export function logWarn(message: string, context?: Record<string, any>): void {
  const logEntry: BaseLogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel.WARN,
    service: 'label-service',
    message,
    ...context
  };

  console.warn(formatLogEntry(logEntry));
}

/**
 * Log error message
 * 
 * @param message - Log message
 * @param error - Error object
 * @param context - Additional context
 */
export function logError(message: string, error?: any, context?: Record<string, any>): void {
  const logEntry: any = {
    timestamp: new Date().toISOString(),
    level: LogLevel.ERROR,
    service: 'label-service',
    message,
    ...context
  };

  if (error) {
    logEntry.error = {
      message: error.message || String(error),
      stack: error.stack,
      type: error.constructor?.name
    };
  }

  console.error(formatLogEntry(logEntry));
}
