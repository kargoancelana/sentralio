# Requirements Document

## Introduction

This document specifies the requirements for adding order shipment processing functionality to the WMS (Warehouse Management System) integrated with Shopee marketplace. The feature enables users to process orders that are in "READY_TO_SHIP" status by arranging shipment through the Shopee Open Platform API, which updates the order status to "PROCESSED" both in Shopee and the local database.

## Glossary

- **WMS**: Warehouse Management System - the application managing inventory and orders
- **Shopee_API**: Shopee Open Platform API - external service for marketplace operations
- **Order_Processor**: Backend service component responsible for processing shipment arrangements
- **UI_Component**: Frontend React component displaying and managing orders
- **Database**: MySQL database storing order and credential information
- **Order**: A purchase transaction from Shopee marketplace with status and items
- **READY_TO_SHIP**: Order status indicating payment received and ready for shipment arrangement
- **PROCESSED**: Order status indicating shipment has been arranged and ready for pickup/delivery
- **Shipment_Arrangement**: The process of marking an order as ready for shipment via Shopee API
- **Rate_Limiter**: Component handling API request throttling and retry logic
- **Credential_Manager**: Component managing Shopee authentication tokens and shop credentials
- **Batch_Processor**: Component handling multiple order processing operations simultaneously

## Requirements

### Requirement 1: Display Shipment Action Button

**User Story:** As a warehouse operator, I want to see an "Atur Pengiriman" button for orders in READY_TO_SHIP status, so that I can identify which orders are ready to be processed.

#### Acceptance Criteria

1. WHEN an Order has orderStatus equal to "READY_TO_SHIP", THE UI_Component SHALL display an "Atur Pengiriman" button for that Order
2. WHEN an Order has orderStatus not equal to "READY_TO_SHIP", THE UI_Component SHALL NOT display an "Atur Pengiriman" button for that Order
3. THE UI_Component SHALL display the "Atur Pengiriman" button with a distinct visual style that indicates it is an actionable element
4. WHEN the UI_Component is processing a shipment arrangement, THE UI_Component SHALL display a loading indicator on the button

### Requirement 2: Process Single Order Shipment

**User Story:** As a warehouse operator, I want to click "Atur Pengiriman" to process a single order, so that the order status changes to PROCESSED and is ready for pickup.

#### Acceptance Criteria

1. WHEN a user clicks the "Atur Pengiriman" button for an Order, THE Order_Processor SHALL call the Shopee_API shipment arrangement endpoint with the order_sn
2. WHEN the Shopee_API returns a successful response, THE Order_Processor SHALL update the Order orderStatus to "PROCESSED" in the Database
3. WHEN the Shopee_API returns a successful response, THE UI_Component SHALL display a success notification to the user
4. WHEN the Shopee_API returns an error response, THE UI_Component SHALL display an error notification with the error message to the user
5. WHEN the Database update completes successfully, THE UI_Component SHALL refresh the order list to reflect the updated status
6. WHEN processing a shipment arrangement, THE Order_Processor SHALL use the Credential_Manager to retrieve valid authentication tokens for the shop

### Requirement 3: Handle Authentication and Authorization

**User Story:** As a system administrator, I want the system to use valid Shopee credentials when processing shipments, so that API calls are properly authenticated.

#### Acceptance Criteria

1. WHEN the Order_Processor initiates a shipment arrangement, THE Credential_Manager SHALL retrieve the access_token and shop_id from the shopee_credentials table
2. WHEN the Credential_Manager detects an expired access_token, THE Credential_Manager SHALL refresh the token before proceeding with the API call
3. IF the Shopee_API returns an authentication error, THEN THE Order_Processor SHALL attempt to refresh the token and retry the request once
4. IF the token refresh fails, THEN THE Order_Processor SHALL return an error message indicating authentication failure
5. THE Order_Processor SHALL generate a valid HMAC-SHA256 signature for each Shopee_API request using the partner_key and request parameters

### Requirement 4: Handle API Rate Limiting

**User Story:** As a system operator, I want the system to handle Shopee API rate limits gracefully, so that processing continues without manual intervention.

#### Acceptance Criteria

1. WHEN the Shopee_API returns an "error_too_frequent" error, THE Rate_Limiter SHALL wait 2000 milliseconds before retrying the request
2. THE Rate_Limiter SHALL retry a rate-limited request up to 3 times with 2000 millisecond delays between attempts
3. IF all retry attempts fail due to rate limiting, THEN THE Order_Processor SHALL return an error message indicating rate limit exceeded
4. WHEN processing multiple orders, THE Rate_Limiter SHALL introduce a 300 millisecond delay between consecutive API calls
5. THE Rate_Limiter SHALL log each rate limit occurrence with timestamp and retry attempt number

### Requirement 5: Process Multiple Orders in Batch

**User Story:** As a warehouse operator, I want to select and process multiple orders at once, so that I can efficiently handle high order volumes.

#### Acceptance Criteria

1. THE UI_Component SHALL display a checkbox for each Order in READY_TO_SHIP status
2. WHEN a user selects multiple Order checkboxes, THE UI_Component SHALL display a batch action button showing the count of selected orders
3. WHEN a user clicks the batch action button, THE Batch_Processor SHALL process each selected Order sequentially with rate limiting
4. WHEN the Batch_Processor processes multiple orders, THE UI_Component SHALL display a progress indicator showing completed count and total count
5. WHEN the Batch_Processor completes all orders, THE UI_Component SHALL display a summary notification showing successful and failed counts
6. IF any Order in the batch fails, THEN THE Batch_Processor SHALL continue processing remaining orders and report all failures at the end

### Requirement 6: Validate Order Eligibility

**User Story:** As a warehouse operator, I want the system to validate that orders can be processed before calling the API, so that I receive immediate feedback on invalid operations.

#### Acceptance Criteria

1. WHEN a user attempts to process an Order, THE Order_Processor SHALL verify the Order orderStatus is "READY_TO_SHIP"
2. IF the Order orderStatus is not "READY_TO_SHIP", THEN THE Order_Processor SHALL return an error message without calling the Shopee_API
3. WHEN a user attempts to process an Order, THE Order_Processor SHALL verify the Order exists in the Database
4. IF the Order does not exist in the Database, THEN THE Order_Processor SHALL return an error message indicating the order was not found
5. WHEN a user attempts batch processing, THE Order_Processor SHALL filter out any orders that do not meet eligibility criteria before processing

### Requirement 7: Update Local Database State

**User Story:** As a system administrator, I want order status changes to be persisted in the local database, so that the system state remains consistent with Shopee.

#### Acceptance Criteria

1. WHEN the Shopee_API confirms successful shipment arrangement, THE Order_Processor SHALL update the orderStatus field to "PROCESSED" in the shopee_orders table
2. WHEN the Order_Processor updates the orderStatus, THE Order_Processor SHALL update the updatedAt timestamp to the current time
3. THE Order_Processor SHALL use the order_sn as the unique identifier when updating the Database
4. IF the Database update fails after successful Shopee_API call, THEN THE Order_Processor SHALL log the error and return a warning message to the user
5. THE Order_Processor SHALL execute the Database update within a transaction to ensure atomicity

### Requirement 8: Provide User Feedback

**User Story:** As a warehouse operator, I want clear feedback on processing results, so that I know whether my actions succeeded or failed.

#### Acceptance Criteria

1. WHEN a shipment arrangement succeeds, THE UI_Component SHALL display a success toast notification with the order_sn
2. WHEN a shipment arrangement fails, THE UI_Component SHALL display an error toast notification with the specific error message from the Shopee_API
3. WHEN processing a batch of orders, THE UI_Component SHALL display a progress notification that updates in real-time
4. WHEN a batch completes, THE UI_Component SHALL display a summary notification showing the count of successful and failed orders
5. THE UI_Component SHALL automatically dismiss success notifications after 3000 milliseconds
6. THE UI_Component SHALL keep error notifications visible until the user manually dismisses them

### Requirement 9: Handle Network and Timeout Errors

**User Story:** As a system operator, I want the system to handle network failures gracefully, so that temporary issues don't cause permanent failures.

#### Acceptance Criteria

1. WHEN a Shopee_API request times out after 5000 milliseconds, THE Order_Processor SHALL retry the request up to 3 times
2. WHEN a network error occurs, THE Order_Processor SHALL wait 300 milliseconds before retrying
3. IF all retry attempts fail due to network errors, THEN THE Order_Processor SHALL return an error message indicating network failure
4. WHEN the Shopee_API returns a 5xx server error, THE Order_Processor SHALL retry the request up to 3 times with 300 millisecond delays
5. THE Order_Processor SHALL log all network errors with timestamp, attempt number, and error details

### Requirement 10: Support Multi-Shop Operations

**User Story:** As a multi-shop operator, I want the system to correctly identify which shop each order belongs to, so that API calls use the correct credentials.

#### Acceptance Criteria

1. WHEN processing an Order, THE Order_Processor SHALL retrieve the shopId from the Order record
2. WHEN processing an Order, THE Credential_Manager SHALL retrieve credentials matching the Order shopId from the shopee_credentials table
3. IF no credentials exist for the Order shopId, THEN THE Order_Processor SHALL return an error message indicating missing credentials
4. THE Order_Processor SHALL include the correct shop_id parameter in all Shopee_API requests
5. WHEN displaying orders in the UI_Component, THE UI_Component SHALL group or filter orders by shop if multiple shops are configured

### Requirement 11: Refresh Order List After Processing

**User Story:** As a warehouse operator, I want the order list to automatically refresh after processing, so that I see the updated status immediately.

#### Acceptance Criteria

1. WHEN a single Order processing completes successfully, THE UI_Component SHALL refetch the order list from the backend
2. WHEN a batch processing completes, THE UI_Component SHALL refetch the order list once after all orders are processed
3. WHEN refetching the order list, THE UI_Component SHALL maintain the current filter and search state
4. WHEN refetching the order list, THE UI_Component SHALL maintain the user's scroll position if possible
5. IF the refetch fails, THEN THE UI_Component SHALL display an error notification and allow the user to manually refresh

### Requirement 12: Log Processing Activities

**User Story:** As a system administrator, I want all shipment processing activities to be logged, so that I can audit operations and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the Order_Processor initiates a shipment arrangement, THE Order_Processor SHALL log the order_sn, shop_id, and timestamp
2. WHEN the Shopee_API returns a response, THE Order_Processor SHALL log the response status, order_sn, and any error messages
3. WHEN the Database update completes, THE Order_Processor SHALL log the order_sn and new status
4. WHEN a rate limit or retry occurs, THE Rate_Limiter SHALL log the event with attempt number and delay duration
5. THE Order_Processor SHALL log all processing activities with severity levels (info, warning, error) for filtering

