// Types for Profit / Laporan Keuangan API responses

export interface ProfitOrderItemDetail {
  itemName: string;
  modelName: string | null;
  modelSku: string | null;
  qty: number;
  hppPerUnit: number;
  packingCostPerUnit: number;
}

export interface ProfitOrderItem {
  orderSn: string;
  shopName: string | null;
  createTime: string;
  escrowReleaseTime: string | null; // Requirement 6.2
  revenue: number;
  shopeeDeductions: number;
  hpp: number;
  packingCost: number;
  netProfit: number;
  profitMarginPercent: number;
  items: ProfitOrderItemDetail[];
}

export interface ProfitOrderPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ProfitOrdersResponse {
  orders: ProfitOrderItem[];
  pagination: ProfitOrderPagination;
}
