/**
 * Quick Rate Limiting Test Script
 * 
 * Quick test to verify rate limiting is working (no 60s wait)
 */

const API_URL = "http://localhost:3000";
const TEST_REQUESTS = 105; // Send 105 requests (limit is 100)

async function testRateLimit() {
  console.log("🧪 Quick Rate Limiting Test\n");
  console.log(`Sending ${TEST_REQUESTS} requests to ${API_URL}\n`);

  let successCount = 0;
  let rateLimitedCount = 0;

  const startTime = Date.now();

  for (let i = 1; i <= TEST_REQUESTS; i++) {
    try {
      const response = await fetch(`${API_URL}/`);
      
      if (response.status === 200) {
        successCount++;
        if (i <= 3 || i === TEST_REQUESTS) {
          console.log(`✅ Request ${i}: Success`);
        } else if (i === 4) {
          console.log(`... (requests 4-${successCount}) ...`);
        }
      } else if (response.status === 429) {
        rateLimitedCount++;
        if (rateLimitedCount === 1) {
          const data = await response.json();
          console.log(`🚫 Request ${i}: RATE LIMITED - ${data.message}`);
          console.log(`... (remaining requests also rate limited) ...`);
        }
      }
    } catch (error: any) {
      console.log(`❌ Request ${i}: Error - ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 5));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(50));
  console.log("📊 Results:");
  console.log("=".repeat(50));
  console.log(`Total:          ${TEST_REQUESTS} requests`);
  console.log(`✅ Successful:  ${successCount}`);
  console.log(`🚫 Blocked:     ${rateLimitedCount}`);
  console.log(`⏱️  Duration:    ${duration}s`);
  console.log("=".repeat(50));

  if (rateLimitedCount > 0) {
    console.log("\n✅ Rate limiting WORKING!");
    console.log(`   Limit: 100 requests/minute`);
    console.log(`   First ${successCount} succeeded, then blocked ${rateLimitedCount}`);
  } else {
    console.log("\n⚠️  Rate limiting NOT working!");
  }
}

testRateLimit().catch(console.error);
