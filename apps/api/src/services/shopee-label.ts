/**
 * Shopee Label API Client
 * 
 * Client for Shopee Logistics API endpoints related to shipping labels.
 * Handles authentication, retry logic, and error handling for label retrieval.
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
 */

import * as crypto from "crypto";
import { getValidToken } from "./shopee-auth";

/**
 * Shopee API base URL
 */
const SHOPEE_API_BASE = "https://partner.shopeemobile.com";

/**
 * Retry configuration for Shopee API calls
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds
  timeout: 10000, // 10 seconds
  retryableErrors: [
    'error_too_frequent', // Rate limit
    'ETIMEDOUT', // Timeout
    'ECONNRESET' // Connection reset
  ]
};

/**
 * Generate Shopee API signature for shop-level endpoints
 * 
 * For shop-level APIs (like logistics), the signature format is:
 * HMAC-SHA256(partner_id + path + timestamp + access_token + shop_id + partner_key)
 * 
 * @param partnerId - Partner ID
 * @param path - API endpoint path
 * @param timestamp - Unix timestamp
 * @param partnerKey - Partner key for HMAC
 * @param accessToken - Access token
 * @param shopId - Shop ID
 * @returns HMAC-SHA256 signature
 */
function generateSignature(
  partnerId: number,
  path: string,
  timestamp: number,
  partnerKey: string,
  accessToken: string,
  shopId: number
): string {
  // For shop-level APIs, base string includes shop_id
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  
  return crypto.createHmac("sha256", partnerKey).update(baseString).digest("hex");
}

/**
 * Make authenticated request to Shopee API with retry logic
 * 
 * @param path - API endpoint path
 * @param shopId - Shop ID
 * @param body - Request body (for POST) or query params (for GET)
 * @param method - HTTP method: 'GET' or 'POST' (default: 'POST')
 * @returns API response data
 */
async function makeShopeeRequest(
  path: string,
  shopId: number,
  body: any,
  method: 'GET' | 'POST' = 'POST'
): Promise<any> {
  let lastError: any;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Get valid credentials
      const credentials = await getValidToken(shopId);
      const timestamp = Math.floor(Date.now() / 1000);

      // Generate signature
      const sign = generateSignature(
        credentials.partnerId,
        path,
        timestamp,
        credentials.partnerKey,
        credentials.accessToken,
        shopId
      );

      // Build URL with query parameters
      let url = `${SHOPEE_API_BASE}${path}?partner_id=${credentials.partnerId}&timestamp=${timestamp}&access_token=${credentials.accessToken}&shop_id=${shopId}&sign=${sign}`;

      // For GET requests, append body fields as query parameters
      if (method === 'GET' && body) {
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined && value !== null) {
            url += `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
          }
        }
      }

      // Make request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.timeout);

      const fetchOptions: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      };

      // Only include body for POST requests
      if (method === 'POST' && body) {
        fetchOptions.body = JSON.stringify(body);
      }

      let res: Response;
      try {
        res = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
      } catch (err: any) {
        clearTimeout(timeoutId);
        
        // Check if error is retryable
        if (RETRY_CONFIG.retryableErrors.some(e => err.message?.includes(e))) {
          lastError = err;
          
          if (attempt < RETRY_CONFIG.maxRetries) {
            console.warn('[shopee-label] retryable error, retrying:', {
              timestamp: new Date().toISOString(),
              shopId,
              path,
              attempt,
              errorType: 'network',
              message: err.message
            });
            await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
            continue;
          }
        }
        
        throw err;
      }

      const data = await res.json();

      // Check for rate limit error
      if (data.error === 'error_too_frequent') {
        lastError = new Error('Rate limit exceeded');
        
        if (attempt < RETRY_CONFIG.maxRetries) {
          console.warn('[shopee-label] rate limit hit, retrying:', {
            timestamp: new Date().toISOString(),
            shopId,
            path,
            attempt,
            errorType: 'rate_limit'
          });
          await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
          continue;
        }
      }

      // Check for authentication errors
      if (data.error && (data.error.includes('auth') || data.error.includes('token'))) {
        console.error('[shopee-label] authentication error:', {
          timestamp: new Date().toISOString(),
          shopId,
          path,
          errorType: 'auth',
          error: data.error,
          message: data.message
        });
        throw new Error(`Autentikasi gagal: ${data.message || data.error}`);
      }

      // Check for other API errors
      // Note: Some batch APIs (like create_shipping_document) return top-level error
      // "common.batch_api_all_failed" with detail in response.result_list.
      // We pass these through so the caller can parse result_list.
      if (res.status >= 400 || (data.error && !data.error.startsWith('common.'))) {
        console.error('[shopee-label] API error:', {
          timestamp: new Date().toISOString(),
          shopId,
          path,
          status: res.status,
          errorType: 'shopee_api',
          error: data.error,
          message: data.message,
          fullResponse: JSON.stringify(data)
        });
        throw new Error(data.message || data.error || `API error: ${res.status}`);
      }

      return data;

    } catch (err: any) {
      lastError = err;
      
      // Don't retry on authentication errors
      if (err.message?.includes('Autentikasi gagal')) {
        throw err;
      }
      
      // Retry on other errors if attempts remain
      if (attempt < RETRY_CONFIG.maxRetries) {
        console.warn('[shopee-label] request failed, retrying:', {
          timestamp: new Date().toISOString(),
          shopId,
          path,
          attempt,
          errorType: 'unexpected',
          message: err.message
        });
        await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
        continue;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Request failed after all retries');
}

/**
 * Create shipping document (print label) on Shopee
 * 
 * Calls /api/v2/logistics/create_shipping_document endpoint
 * to trigger label generation on Shopee side.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @param documentType - Document type (THERMAL_AIR_WAYBILL or NORMAL_AIR_WAYBILL)
 * @returns Creation response
 */
export async function createShippingDocument(
  shopId: number,
  orderSn: string,
  documentType: string = 'THERMAL_AIR_WAYBILL',
  packageNumber?: string,
  trackingNumber?: string
): Promise<any> {
  const path = "/api/v2/logistics/create_shipping_document";
  
  console.log('[shopee-label] creating shipping document:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    documentType,
    packageNumber: packageNumber || 'none',
    trackingNumber: trackingNumber || 'none',
    operation: 'create_document'
  });

  const orderItem: any = {
    order_sn: orderSn,
    shipping_document_type: documentType
  };

  // Include package_number if provided (required for packaged orders)
  if (packageNumber) {
    orderItem.package_number = packageNumber;
  }

  // Include tracking_number (REQUIRED for most logistics channels like SPX)
  if (trackingNumber) {
    orderItem.tracking_number = trackingNumber;
  }

  const body = {
    order_list: [orderItem]
  };

  try {
    const response = await makeShopeeRequest(path, shopId, body);
    
    // Check if response has result_list with errors
    // Shopee returns errors in two possible locations:
    // 1. response.result.result_list (normal response)
    // 2. response.response.result_list (when common.batch_api_all_failed)
    const resultList = response?.result?.result_list 
      || response?.response?.result_list 
      || [];
    
    if (resultList.length > 0) {
      // Shopee uses fail_error/fail_message for per-order errors
      const failedOrders = resultList.filter((item: any) => item.fail_error || item.error);
      
      if (failedOrders.length > 0) {
        console.error('[shopee-label] create document failed for some orders:', {
          timestamp: new Date().toISOString(),
          shopId,
          orderSn,
          documentType,
          operation: 'create_document',
          failedOrders: JSON.stringify(failedOrders),
          fullResponse: JSON.stringify(response)
        });
        
        // Throw error with specific details from first failed order
        const firstError = failedOrders[0];
        const errorCode = firstError.fail_error || firstError.error || 'unknown';
        const errorMsg = firstError.fail_message || firstError.error_description || 'No description';
        throw new Error(`${errorCode}: ${errorMsg}`);
      }
    }
    
    console.log('[shopee-label] shipping document created:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      documentType,
      operation: 'create_document',
      response: JSON.stringify(response),
      success: true
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to create shipping document:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      documentType,
      operation: 'create_document',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get shipping document parameters from Shopee
 * 
 * Calls /api/v2/logistics/get_shipping_document_parameter endpoint
 * to retrieve document parameters for an order.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @returns Document parameters
 * 
 * **Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.6**
 */
export async function getShippingDocumentParameter(
  shopId: number,
  orderSn: string,
  packageNumber?: string
): Promise<any> {
  const path = "/api/v2/logistics/get_shipping_document_parameter";
  
  console.log('[shopee-label] getting document parameter:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    packageNumber: packageNumber || 'none',
    operation: 'get_parameter'
  });

  // Shopee Logistics API expects order_list as array of objects with order_sn field
  const orderItem: any = { order_sn: orderSn };
  if (packageNumber) orderItem.package_number = packageNumber;
  const body = {
    order_list: [orderItem]
  };

  try {
    const response = await makeShopeeRequest(path, shopId, body);
    
    console.log('[shopee-label] document parameter response:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_parameter',
      response: JSON.stringify(response),
      success: true
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to get document parameter:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_parameter',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Download shipping document (PDF label) from Shopee
 * 
 * Calls /api/v2/logistics/download_shipping_document endpoint
 * to download the actual PDF label after create_shipping_document is READY.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @returns Label document with base64 PDF data
 */
export async function downloadShippingDocument(
  shopId: number,
  orderSn: string,
  packageNumber?: string,
  shippingDocumentType?: string
): Promise<{
  base64: string;
  format: 'pdf';
}> {
  const path = "/api/v2/logistics/download_shipping_document";
  
  console.log('[shopee-label] downloading shipping document:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    packageNumber: packageNumber || 'none',
    operation: 'download_document'
  });

  const orderItem: any = { order_sn: orderSn };
  if (packageNumber) orderItem.package_number = packageNumber;
  if (shippingDocumentType) orderItem.shipping_document_type = shippingDocumentType;
  const body = {
    order_list: [orderItem]
  };

  try {
    // CRITICAL FIX: download_shipping_document returns PDF binary, NOT JSON
    // We need to handle this differently from other API calls
    
    // Get valid credentials
    const credentials = await getValidToken(shopId);
    const timestamp = Math.floor(Date.now() / 1000);

    // Generate signature
    const sign = generateSignature(
      credentials.partnerId,
      path,
      timestamp,
      credentials.partnerKey,
      credentials.accessToken,
      shopId
    );

    // Build URL
    const url = `${SHOPEE_API_BASE}${path}?partner_id=${credentials.partnerId}&timestamp=${timestamp}&access_token=${credentials.accessToken}&shop_id=${shopId}&sign=${sign}`;

    // Make request
    const res = await fetch(url, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    // Check content type - if PDF, return as base64
    const contentType = res.headers.get('content-type') || '';
    
    if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
      // PDF response - convert to base64
      const arrayBuffer = await res.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      
      console.log('[shopee-label] shipping document downloaded (PDF):', {
        timestamp: new Date().toISOString(),
        shopId,
        orderSn,
        operation: 'download_document',
        contentType,
        sizeBytes: arrayBuffer.byteLength,
        success: true
      });

      return {
        base64: base64Data,
        format: 'pdf'
      };
    }
    
    // JSON response - parse and extract
    const data = await res.json();
    
    // Check for errors
    if (data.error) {
      throw new Error(data.message || data.error);
    }
    
    // Parse response to extract PDF document
    const resultList = data?.response?.result_list || data?.result?.result_list || [];
    
    if (resultList.length === 0) {
      throw new Error('Label pengiriman tidak tersedia untuk didownload');
    }

    const orderData = resultList[0];
    
    if (orderData.fail_error) {
      throw new Error(`Download gagal: ${orderData.fail_message || orderData.fail_error}`);
    }

    const base64Data = orderData.file;
    
    if (!base64Data) {
      throw new Error('Data PDF label tidak tersedia');
    }

    console.log('[shopee-label] shipping document downloaded (JSON):', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'download_document',
      success: true
    });

    return {
      base64: base64Data,
      format: 'pdf'
    };
  } catch (error: any) {
    console.error('[shopee-label] failed to download shipping document:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'download_document',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get shipping document result (actual label) from Shopee
 * 
 * Calls /api/v2/logistics/get_shipping_document_result endpoint
 * to retrieve the actual label document (PDF or image).
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @returns Label document with URL/base64 data and format
 * 
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3**
 */
export async function getShippingDocumentResult(
  shopId: number,
  orderSn: string,
  packageNumber?: string
): Promise<{
  url?: string;
  base64?: string;
  format: 'pdf' | 'png' | 'jpg';
}> {
  const path = "/api/v2/logistics/get_shipping_document_result";
  
  console.log('[shopee-label] getting document result:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    packageNumber: packageNumber || 'none',
    operation: 'get_result'
  });

  // Shopee Logistics API expects order_list as array of objects with order_sn field
  const orderItem: any = { order_sn: orderSn };
  if (packageNumber) orderItem.package_number = packageNumber;
  const body = {
    order_list: [orderItem]
  };

  try {
    const response = await makeShopeeRequest(path, shopId, body);
    
    // Parse response - Shopee returns result_list with status field
    const resultList = response?.response?.result_list || response?.result?.result_list || [];
    
    if (resultList.length === 0) {
      throw new Error('Label pengiriman belum tersedia. Silakan coba lagi dalam beberapa menit');
    }

    const orderData = resultList[0];
    
    // Check for errors first
    if (orderData.fail_error) {
      throw new Error(orderData.fail_message || orderData.fail_error);
    }
    
    // Check status - must be "READY" to download
    if (orderData.status !== 'READY') {
      throw new Error('Label pengiriman belum tersedia. Silakan coba lagi dalam beberapa menit');
    }

    console.log('[shopee-label] document result retrieved - status READY:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_result',
      status: orderData.status,
      success: true
    });

    // Return success - caller should now download the document
    return {
      format: 'pdf'
    };
  } catch (error: any) {
    console.error('[shopee-label] failed to get document result:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_result',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get shipping parameter for order
 * 
 * Calls /api/v2/logistics/get_shipping_parameter endpoint
 * to determine shipping mode (pickup/dropoff/non_integrated) before init_logistic.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @returns Shipping parameters including mode and requirements
 */
export async function getShippingParameter(
  shopId: number,
  orderSn: string
): Promise<any> {
  const path = "/api/v2/logistics/get_shipping_parameter";
  
  console.log('[shopee-label] getting shipping parameter:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    operation: 'get_shipping_parameter'
  });

  // GET request - params go as query string
  const params = {
    order_sn: orderSn
  };

  try {
    const response = await makeShopeeRequest(path, shopId, params, 'GET');
    
    console.log('[shopee-label] shipping parameter response:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_shipping_parameter',
      response: JSON.stringify(response),
      success: true
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to get shipping parameter:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_shipping_parameter',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Initialize logistics (ship order) on Shopee
 * 
 * Calls /api/v2/logistics/init_logistic endpoint
 * to actually ship the order in Shopee system. Must be called after get_shipping_parameter.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @param mode - Shipping mode: 'pickup', 'dropoff', or 'non_integrated'
 * @param options - Additional options based on mode (address_id, pickup_time_id, branch_id, tracking_no)
 * @returns Init logistic response
 */
export async function initLogistic(
  shopId: number,
  orderSn: string,
  mode: 'pickup' | 'dropoff' | 'non_integrated' = 'pickup',
  options: {
    address_id?: number;
    pickup_time_id?: string;
    branch_id?: number;
    tracking_no?: string;
  } = {}
): Promise<any> {
  const path = "/api/v2/logistics/init_logistic";
  
  console.log('[shopee-label] initializing logistic:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    mode,
    options,
    operation: 'init_logistic'
  });

  // Build request body based on mode
  const body: any = {
    order_sn: orderSn
  };

  if (mode === 'pickup') {
    // For pickup mode, we need address_id and pickup_time_id
    // If not provided, use defaults (will need to be configured per shop)
    body.pickup = {
      address_id: options.address_id || 1, // Default pickup address
      pickup_time_id: options.pickup_time_id || "1" // Default pickup time slot
    };
  } else if (mode === 'dropoff') {
    // For dropoff mode, we need branch_id
    body.dropoff = {
      branch_id: options.branch_id || 1 // Default branch
    };
  } else if (mode === 'non_integrated') {
    // For non_integrated mode, we need manual tracking number
    if (!options.tracking_no) {
      throw new Error('tracking_no is required for non_integrated mode');
    }
    body.non_integrated = {
      tracking_no: options.tracking_no
    };
  }

  try {
    const response = await makeShopeeRequest(path, shopId, body);
    
    console.log('[shopee-label] logistic initialized:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      mode,
      operation: 'init_logistic',
      response: JSON.stringify(response),
      success: true
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to initialize logistic:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      mode,
      operation: 'init_logistic',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get tracking number for shipped order
 * 
 * Calls /api/v2/logistics/get_tracking_number endpoint
 * to retrieve AWB/tracking number after init_logistic.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @returns Tracking information
 */
export async function getTrackingNumber(
  shopId: number,
  orderSn: string
): Promise<any> {
  const path = "/api/v2/logistics/get_tracking_number";
  
  console.log('[shopee-label] getting tracking number:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    operation: 'get_tracking'
  });

  // GET request - params go as query string
  // Shopee get_tracking_number uses single order_sn, not order_sn_list
  const params = {
    order_sn: orderSn
  };

  try {
    const response = await makeShopeeRequest(path, shopId, params, 'GET');
    
    console.log('[shopee-label] tracking number response:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_tracking',
      response: JSON.stringify(response),
      success: true
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to get tracking number:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_tracking',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get tracking numbers for multiple packages at once (batch)
 * 
 * Calls /api/v2/logistics/get_mass_tracking_number endpoint.
 * Much more efficient than calling get_tracking_number per order:
 * - 10 orders = 1 API call instead of 10
 * - Reduces rate limit risk significantly
 * 
 * @param shopId - Shop ID
 * @param packageNumbers - Array of package numbers (from order's package_list)
 * @returns Response with success_list (tracking numbers) and fail_list
 */
export async function getMassTrackingNumber(
  shopId: number,
  packageNumbers: string[]
): Promise<any> {
  const path = "/api/v2/logistics/get_mass_tracking_number";
  
  console.log('[shopee-label] getting mass tracking numbers:', {
    timestamp: new Date().toISOString(),
    shopId,
    packageCount: packageNumbers.length,
    operation: 'get_mass_tracking'
  });

  const body = {
    package_list: packageNumbers.map(pn => ({ package_number: pn })),
    response_optional_fields: "first_mile_tracking_number"
  };

  try {
    const response = await makeShopeeRequest(path, shopId, body, 'POST');
    
    const successCount = response?.response?.success_list?.length || 0;
    const failCount = response?.response?.fail_list?.length || 0;
    
    console.log('[shopee-label] mass tracking number response:', {
      timestamp: new Date().toISOString(),
      shopId,
      operation: 'get_mass_tracking',
      requested: packageNumbers.length,
      success: successCount,
      failed: failCount,
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to get mass tracking numbers:', {
      timestamp: new Date().toISOString(),
      shopId,
      operation: 'get_mass_tracking',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get shipping document data info for custom AWB printing
 * 
 * Calls /api/v2/logistics/get_shipping_document_data_info endpoint.
 * Returns raw logistics data (sort codes, 3PL info, tracking, weight)
 * that can be used to render a self-designed AWB label.
 * 
 * NOTE: We do NOT request recipient_address_info images here.
 * Recipient address is fetched as text from get_order_detail instead,
 * which produces smaller PDFs and crisper thermal prints.
 * 
 * @param shopId - Shop ID
 * @param orderSn - Order serial number
 * @param packageNumber - Package number (optional, for packaged orders)
 * @returns Shipping document data with sort codes, 3PL info, etc.
 */
export async function getShippingDocumentDataInfo(
  shopId: number,
  orderSn: string,
  packageNumber?: string
): Promise<any> {
  const path = "/api/v2/logistics/get_shipping_document_data_info";
  
  console.log('[shopee-label] getting shipping document data info:', {
    timestamp: new Date().toISOString(),
    shopId,
    orderSn,
    packageNumber: packageNumber || 'none',
    operation: 'get_doc_data_info'
  });

  const body: any = { order_sn: orderSn };
  if (packageNumber) body.package_number = packageNumber;

  try {
    const response = await makeShopeeRequest(path, shopId, body, 'POST');
    
    console.log('[shopee-label] shipping document data info response:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_doc_data_info',
      hasData: !!response?.response?.shipping_document_info,
      success: true
    });

    return response;
  } catch (error: any) {
    console.error('[shopee-label] failed to get shipping document data info:', {
      timestamp: new Date().toISOString(),
      shopId,
      orderSn,
      operation: 'get_doc_data_info',
      errorType: 'shopee_api',
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}
