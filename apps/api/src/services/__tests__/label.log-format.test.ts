import { describe, it, expect, beforeEach, afterEach } from "bun:test";

/**
 * Property-Based Test: Log Format Validity
 * 
 * **Validates: Requirements 12.4**
 * 
 * Property 13: Log Format Validity
 * 
 * For any log entry created by the label service, the log output SHALL be valid JSON
 * that can be parsed without errors, and SHALL contain at minimum a timestamp field
 * and a message or event type field.
 */

/**
 * Validate that a log entry has valid JSON format
 */
function validateLogFormat(logString: string): {
  valid: boolean;
  errors: string[];
  parsed?: any;
} {
  const errors: string[] = [];
  let parsed: any;

  // Test 1: Must be valid JSON
  try {
    parsed = JSON.parse(logString);
  } catch (error: any) {
    errors.push(`Invalid JSON: ${error.message}`);
    return { valid: false, errors };
  }

  // Check if parsed is an object
  if (!parsed || typeof parsed !== 'object') {
    errors.push('Log must be a JSON object');
    return { valid: false, errors };
  }

  // Test 2: Must have timestamp field
  if (!parsed.timestamp) {
    errors.push('Missing required field: timestamp');
  }

  // Test 3: Must have message OR operation/event type field
  const hasMessage = parsed.message !== undefined && parsed.message !== null;
  const hasEventType = parsed.operation !== undefined || parsed.operationType !== undefined || parsed.event !== undefined;
  
  if (!hasMessage && !hasEventType) {
    errors.push('Missing required field: must have either "message" or event type field (operation/operationType/event)');
  }

  // Test 4: Timestamp must be a string
  if (parsed.timestamp && typeof parsed.timestamp !== 'string') {
    errors.push('timestamp must be a string');
  }

  // Test 5: Timestamp must be valid ISO 8601 format
  if (parsed.timestamp && typeof parsed.timestamp === 'string') {
    const date = new Date(parsed.timestamp);
    if (isNaN(date.getTime())) {
      errors.push('timestamp must be valid ISO 8601 format');
    }
  }

  // Test 6: Message must be a string if present
  if (parsed.message !== undefined && typeof parsed.message !== 'string') {
    errors.push('message must be a string');
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed
  };
}

/**
 * Generate random order SN
 */
function generateOrderSn(): string {
  const prefix = Math.random() > 0.5 ? 'ORDER' : 'TEST';
  const number = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  return `${prefix}_${number}`;
}

/**
 * Generate random shop ID
 */
function generateShopId(): number {
  return Math.floor(Math.random() * 1000) + 1;
}

describe("Property 13: Log Format Validity", () => {
  let originalLog: typeof console.log;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;
  let logs: string[];

  beforeEach(() => {
    // Capture all console output
    logs = [];
    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
    };
    console.error = (...args: any[]) => {
      logs.push(args.join(' '));
    };
    console.warn = (...args: any[]) => {
      logs.push(args.join(' '));
    };
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  });

  describe("Core Properties", () => {
    it("should produce valid JSON for all log entries", async () => {
      /**
       * Property: All log entries SHALL be valid JSON
       * 
       * Test strategy:
       * - Execute 100 various logging operations
       * - Verify all logs can be parsed as JSON
       */
      const { logLabelOperation, logBatchSummary, logPerformance, logInfo, logWarn, logError } = await import("../label-logger");
      
      const testCases = 100;

      for (let i = 0; i < testCases; i++) {
        logs = [];

        // Randomly choose a logging function
        const logType = Math.floor(Math.random() * 6);
        
        switch (logType) {
          case 0:
            logLabelOperation({
              orderSn: generateOrderSn(),
              shopId: generateShopId(),
              operationType: 'single',
              result: 'success',
              message: 'Test operation'
            });
            break;
          case 1:
            logBatchSummary({
              total: Math.floor(Math.random() * 50) + 1,
              successful: Math.floor(Math.random() * 25),
              failed: Math.floor(Math.random() * 25)
            });
            break;
          case 2:
            logPerformance({
              operation: 'test_operation',
              duration: Math.floor(Math.random() * 5000)
            });
            break;
          case 3:
            logInfo('Test info message', { context: 'test' });
            break;
          case 4:
            logWarn('Test warning message', { context: 'test' });
            break;
          case 5:
            logError('Test error message', new Error('Test error'), { context: 'test' });
            break;
        }

        // Verify all logs are valid JSON
        for (const log of logs) {
          expect(() => JSON.parse(log)).not.toThrow();
        }
      }
    });

    it("should include timestamp in all log entries", async () => {
      /**
       * Property: All log entries SHALL contain timestamp field
       * 
       * Test strategy:
       * - Execute 50 various logging operations
       * - Verify all logs have timestamp field
       */
      const { logLabelOperation, logBatchSummary, logPerformance, logInfo, logWarn, logError } = await import("../label-logger");
      
      const testCases = 50;

      for (let i = 0; i < testCases; i++) {
        logs = [];

        // Test all logging functions
        logLabelOperation({
          orderSn: generateOrderSn(),
          operationType: 'single',
          result: 'success',
          message: 'Test'
        });

        logBatchSummary({
          total: 10,
          successful: 5,
          failed: 5
        });

        logPerformance({
          operation: 'test',
          duration: 100
        });

        logInfo('Test info');
        logWarn('Test warn');
        logError('Test error');

        // Verify all logs have timestamp
        for (const log of logs) {
          const parsed = JSON.parse(log);
          expect(parsed.timestamp).toBeDefined();
          expect(typeof parsed.timestamp).toBe('string');
        }
      }
    });

    it("should include message or event type in all log entries", async () => {
      /**
       * Property: All log entries SHALL contain message OR event type field
       * 
       * Test strategy:
       * - Execute various logging operations
       * - Verify all logs have either message or operation/operationType/event field
       */
      const { logLabelOperation, logBatchSummary, logPerformance, logInfo, logWarn, logError } = await import("../label-logger");
      
      logs = [];

      // Test all logging functions
      logLabelOperation({
        orderSn: generateOrderSn(),
        operationType: 'single',
        result: 'success',
        message: 'Test operation'
      });

      logBatchSummary({
        total: 10,
        successful: 5,
        failed: 5
      });

      logPerformance({
        operation: 'test_operation',
        duration: 100
      });

      logInfo('Test info message');
      logWarn('Test warning message');
      logError('Test error message');

      // Verify all logs have message or event type
      for (const log of logs) {
        const parsed = JSON.parse(log);
        const hasMessage = parsed.message !== undefined;
        const hasEventType = parsed.operation !== undefined || parsed.operationType !== undefined || parsed.event !== undefined;
        
        expect(hasMessage || hasEventType).toBe(true);
      }
    });
  });

  describe("Timestamp Validation", () => {
    it("should use ISO 8601 format for all timestamps", async () => {
      /**
       * Property: All timestamps SHALL be in ISO 8601 format
       * 
       * Test strategy:
       * - Execute 100 logging operations
       * - Verify all timestamps match ISO 8601 pattern
       * - Verify all timestamps can be parsed as valid dates
       */
      const { logLabelOperation, logBatchSummary, logPerformance } = await import("../label-logger");
      
      const testCases = 100;

      for (let i = 0; i < testCases; i++) {
        logs = [];

        // Randomly choose a logging function
        const logType = Math.floor(Math.random() * 3);
        
        switch (logType) {
          case 0:
            logLabelOperation({
              orderSn: generateOrderSn(),
              operationType: 'single',
              result: 'success',
              message: 'Test'
            });
            break;
          case 1:
            logBatchSummary({
              total: Math.floor(Math.random() * 50) + 1,
              successful: Math.floor(Math.random() * 25),
              failed: Math.floor(Math.random() * 25)
            });
            break;
          case 2:
            logPerformance({
              operation: 'test',
              duration: Math.floor(Math.random() * 5000)
            });
            break;
        }

        // Verify all timestamps are ISO 8601
        for (const log of logs) {
          const parsed = JSON.parse(log);
          
          // Check ISO 8601 pattern
          expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          
          // Verify can be parsed as valid date
          const date = new Date(parsed.timestamp);
          expect(isNaN(date.getTime())).toBe(false);
        }
      }
    });

    it("should have recent timestamps", async () => {
      /**
       * Property: Timestamps SHALL be close to current time
       * 
       * Test strategy:
       * - Execute logging operations
       * - Verify timestamps are within 1 second of current time
       */
      const { logInfo } = await import("../label-logger");
      
      const testCases = 20;

      for (let i = 0; i < testCases; i++) {
        logs = [];

        const beforeTime = Date.now();
        logInfo('Test message');
        const afterTime = Date.now();

        for (const log of logs) {
          const parsed = JSON.parse(log);
          const logTime = new Date(parsed.timestamp).getTime();
          
          // Timestamp should be between before and after (with 1s tolerance)
          expect(logTime).toBeGreaterThanOrEqual(beforeTime - 1000);
          expect(logTime).toBeLessThanOrEqual(afterTime + 1000);
        }
      }
    });
  });

  describe("Field Type Validation", () => {
    it("should have string type for timestamp field", async () => {
      /**
       * Property: timestamp field SHALL be a string
       * 
       * Test strategy:
       * - Execute various logging operations
       * - Verify timestamp is always a string
       */
      const { logLabelOperation, logBatchSummary, logPerformance, logInfo } = await import("../label-logger");
      
      logs = [];

      logLabelOperation({
        orderSn: generateOrderSn(),
        operationType: 'single',
        result: 'success',
        message: 'Test'
      });

      logBatchSummary({
        total: 10,
        successful: 5,
        failed: 5
      });

      logPerformance({
        operation: 'test',
        duration: 100
      });

      logInfo('Test message');

      for (const log of logs) {
        const parsed = JSON.parse(log);
        expect(typeof parsed.timestamp).toBe('string');
      }
    });

    it("should have string type for message field when present", async () => {
      /**
       * Property: message field SHALL be a string when present
       * 
       * Test strategy:
       * - Execute logging operations with messages
       * - Verify message is always a string
       */
      const { logLabelOperation, logInfo, logWarn, logError } = await import("../label-logger");
      
      logs = [];

      logLabelOperation({
        orderSn: generateOrderSn(),
        operationType: 'single',
        result: 'success',
        message: 'Test operation message'
      });

      logInfo('Info message');
      logWarn('Warning message');
      logError('Error message');

      for (const log of logs) {
        const parsed = JSON.parse(log);
        if (parsed.message !== undefined) {
          expect(typeof parsed.message).toBe('string');
        }
      }
    });
  });

  describe("Validation Function Tests", () => {
    it("should pass validation for all valid log entries", async () => {
      /**
       * Property: All log entries SHALL pass format validation
       * 
       * Test strategy:
       * - Execute 100 various logging operations
       * - Verify all logs pass validateLogFormat
       */
      const { logLabelOperation, logBatchSummary, logPerformance, logInfo, logWarn, logError } = await import("../label-logger");
      
      const testCases = 100;

      for (let i = 0; i < testCases; i++) {
        logs = [];

        // Randomly choose a logging function
        const logType = Math.floor(Math.random() * 6);
        
        switch (logType) {
          case 0:
            logLabelOperation({
              orderSn: generateOrderSn(),
              shopId: generateShopId(),
              operationType: 'single',
              result: 'success',
              message: 'Test operation'
            });
            break;
          case 1:
            logBatchSummary({
              total: Math.floor(Math.random() * 50) + 1,
              successful: Math.floor(Math.random() * 25),
              failed: Math.floor(Math.random() * 25)
            });
            break;
          case 2:
            logPerformance({
              operation: 'test_operation',
              duration: Math.floor(Math.random() * 5000)
            });
            break;
          case 3:
            logInfo('Test info message', { context: 'test' });
            break;
          case 4:
            logWarn('Test warning message', { context: 'test' });
            break;
          case 5:
            logError('Test error message', new Error('Test error'), { context: 'test' });
            break;
        }

        // Verify all logs pass validation
        for (const log of logs) {
          const validation = validateLogFormat(log);
          
          if (!validation.valid) {
            console.error('Validation errors:', validation.errors);
            console.error('Log entry:', log);
          }
          
          expect(validation.valid).toBe(true);
          expect(validation.errors).toHaveLength(0);
        }
      }
    });

    it("should detect invalid JSON", () => {
      /**
       * Property: Validation should detect invalid JSON
       * 
       * Test strategy:
       * - Test various invalid JSON strings
       * - Verify validation fails
       */
      const invalidJsonStrings = [
        'not json at all',
        '{invalid: json}',
        '{"unclosed": "string',
        '{"trailing": "comma",}',
        '{key: "no quotes"}',
        '',
        'null',
        'undefined',
        '123',
        'true'
      ];

      for (const invalidJson of invalidJsonStrings) {
        const validation = validateLogFormat(invalidJson);
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      }
    });

    it("should detect missing timestamp", () => {
      /**
       * Property: Validation should detect missing timestamp
       * 
       * Test strategy:
       * - Create log without timestamp
       * - Verify validation fails
       */
      const logWithoutTimestamp = JSON.stringify({
        level: 'info',
        service: 'label-service',
        message: 'Test message'
      });

      const validation = validateLogFormat(logWithoutTimestamp);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('timestamp'))).toBe(true);
    });

    it("should detect missing message and event type", () => {
      /**
       * Property: Validation should detect when both message and event type are missing
       * 
       * Test strategy:
       * - Create log without message or event type
       * - Verify validation fails
       */
      const logWithoutMessageOrEvent = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'label-service'
      });

      const validation = validateLogFormat(logWithoutMessageOrEvent);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('message') || e.includes('event'))).toBe(true);
    });

    it("should detect invalid timestamp format", () => {
      /**
       * Property: Validation should detect invalid timestamp format
       * 
       * Test strategy:
       * - Create log with invalid timestamp
       * - Verify validation fails
       */
      const logWithInvalidTimestamp = JSON.stringify({
        timestamp: 'not-a-date',
        message: 'Test message'
      });

      const validation = validateLogFormat(logWithInvalidTimestamp);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('timestamp'))).toBe(true);
    });

    it("should detect non-string timestamp", () => {
      /**
       * Property: Validation should detect when timestamp is not a string
       * 
       * Test strategy:
       * - Create log with numeric timestamp
       * - Verify validation fails
       */
      const logWithNumericTimestamp = JSON.stringify({
        timestamp: Date.now(),
        message: 'Test message'
      });

      const validation = validateLogFormat(logWithNumericTimestamp);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('timestamp') && e.includes('string'))).toBe(true);
    });

    it("should detect non-string message", () => {
      /**
       * Property: Validation should detect when message is not a string
       * 
       * Test strategy:
       * - Create log with non-string message
       * - Verify validation fails
       */
      const logWithNumericMessage = JSON.stringify({
        timestamp: new Date().toISOString(),
        message: 12345
      });

      const validation = validateLogFormat(logWithNumericMessage);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('message') && e.includes('string'))).toBe(true);
    });
  });

  describe("Different Log Types", () => {
    it("should validate label operation logs", async () => {
      /**
       * Property: Label operation logs SHALL be valid
       * 
       * Test strategy:
       * - Test all operation types (single, batch, validation, cache)
       * - Test both success and failure results
       * - Verify all pass validation
       */
      const { logLabelOperation } = await import("../label-logger");
      
      const operationTypes: Array<'single' | 'batch' | 'validation' | 'cache'> = ['single', 'batch', 'validation', 'cache'];
      const results: Array<'success' | 'failure'> = ['success', 'failure'];

      for (const operationType of operationTypes) {
        for (const result of results) {
          logs = [];

          logLabelOperation({
            orderSn: generateOrderSn(),
            shopId: generateShopId(),
            operationType,
            result,
            message: `Test ${operationType} ${result}`
          });

          for (const log of logs) {
            const validation = validateLogFormat(log);
            expect(validation.valid).toBe(true);
          }
        }
      }
    });

    it("should validate batch summary logs", async () => {
      /**
       * Property: Batch summary logs SHALL be valid
       * 
       * Test strategy:
       * - Test various batch sizes and success/failure distributions
       * - Verify all pass validation
       */
      const { logBatchSummary } = await import("../label-logger");
      
      const testCases = [
        { total: 0, successful: 0, failed: 0 },
        { total: 1, successful: 1, failed: 0 },
        { total: 1, successful: 0, failed: 1 },
        { total: 10, successful: 5, failed: 5 },
        { total: 50, successful: 25, failed: 25 },
        { total: 50, successful: 50, failed: 0 },
        { total: 50, successful: 0, failed: 50 },
      ];

      for (const testCase of testCases) {
        logs = [];

        logBatchSummary(testCase);

        for (const log of logs) {
          const validation = validateLogFormat(log);
          expect(validation.valid).toBe(true);
        }
      }
    });

    it("should validate performance logs", async () => {
      /**
       * Property: Performance logs SHALL be valid
       * 
       * Test strategy:
       * - Test various operations and durations
       * - Verify all pass validation
       */
      const { logPerformance } = await import("../label-logger");
      
      const operations = ['getSingleLabel', 'getBatchLabels', 'cache_hit', 'cache_miss', 'api_call'];
      const durations = [0, 1, 100, 1000, 5000, 10000];

      for (const operation of operations) {
        for (const duration of durations) {
          logs = [];

          logPerformance({
            operation,
            duration,
            orderSn: generateOrderSn(),
            shopId: generateShopId()
          });

          for (const log of logs) {
            const validation = validateLogFormat(log);
            expect(validation.valid).toBe(true);
          }
        }
      }
    });

    it("should validate info/warn/error logs", async () => {
      /**
       * Property: Info/warn/error logs SHALL be valid
       * 
       * Test strategy:
       * - Test all log levels
       * - Test with and without context
       * - Verify all pass validation
       */
      const { logInfo, logWarn, logError } = await import("../label-logger");
      
      const messages = [
        'Simple message',
        'Message with special chars: !@#$%^&*()',
        'Message with unicode: 你好世界 🚀',
        'Very long message: ' + 'x'.repeat(1000)
      ];

      for (const message of messages) {
        logs = [];

        logInfo(message);
        logWarn(message);
        logError(message, new Error('Test error'));

        for (const log of logs) {
          const validation = validateLogFormat(log);
          expect(validation.valid).toBe(true);
        }
      }
    });
  });

  describe("Stress Tests", () => {
    it("should maintain valid format under rapid logging", async () => {
      /**
       * Property: Rapid logging should not corrupt format
       * 
       * Test strategy:
       * - Execute 1000 rapid logging operations
       * - Verify all logs remain valid
       */
      const { logInfo } = await import("../label-logger");
      
      logs = [];

      for (let i = 0; i < 1000; i++) {
        logInfo(`Rapid log ${i}`);
      }

      // Verify all logs are valid
      for (const log of logs) {
        const validation = validateLogFormat(log);
        expect(validation.valid).toBe(true);
      }
    });

    it("should handle concurrent logging", async () => {
      /**
       * Property: Concurrent logging should produce valid logs
       * 
       * Test strategy:
       * - Execute 100 concurrent logging operations
       * - Verify all logs are valid
       */
      const { logInfo, logWarn, logError } = await import("../label-logger");
      
      logs = [];

      // Execute concurrent logging
      await Promise.all(
        Array.from({ length: 100 }, (_, i) => {
          const logType = i % 3;
          if (logType === 0) {
            return Promise.resolve(logInfo(`Concurrent info ${i}`));
          } else if (logType === 1) {
            return Promise.resolve(logWarn(`Concurrent warn ${i}`));
          } else {
            return Promise.resolve(logError(`Concurrent error ${i}`));
          }
        })
      );

      // Verify all logs are valid
      for (const log of logs) {
        const validation = validateLogFormat(log);
        expect(validation.valid).toBe(true);
      }
    });

    it("should handle edge case values", async () => {
      /**
       * Property: Edge case values should not break log format
       * 
       * Test strategy:
       * - Test with empty strings, null, undefined, special characters
       * - Verify logs remain valid JSON
       */
      const { logInfo } = await import("../label-logger");
      
      const edgeCases = [
        '',
        ' ',
        '\n',
        '\t',
        'null',
        'undefined',
        '{}',
        '[]',
        '"quoted"',
        "single'quote",
        'back\\slash',
        'forward/slash'
      ];

      for (const edgeCase of edgeCases) {
        logs = [];
        logInfo(edgeCase);

        for (const log of logs) {
          const validation = validateLogFormat(log);
          expect(validation.valid).toBe(true);
        }
      }
    });
  });
});
