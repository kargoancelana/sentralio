/**
 * Simple test script to debug label service issues
 */

import { getSingleLabel } from "./src/services/label.service";

async function testLabel() {
  try {
    console.log('Testing label service...');
    const result = await getSingleLabel('260426TGEAWASQ');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testLabel();