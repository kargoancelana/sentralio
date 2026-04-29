# Implementation Plan: Tracking Number Generation Fix

## Overview

This bugfix addresses the issue where tracking numbers are not being retrieved after shipment arrangement, causing label printing to fail. The fix ensures that the system waits for the tracking number to be available from Shopee API before marking orders as PROCESSED.

**Bug Summary:**
- **Current Behavior**: System arranges shipment but doesn't wait for tracking number, causing label printing to fail
- **Expected Behavior**: System waits for tracking number (with polling/retry) before marking order as PROCESSED
- **Impact**: Users cannot print shipping labels immediately after arranging shipment

**Implementation Approach:**
1. **Explore** - Write tests BEFORE fix to understand the bug (Bug Condition)
2. **Preserve** - Write tests for non-buggy behavior (Preservation Requirements)
3. **Implement** - Apply the fix with understanding (Expected Behavior)
4. **Validate** - Verify fix works and doesn't break anything

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Tracking Number Not Retrieved After Shipment
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test that after calling `shipSingleOrder()` with a READY_TO_SHIP order, the system attempts to retrieve tracking number from Shopee API before updating order status to PROCESSED
  - The test assertions should verify:
    - `shipSingleOrder()` is called with valid orderSn and shipmentMethod
    - Shopee API `ship_order` endpoint is called successfully
    - System attempts to retrieve tracking number (via polling or direct API call)
    - Order status is NOT updated to PROCESSED if tracking number is not available
    - Tracking number is stored in database `shippingCarrier` field when available
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause (e.g., "Order status changed to PROCESSED without tracking number being retrieved")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Shipment Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where tracking number is already available or not needed)
  - Write property-based tests capturing observed behavior patterns:
    - Orders that already have tracking numbers should continue to be processed without delay
    - Label printing for PROCESSED orders with tracking numbers should work without changes
    - Error handling for auth errors, rate limits, and network errors should remain unchanged
    - Batch shipment without "print after shipment" option should continue to work as before
    - Cache behavior for labels should remain unchanged
    - Shipment cancellation should continue to work as before
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Fix for tracking number generation bug

  - [x] 3.1 Implement tracking number retrieval with polling
    - Add function `waitForTrackingNumber()` in `shipment.service.ts` to poll Shopee API for tracking number
    - Implement polling logic: retry up to 15 times with 2-second intervals (30 second total timeout)
    - Call Shopee API endpoint to get order details and extract tracking number from response
    - Return tracking number when available, or throw timeout error after 30 seconds
    - _Bug_Condition: isBugCondition(order) where order.status = READY_TO_SHIP AND tracking_number is null after shipment arrangement_
    - _Expected_Behavior: System SHALL wait for tracking number (polling with 15 retries, 2s interval) before updating status to PROCESSED_
    - _Preservation: Orders with existing tracking numbers processed without delay; error handling unchanged; batch operations without print option unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Update shipSingleOrder to wait for tracking number
    - After successful `shipShopeeOrder()` call, call `waitForTrackingNumber()` to retrieve tracking number
    - Store tracking number in database `shippingCarrier` field before updating status
    - Only update order status to PROCESSED after tracking number is successfully retrieved
    - Handle timeout error with clear message: "Tracking number belum tersedia setelah 30 detik. Silakan coba lagi nanti"
    - Do not update order status if tracking number retrieval fails
    - _Bug_Condition: isBugCondition(order) where order.status = READY_TO_SHIP AND tracking_number is null after shipment arrangement_
    - _Expected_Behavior: Order status updated to PROCESSED only after tracking number is stored in database_
    - _Preservation: Orders with existing tracking numbers processed without delay; error handling unchanged_
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 3.3 Update batch shipment to ensure tracking numbers
    - Ensure `shipBatchOrders()` waits for tracking number for each order before proceeding
    - For batch operations with "print after shipment" option, verify all orders have tracking numbers before starting label printing
    - Handle partial failures gracefully (some orders get tracking numbers, others timeout)
    - _Bug_Condition: isBugCondition(order) where order.status = READY_TO_SHIP AND tracking_number is null after shipment arrangement_
    - _Expected_Behavior: Batch operations ensure tracking numbers available before label printing_
    - _Preservation: Batch operations without print option unchanged; rate limiting unchanged_
    - _Requirements: 2.5_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Tracking Number Retrieved Before Status Update
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: Expected Behavior Properties from bugfix.md (2.1, 2.2, 2.3)_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Shipment Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- This bugfix follows the exploratory bugfix workflow: Explore → Preserve → Implement → Validate
- The bug condition test (task 1) MUST be written and run BEFORE implementing the fix
- The preservation tests (task 2) MUST be written and run on UNFIXED code to capture baseline behavior
- Implementation tasks (3.1-3.3) reference the bug condition and expected behavior from bugfix.md
- Verification tasks (3.4-3.5) re-run the SAME tests from tasks 1 and 2 to confirm the fix works
- The fix involves adding polling logic to wait for tracking number availability
- Timeout is set to 30 seconds (15 retries × 2 seconds) to balance user experience and API reliability
- Error messages should be clear and actionable for users
- Existing error handling and rate limiting should remain unchanged
