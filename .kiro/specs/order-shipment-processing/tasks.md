# Implementation Plan: Order Shipment Processing

## Overview

This implementation plan converts the feature design into actionable coding tasks for implementing order shipment processing functionality. The feature enables warehouse operators to arrange shipments for orders in "READY_TO_SHIP" status through the Shopee Open Platform API, with support for both single and batch processing.

## Tasks

- [x] 1. Set up core backend infrastructure
  - [x] 1.1 Create shipment service with core business logic
    - Create `apps/api/src/services/shipment.service.ts` with `ShipmentResult` interface
    - Implement `validateOrderEligibility()` function to check order status and existence
    - Implement `shipSingleOrder()` function with error handling and database updates
    - Implement `shipBatchOrders()` function with sequential processing and rate limiting
    - _Requirements: 2.1, 2.2, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2_

  - [x] 1.2 Write property tests for shipment service
    - **Property 1: Order status consistency**
    - **Validates: Requirements 2.2, 7.1**

  - [x] 1.3 Create rate limiter utility for API throttling
    - Create `apps/api/src/utils/rate-limiter.ts` with `RateLimiter` class
    - Implement `executeWithRetry()` method with exponential backoff
    - Implement `batchDelay()` method for sequential processing delays
    - Add retry logic for `error_too_frequent` responses with 2000ms delays
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 9.1, 9.2_

  - [x] 1.4 Write unit tests for rate limiter
    - Test retry logic on rate limit errors
    - Test batch delay functionality
    - Test maximum retry limits
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Implement Shopee API integration
  - [x] 2.1 Extend Shopee API client with shipment endpoint
    - Add `shipShopeeOrder()` function to `apps/api/src/services/shopee-raw.ts`
    - Implement POST request to `/api/v2/logistics/ship_order` endpoint
    - Add proper request signing with HMAC-SHA256
    - Handle authentication, rate limiting, and network error responses
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.5, 9.1, 9.4_

  - [x] 2.2 Integrate credential management with shipment service
    - Use existing `getValidToken()` from `shopee-auth.ts` for authentication
    - Implement automatic token refresh on authentication errors
    - Add shop-specific credential retrieval for multi-shop support
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 10.1, 10.2, 10.3_

  - [x] 2.3 Write integration tests for Shopee API calls
    - Test successful shipment arrangement
    - Test authentication error handling and token refresh
    - Test rate limiting and retry logic
    - _Requirements: 3.1, 3.2, 4.1, 4.2_

- [x] 3. Create API routes for shipment operations
  - [x] 3.1 Add shipment endpoints to order routes
    - Extend `apps/api/src/modules/order/order.route.ts` with new endpoints
    - Add `POST /api/orders/ship/:orderSn` for single order processing
    - Add `POST /api/orders/ship/batch` for batch processing with request validation
    - Implement proper error handling and response formatting
    - _Requirements: 2.1, 2.2, 5.1, 5.2, 8.1, 8.2_

  - [x] 3.2 Add request validation and error handling
    - Validate order_sn format using regex patterns
    - Implement batch size limits (max 50 orders)
    - Add comprehensive error responses for different failure scenarios
    - _Requirements: 6.1, 6.2, 6.3, 8.1, 8.2, 8.3_

  - [x] 3.3 Write API route tests
    - Test successful single order shipment endpoint
    - Test batch shipment endpoint with various scenarios
    - Test validation error responses
    - Test error handling for service failures
    - _Requirements: 2.1, 2.2, 5.1, 5.2_

- [x] 4. Checkpoint - Backend core functionality complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement frontend UI components
  - [x] 5.1 Add shipment action button to order list
    - Extend `apps/web/src/pages/PesananSaya.tsx` with "Atur Pengiriman" button
    - Show button only for orders with `orderStatus === 'READY_TO_SHIP'`
    - Add loading state with spinner during processing
    - Implement `handleShipOrder()` function for single order processing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3_

  - [x] 5.2 Implement batch selection and processing UI
    - Add checkboxes for each READY_TO_SHIP order
    - Create batch action button showing selected count
    - Implement `toggleOrderSelection()` and selection management functions
    - Add `handleBatchShip()` function for batch processing
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.3 Create progress indicator for batch operations
    - Add progress bar component showing completed/total counts
    - Implement real-time progress updates during batch processing
    - Display progress state in UI during batch operations
    - _Requirements: 5.4, 8.3_

  - [x] 5.4 Write component tests for shipment UI
    - Test button visibility based on order status
    - Test batch selection functionality
    - Test progress indicator updates
    - _Requirements: 1.1, 1.2, 5.1, 5.2_

- [x] 6. Implement user feedback and notifications
  - [x] 6.1 Add toast notification system for shipment results
    - Implement success toast for completed shipments with order_sn
    - Implement error toast for failed shipments with specific error messages
    - Add auto-dismiss for success notifications (3000ms)
    - Keep error notifications visible until manually dismissed
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [x] 6.2 Add batch processing summary notifications
    - Display real-time progress notifications during batch processing
    - Show final summary with successful and failed counts
    - Allow viewing detailed results for failed orders
    - _Requirements: 5.5, 8.3, 8.4_

  - [x] 6.3 Implement automatic order list refresh
    - Refetch order list after successful single order processing
    - Refetch order list once after batch processing completes
    - Maintain current filter and search state during refresh
    - Handle refresh failures with error notifications
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

- [x] 7. Extend API client for frontend integration
  - [x] 7.1 Add shipment methods to API client
    - Extend `apps/web/src/lib/api.ts` with `orderShip()` method
    - Add `orderShipBatch()` method for batch processing
    - Implement proper error handling and response parsing
    - _Requirements: 2.1, 5.1, 5.2_

  - [x] 7.2 Integrate API calls with UI components
    - Connect shipment buttons to API client methods
    - Handle loading states and error responses
    - Implement proper error message display
    - _Requirements: 2.3, 2.4, 8.1, 8.2_

- [x] 8. Checkpoint - Frontend integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Add comprehensive logging and monitoring
  - [x] 9.1 Implement structured logging for shipment operations
    - Add logging for shipment initiation with order_sn and shop_id
    - Log API responses with status and error messages
    - Log database updates with order_sn and new status
    - Log rate limit occurrences with attempt numbers and delays
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 9.2 Add error logging with proper severity levels
    - Implement error categorization (auth, rate_limit, network, validation, business, database)
    - Add structured error logging with timestamps and context
    - Ensure no sensitive data (tokens) are logged
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

- [x] 10. Implement advanced error handling scenarios
  - [x] 10.1 Add network timeout and retry logic
    - Implement 5000ms timeout for Shopee API requests
    - Add retry logic for network errors with 300ms delays
    - Handle 5xx server errors with retry attempts
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 10.2 Add database error handling for inconsistent states
    - Handle database update failures after successful API calls
    - Return warning messages for database inconsistencies
    - Log database errors with full context
    - _Requirements: 7.4, 7.5_

  - [x] 10.3 Implement multi-shop credential validation
    - Validate shop credentials exist before processing orders
    - Handle missing credentials with appropriate error messages
    - Ensure correct shop_id is used in API requests
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 11. Add security and validation enhancements
  - [x] 11.1 Implement input validation and sanitization
    - Add order_sn format validation with regex patterns
    - Implement batch size limits to prevent abuse
    - Validate request parameters and sanitize inputs
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.2 Add request signing and authentication security
    - Ensure proper HMAC-SHA256 signature generation
    - Add timestamp validation to prevent replay attacks
    - Secure token handling without exposure in logs
    - _Requirements: 3.5_

- [x] 12. Final integration and testing
  - [x] 12.1 Perform end-to-end integration testing
    - Test complete single order shipment flow
    - Test batch processing with mixed success/failure scenarios
    - Test multi-shop operations with different credentials
    - Verify error handling across all failure modes
    - _Requirements: All requirements_

  - [x] 12.2 Write comprehensive integration tests
    - Test database integration with order status updates
    - Test Shopee API integration with authentication
    - Test rate limiting behavior under load
    - _Requirements: 2.2, 3.1, 4.1, 7.1_

  - [x] 12.3 Verify UI/UX functionality and responsiveness
    - Test button states and loading indicators
    - Verify toast notifications display correctly
    - Test batch selection and progress indicators
    - Ensure order list refresh works properly
    - _Requirements: 1.1, 1.3, 1.4, 5.4, 8.1, 8.3, 11.1_

- [x] 13. Final checkpoint - Complete feature validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Implementation uses TypeScript throughout the stack
- Checkpoints ensure incremental validation and user feedback
- Property tests validate universal correctness properties from the design
- Unit and integration tests provide comprehensive coverage
- The implementation follows the existing codebase patterns and architecture
- No database migrations are required - uses existing schema
- Rate limiting and error handling are built into the core service layer
- Multi-shop support leverages existing credential management system