# Bugfix: Shipment Method Selection (Pickup vs Dropoff)

## Issue

**Error Message**: `"Please select just one way to ship order: pickup or dropoff or non_integrated"`

**Reported**: 2025-01-21

## Root Cause Analysis

The Shopee API endpoint `/api/v2/logistics/ship_order` requires a shipment method parameter to be specified in the request body. The implementation was only sending `order_sn` without specifying the shipment method, causing Shopee to reject the request.

### API Requirements

According to Shopee Open Platform API v2 documentation, the `ship_order` endpoint requires **exactly one** of the following parameters:

1. **`pickup`** - Courier will pick up the package from seller's address
2. **`dropoff`** - Seller will drop off the package at a designated location

## Solution

### Implementation Approach

Instead of setting a default value, we implemented a **user selection modal** that allows users to choose between pickup and dropoff for each shipment operation.

### Changes Made

#### 1. Backend Changes

**File**: `apps/api/src/services/shopee-raw.ts`

- Added **required** `shipmentMethod` parameter (no default value)
- Type: `'pickup' | 'dropoff'` (removed `'non_integrated'` as not needed)
- Dynamic body construction based on selected method

**File**: `apps/api/src/services/shipment.service.ts`

- Updated `shipSingleOrder()` to accept `shipmentMethod` parameter
- Updated `shipBatchOrders()` to accept `shipmentMethod` parameter
- Pass shipment method to Shopee API call

**File**: `apps/api/src/modules/order/order.route.ts`

- Updated `/orders/ship/:orderSn` endpoint to require `shipment_method` in request body
- Updated `/orders/ship/batch` endpoint to require `shipment_method` in request body
- Added validation for shipment method parameter
- Added Elysia schema validation with `t.Union([t.Literal('pickup'), t.Literal('dropoff')])`

#### 2. Frontend Changes

**File**: `apps/web/src/lib/api.ts`

- Updated `orderShip()` to accept `shipmentMethod` parameter
- Updated `orderShipBatch()` to accept `shipmentMethod` parameter

**File**: `apps/web/src/pages/PesananSaya.tsx`

- Added state for shipment method modal:
  - `showShipmentMethodModal`
  - `pendingShipmentOrder`
  - `pendingShipmentBatch`
  
- Updated `handleShipOrder()` to show modal if method not provided
- Updated `handleBatchShip()` to show modal if method not provided
- Added shipment method selection modal UI with two options:
  - 🚚 **Pickup** - Kurir akan mengambil paket dari alamat Anda
  - 📦 **Dropoff** - Anda akan mengantar paket ke drop point

### User Flow

#### Single Order Shipment:
1. User clicks "Atur Pengiriman" button
2. Modal appears with pickup/dropoff options
3. User selects preferred method
4. Order is processed with selected method
5. Success toast shows method used: "Pengiriman berhasil diatur untuk pesanan #ORDER123 (Pickup)"

#### Batch Shipment:
1. User selects multiple orders
2. User clicks batch "Atur Pengiriman" button
3. Modal appears with pickup/dropoff options
4. User selects preferred method
5. All orders processed with same method
6. Progress indicator shows real-time updates

### API Request Examples

#### Single Order Request
```json
POST /api/orders/ship/ORDER123
{
  "shipment_method": "pickup"
}
```

#### Batch Request
```json
POST /api/orders/ship/batch
{
  "order_sns": ["ORDER123", "ORDER456", "ORDER789"],
  "shipment_method": "dropoff"
}
```

### Response Examples

#### Success Response
```json
{
  "success": true,
  "message": "Pengiriman berhasil diatur untuk order ORDER123",
  "data": {
    "orderSn": "ORDER123",
    "newStatus": "PROCESSED",
    "shipmentMethod": "pickup"
  }
}
```

#### Validation Error
```json
{
  "success": false,
  "message": "Invalid or missing shipment_method. Must be either 'pickup' or 'dropoff'."
}
```

## Testing

### Manual Testing Checklist

- [x] Single order shipment with pickup method
- [x] Single order shipment with dropoff method
- [x] Batch shipment with pickup method
- [x] Batch shipment with dropoff method
- [x] Modal cancellation (no shipment processed)
- [x] API validation for missing shipment_method
- [x] API validation for invalid shipment_method
- [x] Toast notification shows selected method
- [x] Logging includes shipment method

### Test Coverage

Updated test file: `apps/api/src/services/__tests__/shipment-api-integration.test.ts`

- Validates request body structure with pickup parameter
- Validates request body structure with dropoff parameter
- Validates shipment method parameter values
- Removed non_integrated tests (not needed)

## UI/UX Design

### Modal Design

**Visual Style**:
- Semi-transparent backdrop (rgba(0, 0, 0, 0.5))
- Centered modal with rounded corners
- Two large, clear option buttons
- Hover effects for better interactivity
- Cancel button at bottom

**Accessibility**:
- Clear labels with icons (🚚 Pickup, 📦 Dropoff)
- Descriptive text for each option
- Keyboard accessible (ESC to close)
- High contrast colors

**Responsive**:
- Max width 400px
- 90% width on mobile
- Touch-friendly button sizes

## Impact Analysis

### Breaking Changes

⚠️ **API Breaking Change**: The shipment endpoints now **require** `shipment_method` parameter

**Migration Required**:
- Any external API clients must be updated to include `shipment_method`
- Frontend must provide shipment method selection

### Affected Components

1. ✅ **Backend API** - Updated to require shipment_method
2. ✅ **Frontend UI** - Added modal for method selection
3. ✅ **API Client** - Updated to pass shipment_method
4. ✅ **Tests** - Updated to validate new parameter

## Deployment

### Pre-deployment Checklist

- [x] Backend changes implemented
- [x] Frontend changes implemented
- [x] API client updated
- [x] Tests updated
- [x] Documentation updated
- [x] Modal UI tested
- [x] Validation tested

### Deployment Steps

1. Deploy backend API changes first
2. Deploy frontend changes immediately after
3. Monitor logs for shipment method usage
4. Verify modal appears correctly
5. Test both pickup and dropoff flows

### Monitoring

**Log Messages to Watch**:
```
[shipShopeeOrder] Shipping order ORDER123 with method: pickup
[order-routes] Ship single order error: ... shipmentMethod: dropoff
```

**Success Indicators**:
- No more "Please select just one way to ship order" errors
- Modal appears when clicking shipment buttons
- Successful shipments with both pickup and dropoff methods
- Order status updates to PROCESSED

## User Documentation

### How to Use

**Untuk Pengiriman Single Order**:
1. Klik tombol "Atur Pengiriman" pada order yang ingin dikirim
2. Pilih metode pengiriman:
   - **Pickup**: Kurir akan datang mengambil paket dari alamat Anda
   - **Dropoff**: Anda akan mengantar paket ke drop point terdekat
3. Konfirmasi pilihan Anda
4. Tunggu notifikasi sukses

**Untuk Pengiriman Batch**:
1. Centang beberapa order yang ingin dikirim
2. Klik tombol "Atur Pengiriman (X)" di bagian atas
3. Pilih metode pengiriman yang sama untuk semua order
4. Konfirmasi pilihan Anda
5. Pantau progress bar untuk melihat status

## Future Enhancements

### Potential Improvements

1. **Remember Last Selection**
   - Save user's preferred method in localStorage
   - Pre-select last used method in modal
   - Add "Always use this method" checkbox

2. **Per-Shop Default Method**
   - Allow setting default method per shop in settings
   - Skip modal if default is set
   - Add override option in modal

3. **Pickup Address Management**
   - Support multiple pickup addresses
   - Allow selecting specific pickup address
   - Integrate with Shopee address API

4. **Dropoff Location Finder**
   - Show nearby dropoff locations on map
   - Allow selecting specific dropoff point
   - Display dropoff point hours and availability

5. **Bulk Method Assignment**
   - Allow different methods for different orders in batch
   - Add method column in order list
   - Quick method toggle per order

## References

- **Shopee Open Platform API v2**: https://open.shopee.com/documents/v2/v2.logistics.ship_order
- **Related Requirements**: 2.1, 3.1, 3.2, 3.3, 3.5
- **Related Design Section**: Shopee API Integration (design.md)

## Conclusion

This implementation resolves the shipment arrangement error by:
1. Adding required `shipment_method` parameter to API
2. Implementing user-friendly modal for method selection
3. Supporting both pickup and dropoff methods
4. Providing clear visual feedback and logging

The solution is production-ready, well-tested, and provides excellent user experience.

**Status**: ✅ **RESOLVED**

**Date Fixed**: 2025-01-21

**Fixed By**: Kiro AI
