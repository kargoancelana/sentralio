// Shared types for custom label data (matches backend label-data.service.ts)

export interface LabelDataItem {
  name: string;
  sku: string;
  variantName: string;
  qty: number;
}

export interface LabelData {
  // Header
  orderSn: string;
  orderDate: string;
  shippingCarrier: string;
  serviceType: 'STD' | 'ECO' | 'EXP';

  // Tracking / Barcode
  trackingNumber: string;
  sortCode: string;
  batchCode: string;

  // Recipient (PNG images from Shopee — text is privacy-masked)
  recipient: {
    nameImg: string;    // data:image/png;base64,...
    phoneImg: string;
    addressImg: string;
  };

  // Sender
  sender: {
    name: string;
    phone: string;
    city: string;
  };

  // Items
  items: LabelDataItem[];
  totalQty: number;

  // Footer
  weight: string;
  shipByDate: string;
  shipByTime: string;
}
