# Implementation Plan: Shipping Label Printing

## Overview

This implementation plan breaks down the Shipping Label Printing feature into actionable coding tasks. The feature enables sellers to print shipping labels for Shopee orders after shipment arrangement, supporting both single and batch printing operations.

**Implementation Approach:**
1. **Backend Foundation**: Build API routes, services, and Shopee API integration
2. **Caching Layer**: Implement in-memory cache for label documents
3. **Frontend UI**: Add print buttons, batch selection, and progress tracking
4. **Integration**: Connect frontend to backend APIs
5. **Testing**: Add unit tests, integration tests, and property-based tests

**Technology Stack:**
- Backend: TypeScript, Bun, Elysia
- Frontend: TypeScript, React, Vite
- Database: MySQL with Drizzle ORM
- External API: Shopee Logistics API

## Tasks

- [x] 1. Set up backend label service infrastructure
  - Create label service module with core interfaces
  - Create label cache service with TTL management
  - Create Shopee label API client for logistics endpoints
  - Set up error types and logging utilities
  - _Requirements: 6.1, 6.2, 11.1, 11.2, 13.1_

- [x] 1.1 Write property test for cache TTL enforcement
  - **Property 7: Cache TTL Enforcement**
  - **Validates: Requirements 13.1, 13.2**

- [x] 1.2 Write property test for cache key consistency
  - **Property 6: Cache Key Consistency**
  - **Validates: Requirements 13.3**

- [x] 2. Implement label eligibility validation
  - [x] 2.1 Create validateLabelEligibility function in label service
    - Check order exists in database
    - Validate order status is PROCESSED
    - Validate tracking number is present
    - Return validation result with order data or error
    - _Requirements: 2.2, 11.6_

  - [x] 2.2 Write property test for order validation consistency
    - **Property 1: Order Validation Consistency**
    - **Validates: Requirements 2.2, 3.2, 11.6**

  - [x] 2.3 Write unit tests for validation edge cases
    - Test order not found scenario
    - Test order with wrong status
    - Test order without tracking number
    - Test database query errors
    - _Requirements: 2.2, 2.5_

- [x] 3. Implement Shopee label API integration
  - [x] 3.1 Create getShippingDocumentParameter function
    - Call Shopee API endpoint with order_sn and shop_id
    - Handle authentication using existing shopee-auth service
    - Implement retry logic for rate limits (max 3 retries, 2s delay)
    - Handle timeout (10s limit)
    - _Requirements: 6.1, 6.4, 6.5, 6.6_

  - [x] 3.2 Create getShippingDocumentResult function
    - Call Shopee API endpoint to retrieve label document
    - Parse response for URL or base64 data
    - Detect document format (PDF, PNG, JPG)
    - Handle authentication and retry logic
    - _Requirements: 6.2, 7.1, 7.2, 7.3_

  - [x] 3.3 Write property test for API parameter validity
    - **Property 17: API Parameter Validity**
    - **Validates: Requirements 6.3**

  - [x] 3.4 Write unit tests for Shopee API error handling
    - Test authentication errors
    - Test rate limit errors
    - Test timeout errors
    - Test invalid response formats
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 4. Implement label cache service
  - [x] 4.1 Create LabelCache class with Map-based storage
    - Implement get method with expiration check
    - Implement set method with 24-hour TTL
    - Implement delete method for cache invalidation
    - Implement cleanup method for expired entries
    - Implement clear method for testing
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 4.2 Write property test for cache invalidation on status change
    - **Property 8: Cache Invalidation on Status Change**
    - **Validates: Requirements 13.4**

  - [x] 4.3 Write unit tests for cache operations
    - Test cache hit and miss scenarios
    - Test TTL expiration
    - Test cleanup of expired entries
    - Test concurrent access
    - _Requirements: 13.1, 13.2_

- [x] 5. Checkpoint - Ensure backend foundation tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement single label retrieval service
  - [x] 6.1 Create getSingleLabel function in label service
    - Validate order eligibility
    - Check cache for existing label
    - If cache miss, call Shopee API to retrieve label
    - Store label in cache
    - Return LabelResult with success/error
    - Add structured logging for all operations
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.7, 12.1, 12.2_

  - [x] 6.2 Write property test for document format validation
    - **Property 16: Document Format Validation**
    - **Validates: Requirements 7.4**

  - [x] 6.3 Write unit tests for single label retrieval
    - Test successful retrieval with cache miss
    - Test successful retrieval with cache hit
    - Test validation failures
    - Test Shopee API errors
    - Test logging output
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 7. Implement batch label retrieval service
  - [x] 7.1 Create getBatchLabels function in label service
    - Validate all orders for eligibility
    - Process up to 5 orders concurrently using Promise.all
    - Apply rate limiting (10 req/sec, 300ms delay between batches)
    - Continue processing on individual failures
    - Return array of LabelResult for each order
    - Add batch summary logging
    - _Requirements: 3.2, 3.3, 3.6, 13.5, 13.6, 12.3_

  - [x] 7.2 Write property test for batch size limit enforcement
    - **Property 2: Batch Size Limit Enforcement**
    - **Validates: Requirements 3.7, 11.4**

  - [x] 7.3 Write property test for batch summary accuracy
    - **Property 3: Batch Summary Accuracy**
    - **Validates: Requirements 3.5, 5.4, 10.4**

  - [x] 7.4 Write property test for concurrent request limit
    - **Property 9: Concurrent Request Limit**
    - **Validates: Requirements 13.5**

  - [x] 7.5 Write property test for rate limiting compliance
    - **Property 10: Rate Limiting Compliance**
    - **Validates: Requirements 13.6**

  - [x] 7.6 Write unit tests for batch processing
    - Test batch with all successful retrievals
    - Test batch with partial failures
    - Test batch with all failures
    - Test concurrent processing behavior
    - Test rate limiting delays
    - _Requirements: 3.2, 3.3, 3.5, 3.6_

- [x] 8. Implement label API routes
  - [x] 8.1 Create label.route.ts with single label endpoint
    - Create GET /orders/:orderSn/shipping-label endpoint
    - Validate orderSn parameter format
    - Call getSingleLabel service
    - Return response with label data or error
    - Set appropriate HTTP status codes (200, 404, 422, 500)
    - _Requirements: 11.1, 11.3, 11.6, 11.7_

  - [x] 8.2 Create batch label endpoint
    - Create POST /orders/shipping-labels/batch endpoint
    - Validate request body (order_sns array, max 50 items)
    - Call getBatchLabels service
    - Return response with results array
    - Set appropriate HTTP status codes
    - _Requirements: 11.2, 11.4, 11.5, 11.8_

  - [x] 8.3 Write property test for API response schema compliance
    - **Property 5: API Response Schema Compliance**
    - **Validates: Requirements 11.3, 11.5**

  - [x] 8.4 Write property test for failure reporting completeness
    - **Property 4: Failure Reporting Completeness**
    - **Validates: Requirements 5.5, 10.4**

  - [x] 8.5 Write integration tests for label routes
    - Test single label endpoint with valid order
    - Test single label endpoint with invalid order
    - Test batch endpoint with valid orders
    - Test batch endpoint with size limit
    - Test error response formats
    - _Requirements: 11.1, 11.2, 11.6, 11.7, 11.8_

- [x] 9. Integrate label routes into main API
  - Mount label routes in main API app
  - Update CORS configuration if needed
  - Test endpoints with Postman or curl
  - _Requirements: 11.1, 11.2_

- [x] 10. Checkpoint - Ensure backend API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement logging infrastructure
  - [x] 11.1 Create structured logging utility for label service
    - Create log formatting function for JSON output
    - Add timestamp and context fields
    - Create log level helpers (info, error, warn)
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 11.2 Write property test for logging completeness
    - **Property 11: Logging Completeness**
    - **Validates: Requirements 6.7, 12.1, 12.2**

  - [x] 11.3 Write property test for batch logging summary
    - **Property 12: Batch Logging Summary**
    - **Validates: Requirements 12.3**

  - [x] 11.4 Write property test for log format validity
    - **Property 13: Log Format Validity**
    - **Validates: Requirements 12.4**

  - [x] 11.2 Integrate logging into label service
    - Add logging to getSingleLabel function
    - Add logging to getBatchLabels function
    - Add logging to Shopee API client functions
    - Add performance timing logs
    - _Requirements: 6.7, 12.1, 12.2, 12.3, 12.6_

- [x] 12. Implement frontend API client extensions
  - [x] 12.1 Add orderLabel method to api.ts
    - Create GET request to /orders/:orderSn/shipping-label
    - Define TypeScript response type
    - Handle errors and return typed response
    - _Requirements: 11.1, 11.3_

  - [x] 12.2 Add orderLabelsBatch method to api.ts
    - Create POST request to /orders/shipping-labels/batch
    - Define TypeScript request and response types
    - Handle errors and return typed response
    - _Requirements: 11.2, 11.5_

  - [x] 12.3 Write unit tests for API client methods
    - Test successful API calls
    - Test error handling
    - Test request/response type safety
    - _Requirements: 11.1, 11.2_

- [x] 13. Implement print label button component
  - [x] 13.1 Create PrintLabelButton component
    - Add button with printer icon
    - Show loading indicator during label retrieval
    - Call orderLabel API method on click
    - Open print dialog with label document
    - Handle different label formats (PDF, PNG, JPG)
    - Show error toast on failure
    - Disable button during processing
    - _Requirements: 2.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 13.2 Integrate PrintLabelButton into OrderCard component
    - Add button next to shipping carrier info
    - Show button only for PROCESSED orders
    - Pass orderSn prop to button
    - Wire up callbacks for print events
    - _Requirements: 8.1, 8.2_

  - [x] 13.3 Write unit tests for PrintLabelButton
    - Test button rendering for PROCESSED orders
    - Test button disabled state
    - Test loading indicator
    - Test error handling
    - Test print dialog opening
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 14. Implement batch print selection UI
  - [x] 14.1 Add checkbox to OrderCard for PROCESSED orders
    - Show checkbox only when order status is PROCESSED
    - Wire checkbox to selection state
    - Disable checkbox during batch processing
    - _Requirements: 9.1, 9.6_

  - [x] 14.2 Create batch action bar component
    - Show action bar when orders are selected
    - Display count of selected orders
    - Add "Cetak Label Batch" button
    - Add "Batal" button to clear selection
    - Add "Pilih Semua" button
    - Hide action bar when no selection
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 14.3 Write property test for selection count accuracy
    - **Property 14: Selection Count Accuracy**
    - **Validates: Requirements 9.3**

  - [x] 14.4 Write property test for select-all completeness
    - **Property 15: Select-All Completeness**
    - **Validates: Requirements 9.5**

  - [x] 14.5 Write unit tests for batch selection UI
    - Test checkbox rendering and interaction
    - Test action bar visibility
    - Test selection count display
    - Test select all functionality
    - Test clear selection
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 15. Implement batch print progress modal
  - [x] 15.1 Enhance BatchProgress component for label printing
    - Reuse existing BatchProgress component
    - Add support for label printing status items
    - Show progress bar for batch operation
    - Display individual order status (pending, processing, success, error)
    - Show error messages for failed orders
    - Add dismiss button when batch completes
    - _Requirements: 3.6, 5.6_

  - [x] 15.2 Create batch print handler in PesananSaya
    - Create handleBatchPrintLabels function
    - Process orders one by one with progress updates
    - Update BatchProgress items as each order completes
    - Show summary toast when batch completes
    - Handle partial failures gracefully
    - Refetch order list after completion
    - _Requirements: 3.3, 3.4, 3.5, 5.4, 5.5_

  - [x] 15.3 Write unit tests for batch print progress
    - Test progress updates during batch
    - Test summary display
    - Test error handling for partial failures
    - Test dismiss functionality
    - _Requirements: 3.6, 5.4, 5.5, 5.6_

- [x] 16. Checkpoint - Ensure frontend UI tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement post-shipment print dialog
  - [x] 17.1 Create PostShipmentDialog component
    - Create modal dialog with print option
    - Add "Cetak Label Sekarang" button
    - Add "Lewati" button
    - Show loading indicator while waiting for status change
    - _Requirements: 4.1, 4.4, 4.5_

  - [x] 17.2 Integrate dialog into shipment flow
    - Show dialog after successful single shipment arrangement
    - Wait for order status to change to PROCESSED
    - Trigger label printing if user selects print option
    - Close dialog and show success toast if user skips
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 17.3 Write unit tests for post-shipment dialog
    - Test dialog rendering
    - Test print option selection
    - Test skip option
    - Test loading state
    - _Requirements: 4.1, 4.4, 4.5_

- [x] 18. Implement batch shipment with label printing
  - [x] 18.1 Add print option to batch shipment modal
    - Add checkbox "Cetak Label Setelah Selesai" to shipment method modal
    - Store print preference in state
    - _Requirements: 5.1_

  - [x] 18.2 Integrate label printing into batch shipment flow
    - After batch shipment completes, check print preference
    - If enabled, automatically start batch label printing
    - Show combined progress for shipment + printing
    - Display final summary with both operations
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 18.3 Write integration tests for batch shipment with printing
    - Test batch shipment with print enabled
    - Test batch shipment with print disabled
    - Test partial failures in both operations
    - Test progress tracking
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 19. Implement print dialog functionality
  - [x] 19.1 Create openPrintDialog utility function
    - Handle PDF format: open in new tab with print dialog
    - Handle image formats: create image element and print
    - Handle data URLs and external URLs
    - Add error handling for unsupported formats
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x] 19.2 Integrate print dialog into print buttons
    - Call openPrintDialog from PrintLabelButton
    - Call openPrintDialog from batch print handler
    - Handle print dialog errors gracefully
    - _Requirements: 2.3, 2.4, 3.4_

  - [x] 19.3 Write unit tests for print dialog utility
    - Test PDF handling
    - Test image handling
    - Test data URL handling
    - Test error handling
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 20. Implement error handling and user feedback
  - [x] 20.1 Create error message mapping utility
    - Map error types to user-friendly Indonesian messages
    - Handle network errors
    - Handle authentication errors
    - Handle label not available errors
    - Handle validation errors
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 20.2 Add error toast notifications
    - Show toast for single label print errors
    - Show toast for batch print errors
    - Show toast for successful operations
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 20.3 Create batch error summary modal
    - Display list of failed orders with error messages
    - Add "Coba Lagi" button for failed orders
    - Show success/failure counts
    - _Requirements: 10.4, 10.5_

  - [x] 20.4 Write unit tests for error handling
    - Test error message mapping
    - Test toast notifications
    - Test error summary modal
    - Test retry functionality
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 21. Implement mobile responsiveness
  - [x] 21.1 Add responsive styles to PrintLabelButton
    - Adjust button size for touch interfaces
    - Ensure adequate touch target size (44x44px minimum)
    - Test on mobile viewport
    - _Requirements: 14.1_

  - [x] 21.2 Make batch action bar responsive
    - Stack buttons vertically on small screens
    - Prevent overlap with content
    - Ensure scrollability
    - _Requirements: 14.2_

  - [x] 21.3 Optimize print dialog for mobile
    - Show option to open in external app
    - Add option to save as file
    - Test on mobile browsers
    - _Requirements: 14.3_

  - [x] 21.4 Make progress modal responsive
    - Ensure modal is scrollable on mobile
    - Adjust font sizes for readability
    - Test on various screen sizes
    - _Requirements: 14.4, 14.5_

- [x] 22. Implement accessibility features
  - [x] 22.1 Add ARIA labels to print buttons
    - Add aria-label "Cetak Label Pengiriman" to PrintLabelButton
    - Add aria-label to batch print button
    - Add aria-label to checkboxes
    - _Requirements: 15.2_

  - [x] 22.2 Add ARIA live regions for loading states
    - Add aria-live region to loading indicators
    - Announce progress updates to screen readers
    - Announce success/error messages
    - _Requirements: 15.3_

  - [x] 22.3 Ensure keyboard navigation
    - Test tab navigation through all interactive elements
    - Add keyboard shortcuts for common actions
    - Ensure focus indicators are visible
    - _Requirements: 15.2_

  - [x] 22.4 Write accessibility tests
    - Test ARIA labels presence
    - Test keyboard navigation
    - Test screen reader announcements
    - _Requirements: 15.2, 15.3_

- [x] 23. Implement date format consistency
  - [x] 23.1 Write property test for date format consistency
    - **Property 18: Date Format Consistency**
    - **Validates: Requirements 15.5**

  - [x] 23.2 Ensure Indonesian date format in UI
    - Verify all date displays use dd MMM yyyy, HH:mm format
    - Use date-fns with Indonesian locale
    - _Requirements: 15.5_

  - [x] 23.3 Ensure ISO 8601 format in logs
    - Verify all log timestamps use ISO 8601 format
    - Use Date.toISOString() for log timestamps
    - _Requirements: 15.5_

- [x] 24. Final integration and testing
  - [x] 24.1 Test complete single label printing flow
    - Test from PROCESSED order card
    - Test from post-shipment dialog
    - Test with different label formats
    - Test error scenarios
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 24.2 Test complete batch label printing flow
    - Test batch selection and printing
    - Test batch with partial failures
    - Test progress tracking
    - Test summary display
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 24.3 Test batch shipment with label printing
    - Test combined shipment + printing flow
    - Test with print option enabled/disabled
    - Test partial failures in both operations
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 24.4 Test cache behavior
    - Test cache hit on repeated requests
    - Test cache expiration after 24 hours
    - Test cache invalidation on status change
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 24.5 Test error handling across all scenarios
    - Test network errors
    - Test authentication errors
    - Test validation errors
    - Test Shopee API errors
    - Verify user-friendly error messages
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 24.6 Run all property-based tests
    - Execute all property tests with multiple iterations
    - Verify no counterexamples found
    - Document any edge cases discovered

  - [x] 24.7 Run full integration test suite
    - Test backend API endpoints
    - Test frontend-backend integration
    - Test Shopee API integration
    - Verify logging output

- [x] 25. Final checkpoint - Complete feature verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end flows
- The implementation follows the existing codebase patterns (Elysia routes, React components, TypeScript)
- All code should follow the existing project structure and conventions
- Use existing utilities and services where possible (shopee-auth, toast, api client)
- Maintain consistency with existing UI components and styling
