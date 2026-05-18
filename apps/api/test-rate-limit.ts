/**
 * Rate Limiting Test Script
 * 
 * Tests that rate limiting is working correctly by sending multiple requests
 * and verifying that requests are blocked after exceeding the limit.
 */

const API_URL = "http://localhost:3000";
const MAX_REQUESTS = 100; // Rate limit: 100 requests per minute
const TEST_REQUESTS = 105; // Send 105 requests to trigger rate limit

async function testRateLimit() {
  console.log("🧪 Testing Rate Limiting...\n");
  console.log(`Rate Limit: ${MAX_REQUESTS} requests per minute`);
  console.log(`Sending: ${TEST_REQUESTS} requests\n`);

  let successCount = 0;
  let rateLimitedCount = 0;
  let errorCount = 0;

  const startTime = Date.now();

  for (let i = 1; i <= TEST_REQUESTS; i++) {
    try {
      const response = await fetch(`${API_URL}/`);
      const data = await response.json();

      if (response.status === 200) {
        successCount++;
        if (i <= 5 || i >= TEST_REQUESTS - 5) {
          console.log(`✅ Request ${i}: Success (${response.status})`);
        } else if (i === 6) {
          console.log(`... (skipping logs for requests 6-${TEST_REQUESTS - 5}) ...`);
        }
      } else if (response.status === 429) {
        rateLimitedCount++;
        if (rateLimitedCount <= 3) {
          console.log(`🚫 Request ${i}: Rate Limited (${response.status}) - ${data.message}`);
        } else if (rateLimitedCount === 4) {
          console.log(`... (rate limited for remaining requests) ...`);
        }
      } else {
        errorCount++;
        console.log(`❌ Request ${i}: Error (${response.status})`);
      }
    } catch (error: any) {
      errorCount++;
      console.log(`❌ Request ${i}: Network Error - ${error.message}`);
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Results:");
  console.log("=".repeat(60));
  console.log(`Total Requests:     ${TEST_REQUESTS}`);
  console.log(`✅ Successful:      ${successCount}`);
  console.log(`🚫 Rate Limited:    ${rateLimitedCount}`);
  console.log(`❌ Errors:          ${errorCount}`);
  console.log(`⏱️  Duration:        ${duration}s`);
  console.log("=".repeat(60));

  // Verify rate limiting is working
  if (rateLimitedCount > 0) {
    console.log("\n✅ Rate limiting is WORKING correctly!");
    console.log(`   - First ${successCount} requests succeeded`);
    console.log(`   - Remaining ${rateLimitedCount} requests were blocked`);
  } else {
    console.log("\n⚠️  Rate limiting may NOT be working!");
    console.log("   - All requests succeeded (expected some to be blocked)");
  }

  // Wait 60 seconds and test again to verify reset
  console.log("\n⏳ Waiting 60 seconds for rate limit to reset...");
  await new Promise(resolve => setTimeout(resolve, 60000));

  console.log("\n🔄 Testing after rate limit reset...");
  const resetResponse = await fetch(`${API_URL}/`);
  if (resetResponse.status === 200) {
    console.log("✅ Rate limit reset successfully! Request succeeded.");
  } else {
    console.log(`⚠️  Rate limit may not have reset. Status: ${resetResponse.status}`);
  }
}

// Run test
testRateLimit().catch(console.error);
