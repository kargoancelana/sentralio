// Marketplace-agnostic types for Order Detail Modal
// Field names intentionally avoid marketplace-specific terminology (Requirement 11.1, 11.3)

export interface RecipientAddress {
  name: string;         // masked by marketplace
  phone: string;        // masked by marketplace
  fullAddress: string;
  town: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  zipcode: string | null;
}

export interface PackageItem {
  itemId: string;
  modelId: string;
  itemName: string;
  modelName: string | null;
  quantity: number;
  imageUrl: string | null;
}

export interface Package {
  label: string;          // e.g. "Paket 1", "Paket 2" (1-based index)
  courierService: string; // e.g. "SPX Standard"
  items: PackageItem[];
}

export interface IncomeItem {
  itemId: string;
  modelId: string;
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;       // unitPrice * quantity
  imageUrl: string | null;
}

export interface IncomeBreakdown {
  items: IncomeItem[];
  productSubtotal: number;  // sum of items[].subtotal
  shipping: {
    buyerPaid: number;        // buyer_paid_shipping_fee
    actualToCarrier: number;  // actual_shipping_fee (positive; UI displays as negative)
    shopeeRebate: number;     // shopee_shipping_rebate
    rollup: number;           // buyerPaid - actualToCarrier + shopeeRebate
  };
  fees: {
    adminFee: number;         // commission_fee (positive; UI displays as negative)
    serviceFee: number;       // service_fee
    processingFee: number;    // seller_order_processing_fee
  };
  totalEstimatedIncome: number; // escrow_amount
}

export interface Adjustment {
  reason: string;
  amount: number; // preserves sign as returned by marketplace
}

export interface FinalEarnings {
  amount: number;       // escrow_amount_after_adjustment (or fallback to escrow_amount)
  isFallback: boolean;  // true when escrow_amount_after_adjustment was null/absent
}

export interface BuyerPayment {
  productSubtotal: number; // merchant_subtotal
  shippingFee: number;     // shipping_fee
  shopeeVoucher: number;   // shopee_voucher (positive; UI displays as negative)
  sellerVoucher: number;   // seller_voucher
  serviceFee: number;      // buyer_service_fee
  total: number;           // buyer_total_amount
}

export interface OrderDetailResponse {
  marketplace: "shopee"; // future: "lazada" | "tiktok"
  orderSn: string;
  orderStatus: string;   // e.g. "READY_TO_SHIP" | "PROCESSED" | "COMPLETED"
  buyerUsername: string | null;
  recipientAddress: RecipientAddress;
  packages: Package[];
  incomeBreakdown: IncomeBreakdown;
  adjustments: Adjustment[];
  finalEarnings: FinalEarnings;
  buyerPayment: BuyerPayment;
}
