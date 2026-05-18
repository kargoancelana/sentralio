import { getShopeeOrderDetails } from './src/services/shopee-raw';

async function testShopeeApi() {
  // Test dengan order yang belum punya model_sku
  const testOrderSn = '260409APBYVUC4';
  const shopId = 1062828619; // Ganti dengan shop_id yang benar
  
  console.log(`Testing Shopee API for order: ${testOrderSn}\n`);
  
  try {
    const result = await getShopeeOrderDetails(shopId, [testOrderSn]);
    
    if (result.error) {
      console.error('API Error:', result.error, result.message);
      process.exit(1);
    }
    
    const order = result.response?.order_list?.[0];
    if (!order) {
      console.error('Order not found in API response');
      process.exit(1);
    }
    
    console.log('Order SN:', order.order_sn);
    console.log('Order Status:', order.order_status);
    console.log('\nItems:');
    
    const items = order.item_list || [];
    items.forEach((item: any, idx: number) => {
      console.log(`\n  Item ${idx + 1}:`);
      console.log(`    item_name: ${item.item_name}`);
      console.log(`    model_name: ${item.model_name || 'NULL'}`);
      console.log(`    model_sku: ${item.model_sku || 'NULL'}`);
      console.log(`    model_id: ${item.model_id || 'NULL'}`);
    });
    
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  
  process.exit(0);
}

testShopeeApi();
