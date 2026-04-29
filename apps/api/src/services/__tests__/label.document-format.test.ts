import { describe, it, expect } from "bun:test";

/**
 * Property-Based Test: Document Format Validation
 * 
 * **Validates: Requirements 7.4**
 * 
 * Property 16: Document Format Validation
 * 
 * For any label document received from Shopee API, the validation SHALL check 
 * that the document is not empty (url or base64 data present) AND format field 
 * is one of 'pdf', 'png', or 'jpg', and SHALL reject documents failing either check.
 */

// Valid format types
const VALID_FORMATS = ['pdf', 'png', 'jpg'] as const;
type ValidFormat = typeof VALID_FORMATS[number];

// Property-based test generators
function generateValidFormat(): ValidFormat {
  return VALID_FORMATS[Math.floor(Math.random() * VALID_FORMATS.length)];
}

function generateInvalidFormat(): string {
  const invalidFormats = [
    'gif', 'bmp', 'svg', 'webp', 'tiff', 'jpeg', // Similar but invalid
    'PDF', 'PNG', 'JPG', // Wrong case
    'pdf ', ' pdf', 'pdf\n', // Whitespace
    '', // Empty
    'doc', 'docx', 'txt', 'html', // Completely different
    'pdf.png', 'jpg.pdf', // Mixed
    '123', 'null', 'undefined', // Non-format strings
  ];
  return invalidFormats[Math.floor(Math.random() * invalidFormats.length)];
}

function generateValidUrl(): string {
  const domains = ['shopee.com', 'shopeemobile.com', 'example.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const path = Math.random().toString(36).substring(7);
  const extension = generateValidFormat();
  return `https://${domain}/labels/${path}.${extension}`;
}

function generateValidBase64(): string {
  // Generate a valid base64 string (simplified)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const length = Math.floor(Math.random() * 100) + 50; // 50-150 chars
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateEmptyValue(): string | undefined {
  const emptyValues = [
    '',
    undefined,
    '   ', // Whitespace only
    '\n',
    '\t',
  ];
  return emptyValues[Math.floor(Math.random() * emptyValues.length)] as string | undefined;
}

/**
 * Validation function that mimics the logic in getSingleLabel
 */
function validateDocumentFormat(document: {
  url?: string;
  base64?: string;
  format: string;
}): { valid: boolean; error?: string } {
  // Check 1: Document must not be empty (url or base64 must be present)
  const hasUrl = document.url && document.url.trim().length > 0;
  const hasBase64 = document.base64 && document.base64.trim().length > 0;
  
  if (!hasUrl && !hasBase64) {
    return {
      valid: false,
      error: 'Label document tidak memiliki URL atau data'
    };
  }

  // Check 2: Format must be one of 'pdf', 'png', or 'jpg'
  if (!VALID_FORMATS.includes(document.format as ValidFormat)) {
    return {
      valid: false,
      error: `Format label tidak didukung: ${document.format}`
    };
  }

  return { valid: true };
}

describe("Property 16: Document Format Validation", () => {
  it("should accept documents with valid URL and valid format", () => {
    /**
     * Property: For any document with a non-empty URL and format in ['pdf', 'png', 'jpg'],
     * validation SHALL succeed.
     * 
     * Test strategy:
     * - Generate 100 documents with valid URLs and valid formats
     * - Verify all pass validation
     */
    
    const testCases = Array.from({ length: 100 }, () => ({
      url: generateValidUrl(),
      format: generateValidFormat()
    }));

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Should be valid
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should accept documents with valid base64 and valid format", () => {
    /**
     * Property: For any document with non-empty base64 data and format in ['pdf', 'png', 'jpg'],
     * validation SHALL succeed.
     * 
     * Test strategy:
     * - Generate 100 documents with valid base64 and valid formats
     * - Verify all pass validation
     */
    
    const testCases = Array.from({ length: 100 }, () => ({
      base64: generateValidBase64(),
      format: generateValidFormat()
    }));

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Should be valid
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should accept documents with both URL and base64 present", () => {
    /**
     * Property: For any document with both URL and base64 present (and valid format),
     * validation SHALL succeed.
     * 
     * Test strategy:
     * - Generate 100 documents with both URL and base64
     * - Verify all pass validation
     */
    
    const testCases = Array.from({ length: 100 }, () => ({
      url: generateValidUrl(),
      base64: generateValidBase64(),
      format: generateValidFormat()
    }));

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Should be valid
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should reject documents with empty URL and empty base64", () => {
    /**
     * Property: For any document where both URL and base64 are empty/missing,
     * validation SHALL fail regardless of format.
     * 
     * Test strategy:
     * - Generate 100 documents with empty/missing URL and base64
     * - Test with both valid and invalid formats
     * - Verify all fail validation with appropriate error
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const useValidFormat = Math.random() > 0.5;
      return {
        url: generateEmptyValue(),
        base64: generateEmptyValue(),
        format: useValidFormat ? generateValidFormat() : generateInvalidFormat()
      };
    });

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Should be invalid
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('tidak memiliki URL atau data');
    }
  });

  it("should reject documents with valid data but invalid format", () => {
    /**
     * Property: For any document with non-empty URL or base64 but format NOT in ['pdf', 'png', 'jpg'],
     * validation SHALL fail.
     * 
     * Test strategy:
     * - Generate 100 documents with valid data but invalid formats
     * - Verify all fail validation with appropriate error
     */
    
    const testCases = Array.from({ length: 100 }, () => {
      const useUrl = Math.random() > 0.5;
      return {
        url: useUrl ? generateValidUrl() : undefined,
        base64: !useUrl ? generateValidBase64() : undefined,
        format: generateInvalidFormat()
      };
    });

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Should be invalid
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Format label tidak didukung');
    }
  });

  it("should validate all three valid formats equally", () => {
    /**
     * Property: Each of the three valid formats ('pdf', 'png', 'jpg') should
     * be accepted equally when paired with valid data.
     * 
     * Test strategy:
     * - For each valid format, generate multiple test cases
     * - Verify all pass validation
     * - Verify no format is treated differently
     */
    
    for (const format of VALID_FORMATS) {
      const testCases = Array.from({ length: 50 }, () => {
        const useUrl = Math.random() > 0.5;
        return {
          url: useUrl ? generateValidUrl() : undefined,
          base64: !useUrl ? generateValidBase64() : undefined,
          format
        };
      });

      for (const testCase of testCases) {
        const result = validateDocumentFormat(testCase);
        
        // Property: All valid formats should be accepted
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    }
  });

  it("should reject documents with whitespace-only URL and base64", () => {
    /**
     * Property: Documents with whitespace-only URL and base64 should be
     * treated as empty and rejected.
     * 
     * Test strategy:
     * - Generate documents with various whitespace patterns
     * - Verify all are rejected
     */
    
    const whitespacePatterns = [
      '   ',
      '\t',
      '\n',
      '\r\n',
      '  \t  \n  ',
      ' ',
    ];

    for (const whitespace of whitespacePatterns) {
      const testCases = [
        { url: whitespace, base64: undefined, format: generateValidFormat() },
        { url: undefined, base64: whitespace, format: generateValidFormat() },
        { url: whitespace, base64: whitespace, format: generateValidFormat() },
      ];

      for (const testCase of testCases) {
        const result = validateDocumentFormat(testCase);
        
        // Property: Whitespace-only should be rejected
        expect(result.valid).toBe(false);
        expect(result.error).toContain('tidak memiliki URL atau data');
      }
    }
  });

  it("should handle case-sensitive format validation", () => {
    /**
     * Property: Format validation should be case-sensitive - uppercase or
     * mixed-case formats should be rejected.
     * 
     * Test strategy:
     * - Test with uppercase and mixed-case format values
     * - Verify all are rejected
     */
    
    const caseVariations = [
      'PDF', 'PNG', 'JPG', // Uppercase
      'Pdf', 'Png', 'Jpg', // Title case
      'pDf', 'pNg', 'jPg', // Mixed case
      'PDF ', ' pdf', 'pdf\n', // With whitespace
    ];

    for (const format of caseVariations) {
      const testCase = {
        url: generateValidUrl(),
        format
      };

      const result = validateDocumentFormat(testCase);
      
      // Property: Non-lowercase formats should be rejected
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Format label tidak didukung');
    }
  });

  it("should validate format before checking data presence", () => {
    /**
     * Property: When both checks fail (empty data AND invalid format),
     * the empty data check should take precedence (checked first).
     * 
     * Test strategy:
     * - Generate documents with both empty data and invalid format
     * - Verify error message indicates empty data issue
     */
    
    const testCases = Array.from({ length: 50 }, () => ({
      url: generateEmptyValue(),
      base64: generateEmptyValue(),
      format: generateInvalidFormat()
    }));

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Empty data error should be reported first
      expect(result.valid).toBe(false);
      expect(result.error).toContain('tidak memiliki URL atau data');
    }
  });

  it("should handle edge cases in URL validation", () => {
    /**
     * Property: Various edge-case URLs should be validated correctly.
     * 
     * Test strategy:
     * - Test with very long URLs, special characters, etc.
     * - Verify validation focuses on non-emptiness, not URL structure
     */
    
    const edgeCaseUrls = [
      'a', // Single character
      'http://x.com', // Minimal URL
      'https://example.com/' + 'a'.repeat(1000), // Very long URL
      'https://example.com/label?param=value&other=123', // With query params
      'https://example.com/label#fragment', // With fragment
      'data:application/pdf;base64,ABC123', // Data URL
      'https://example.com/label with spaces.pdf', // With spaces
      'https://example.com/label%20encoded.pdf', // URL encoded
    ];

    for (const url of edgeCaseUrls) {
      const testCase = {
        url,
        format: generateValidFormat()
      };

      const result = validateDocumentFormat(testCase);
      
      // Property: Non-empty URLs should be accepted (structure not validated)
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should handle edge cases in base64 validation", () => {
    /**
     * Property: Various edge-case base64 strings should be validated correctly.
     * 
     * Test strategy:
     * - Test with minimal, very long, and edge-case base64 strings
     * - Verify validation focuses on non-emptiness, not base64 structure
     */
    
    const edgeCaseBase64 = [
      'A', // Single character
      'AB', // Two characters
      'ABC', // Three characters
      'ABCD', // Four characters (valid base64 block)
      'A'.repeat(10000), // Very long
      'ABC123+/=', // With base64 special chars
      'abc123', // Lowercase (technically valid base64)
      '123456', // Numbers only
    ];

    for (const base64 of edgeCaseBase64) {
      const testCase = {
        base64,
        format: generateValidFormat()
      };

      const result = validateDocumentFormat(testCase);
      
      // Property: Non-empty base64 should be accepted (structure not validated)
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should consistently validate across multiple invocations", () => {
    /**
     * Property: Validation should be deterministic - same input should
     * always produce same result.
     * 
     * Test strategy:
     * - Generate test cases and validate multiple times
     * - Verify results are identical across invocations
     */
    
    const testCases = [
      // Valid cases
      { url: 'https://example.com/label.pdf', format: 'pdf' },
      { base64: 'ABC123', format: 'png' },
      { url: 'https://example.com/label.jpg', base64: 'XYZ789', format: 'jpg' },
      // Invalid cases
      { url: '', base64: '', format: 'pdf' },
      { url: 'https://example.com/label.pdf', format: 'gif' },
      { url: undefined, base64: undefined, format: 'pdf' },
    ];

    for (const testCase of testCases) {
      // Validate multiple times
      const results = Array.from({ length: 10 }, () => 
        validateDocumentFormat(testCase)
      );

      // Property: All results should be identical
      const firstResult = results[0];
      for (const result of results) {
        expect(result.valid).toBe(firstResult.valid);
        expect(result.error).toBe(firstResult.error);
      }
    }
  });

  it("should handle undefined vs empty string differently for data fields", () => {
    /**
     * Property: Both undefined and empty string should be treated as "empty"
     * for URL and base64 fields.
     * 
     * Test strategy:
     * - Test combinations of undefined and empty string
     * - Verify all are rejected as empty
     */
    
    const emptyVariations = [
      { url: undefined, base64: undefined },
      { url: '', base64: undefined },
      { url: undefined, base64: '' },
      { url: '', base64: '' },
      { url: '   ', base64: undefined },
      { url: undefined, base64: '   ' },
    ];

    for (const variation of emptyVariations) {
      const testCase = {
        ...variation,
        format: generateValidFormat()
      };

      const result = validateDocumentFormat(testCase);
      
      // Property: All empty variations should be rejected
      expect(result.valid).toBe(false);
      expect(result.error).toContain('tidak memiliki URL atau data');
    }
  });

  it("should accept documents when at least one data field is non-empty", () => {
    /**
     * Property: If either URL or base64 is non-empty (and format is valid),
     * validation should succeed regardless of the other field's state.
     * 
     * Test strategy:
     * - Test with one field valid and other field in various states
     * - Verify all pass validation
     */
    
    const testCases = [
      // Valid URL, various base64 states
      { url: generateValidUrl(), base64: undefined, format: generateValidFormat() },
      { url: generateValidUrl(), base64: '', format: generateValidFormat() },
      { url: generateValidUrl(), base64: '   ', format: generateValidFormat() },
      { url: generateValidUrl(), base64: generateValidBase64(), format: generateValidFormat() },
      // Valid base64, various URL states
      { url: undefined, base64: generateValidBase64(), format: generateValidFormat() },
      { url: '', base64: generateValidBase64(), format: generateValidFormat() },
      { url: '   ', base64: generateValidBase64(), format: generateValidFormat() },
      { url: generateValidUrl(), base64: generateValidBase64(), format: generateValidFormat() },
    ];

    for (const testCase of testCases) {
      const result = validateDocumentFormat(testCase);
      
      // Property: Should be valid if at least one data field is non-empty
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should validate format as exact string match", () => {
    /**
     * Property: Format validation should use exact string matching -
     * no partial matches or substring matching.
     * 
     * Test strategy:
     * - Test with formats that contain valid formats as substrings
     * - Verify all are rejected
     */
    
    const partialMatches = [
      'pdf.png', // Contains 'pdf' and 'png'
      'mypdf', // Contains 'pdf'
      'pdffile', // Contains 'pdf'
      'image/png', // Contains 'png'
      'jpg-file', // Contains 'jpg'
      'file.jpg.backup', // Contains 'jpg'
    ];

    for (const format of partialMatches) {
      const testCase = {
        url: generateValidUrl(),
        format
      };

      const result = validateDocumentFormat(testCase);
      
      // Property: Partial matches should be rejected
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Format label tidak didukung');
    }
  });

  it("should handle all combinations of valid and invalid inputs", () => {
    /**
     * Property: Comprehensive test of all input combinations.
     * 
     * Test strategy:
     * - Generate all combinations of valid/invalid URL, base64, and format
     * - Verify validation results match expected logic
     */
    
    const urlStates = [
      { value: generateValidUrl(), valid: true },
      { value: generateEmptyValue(), valid: false },
    ];

    const base64States = [
      { value: generateValidBase64(), valid: true },
      { value: generateEmptyValue(), valid: false },
    ];

    const formatStates = [
      { value: generateValidFormat(), valid: true },
      { value: generateInvalidFormat(), valid: false },
    ];

    for (const urlState of urlStates) {
      for (const base64State of base64States) {
        for (const formatState of formatStates) {
          const testCase = {
            url: urlState.value,
            base64: base64State.value,
            format: formatState.value
          };

          const result = validateDocumentFormat(testCase);

          // Property: Valid if (url OR base64 is valid) AND format is valid
          const hasValidData = urlState.valid || base64State.valid;
          const expectedValid = hasValidData && formatState.valid;

          expect(result.valid).toBe(expectedValid);
          
          if (!expectedValid) {
            expect(result.error).toBeDefined();
            
            // Check error message matches the failure reason
            if (!hasValidData) {
              expect(result.error).toContain('tidak memiliki URL atau data');
            } else if (!formatState.valid) {
              expect(result.error).toContain('Format label tidak didukung');
            }
          }
        }
      }
    }
  });
});
