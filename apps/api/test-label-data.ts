import { collectLabelData } from './src/services/label-data.service';

async function testLabelData() {
  // Test dengan order yang punya empty SKU
  const orderSn = '2604198PMDAAD7';
  
  console.log(`Testing label data for order: ${orderSn}\n`);
  
  try {
    const data = await collectLabelData(orderSn);
    
    console.log('Items:');
    data.items.forEach((item, idx) => {
      console.log(`\n  Item ${idx + 1}:`);
      console.log(`    name: ${item.name}`);
      console.log(`    sku: "${item.sku}" (type: ${typeof item.sku}, length: ${item.sku.length})`);
      console.log(`    variantName: ${item.variantName}`);
      console.log(`    qty: ${item.qty}`);
      console.log(`    isEmpty: ${!item.sku || item.sku === '-'}`);
    });
    
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  
  process.exit(0);
}

testLabelData();
