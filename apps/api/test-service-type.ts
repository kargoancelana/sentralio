/**
 * Test service type detection logic
 */

function serviceTypeFromCarrier(carrier: string, logisticsChannelId?: number): 'STD' | 'ECO' | 'EXP' {
  const c = carrier.toUpperCase();
  console.log(`serviceTypeFromCarrier: "${carrier}" -> uppercase: "${c}", logistics_channel_id: ${logisticsChannelId || 'N/A'}`);
  
  // Priority 1: Use logistics_channel_id for accurate mapping (if available)
  if (logisticsChannelId) {
    // SPX Hemat (Economy) - common IDs: 50002, 18080 (5-Day Delivery)
    if (logisticsChannelId === 50002 || logisticsChannelId === 18080) {
      console.log(`Detected ECO service via logistics_channel_id: ${logisticsChannelId}`);
      return 'ECO';
    }
    // SPX Express - common IDs: 50003
    if (logisticsChannelId === 50003) {
      console.log(`Detected EXP service via logistics_channel_id: ${logisticsChannelId}`);
      return 'EXP';
    }
  }
  
  // Priority 2: Fallback to keyword detection in carrier name
  if (c.includes('ECO') || c.includes('HEMAT') || c.includes('5-DAY')) {
    console.log(`Detected ECO service via carrier name keyword`);
    return 'ECO';
  }
  if (c.includes('EXP') || c.includes('EXPRESS')) {
    console.log(`Detected EXP service via carrier name keyword`);
    return 'EXP';
  }
  
  console.log(`Defaulting to STD service`);
  return 'STD';
}

// Test cases
console.log('\n🧪 Testing service type detection:\n');

console.log('Test 1: SPX Hemat');
console.log('Result:', serviceTypeFromCarrier('SPX Hemat'));
console.log('');

console.log('Test 2: SPX Standard');
console.log('Result:', serviceTypeFromCarrier('SPX Standard'));
console.log('');

console.log('Test 3: 5-Day Delivery (SPX)');
console.log('Result:', serviceTypeFromCarrier('5-Day Delivery (SPX)'));
console.log('');

console.log('Test 4: SPX EXPRESS');
console.log('Result:', serviceTypeFromCarrier('SPX EXPRESS'));
console.log('');

console.log('Test 5: SPX Hemat with logistics_channel_id 18080');
console.log('Result:', serviceTypeFromCarrier('SPX Hemat', 18080));
console.log('');

console.log('✅ All tests completed');
