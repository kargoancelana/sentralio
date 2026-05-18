# Rate Limiting Setup Guide

> ✅ **STATUS: IMPLEMENTED** - Rate limiting telah diimplementasikan dan aktif.
> 
> Lihat [RATE_LIMITING.md](./RATE_LIMITING.md) untuk dokumentasi lengkap implementasi.

---

# Original Setup Guide (Reference)

## Why Rate Limiting?

Rate limiting prevents API abuse by limiting the number of requests a client can make in a time window.

**Without rate limiting:**
```javascript
// Attacker can spam your API
for (let i = 0; i < 100000; i++) {
  fetch('https://api.yourdomain.com/orders');
}
// Result: Server overload, potential crash
```

**With rate limiting:**
```javascript
// After 100 requests in 1 minute
fetch('https://api.yourdomain.com/orders');
// Response: 429 Too Many Requests
```

## Installation

```bash
cd apps/api
bun add @elysiajs/rate-limit
```

## Implementation

### Basic Setup

```typescript
// apps/api/src/index.ts
import { Elysia } from "elysia";
import { rateLimit } from "@elysiajs/rate-limit";

const app = new Elysia()
  .use(rateLimit({
    duration: 60000, // 1 minute window
    max: 100,        // 100 requests per window
    errorResponse: 'Too many requests, please try again later'
  }))
  // ... rest of your routes
```

### Advanced Setup (Recommended)

```typescript
// apps/api/src/index.ts
import { Elysia } from "elysia";
import { rateLimit } from "@elysiajs/rate-limit";
import { env } from "./config/env";

const app = new Elysia()
  .use(rateLimit({
    // Different limits for dev vs production
    duration: 60000, // 1 minute
    max: env.nodeEnv === 'production' ? 100 : 1000, // Stricter in production
    
    // Custom error response
    errorResponse: {
      success: false,
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60 // seconds
    },
    
    // Skip rate limiting for health checks
    skip: (request) => {
      return request.url.includes('/health');
    }
  }))
  // ... rest of your routes
```

### Per-Route Rate Limiting

```typescript
// Different limits for different endpoints
const app = new Elysia()
  // Global rate limit (loose)
  .use(rateLimit({
    duration: 60000,
    max: 200
  }))
  
  // Strict limit for expensive operations
  .post('/orders/sync', async ({ body }) => {
    // This endpoint is expensive, add stricter limit
  }, {
    beforeHandle: rateLimit({
      duration: 60000,
      max: 10 // Only 10 syncs per minute
    })
  })
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | number | 60000 | Time window in milliseconds |
| `max` | number | 10 | Max requests per window |
| `errorResponse` | string/object | "Too Many Requests" | Response when limit exceeded |
| `skip` | function | undefined | Function to skip rate limiting for certain requests |
| `generator` | function | IP-based | Custom key generator (e.g., by user ID) |

## Recommended Limits

### By Endpoint Type

| Endpoint Type | Requests/Minute | Reason |
|---------------|-----------------|--------|
| **Read (GET)** | 100-200 | Frequent reads are normal |
| **Write (POST/PUT)** | 30-50 | Writes are more expensive |
| **Auth** | 5-10 | Prevent brute force |
| **Sync/Batch** | 5-10 | Very expensive operations |
| **Health Check** | Unlimited | Monitoring needs frequent checks |

### Example Configuration

```typescript
const app = new Elysia()
  // Global limit (read operations)
  .use(rateLimit({
    duration: 60000,
    max: 100
  }))
  
  // Auth endpoints (strict)
  .group('/auth', (app) => 
    app
      .use(rateLimit({
        duration: 60000,
        max: 5
      }))
      .post('/login', loginHandler)
      .post('/register', registerHandler)
  )
  
  // Sync endpoints (very strict)
  .group('/sync', (app) =>
    app
      .use(rateLimit({
        duration: 60000,
        max: 10
      }))
      .post('/force', forceSyncHandler)
  )
```

## Testing

### Test Rate Limiting Works

```bash
# Send 101 requests in 1 minute
for i in {1..101}; do
  curl http://localhost:3000/orders
  echo "Request $i"
done

# Request 101 should return 429 Too Many Requests
```

### Test with Script

```javascript
// test-rate-limit.js
async function testRateLimit() {
  const results = { success: 0, rateLimited: 0 };
  
  for (let i = 0; i < 101; i++) {
    const res = await fetch('http://localhost:3000/orders');
    
    if (res.status === 429) {
      results.rateLimited++;
    } else {
      results.success++;
    }
  }
  
  console.log('Results:', results);
  // Expected: { success: 100, rateLimited: 1 }
}

testRateLimit();
```

## Monitoring

### Log Rate Limit Events

```typescript
.use(rateLimit({
  duration: 60000,
  max: 100,
  onLimit: (request) => {
    console.warn(`[RATE-LIMIT] IP ${request.headers.get('x-forwarded-for')} exceeded limit`);
  }
}))
```

### Track Rate Limit Metrics

```typescript
let rateLimitHits = 0;

.use(rateLimit({
  duration: 60000,
  max: 100,
  onLimit: () => {
    rateLimitHits++;
  }
}))

// Expose metrics endpoint
.get('/metrics', () => ({
  rateLimitHits
}))
```

## Production Considerations

### 1. Use Redis for Distributed Systems

If you have multiple API servers:

```typescript
import { rateLimit } from "@elysiajs/rate-limit";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

.use(rateLimit({
  duration: 60000,
  max: 100,
  // Use Redis for shared state across servers
  store: {
    get: (key) => redis.get(key),
    set: (key, value, ttl) => redis.setex(key, ttl, value)
  }
}))
```

### 2. Whitelist Trusted IPs

```typescript
.use(rateLimit({
  duration: 60000,
  max: 100,
  skip: (request) => {
    const ip = request.headers.get('x-forwarded-for');
    const trustedIPs = ['1.2.3.4', '5.6.7.8']; // Your monitoring service IPs
    return trustedIPs.includes(ip);
  }
}))
```

### 3. Custom Key Generator (Per User)

```typescript
.use(rateLimit({
  duration: 60000,
  max: 100,
  generator: (request) => {
    // Rate limit by user ID instead of IP
    const userId = request.headers.get('x-user-id');
    return userId || request.headers.get('x-forwarded-for');
  }
}))
```

## Troubleshooting

### Issue: Rate limit too strict

**Symptom:** Legitimate users getting blocked

**Solution:** Increase `max` or `duration`

```typescript
// Before
max: 50

// After
max: 100
```

### Issue: Rate limit not working

**Symptom:** Can send unlimited requests

**Solution:** Check if rate-limit middleware is registered before routes

```typescript
// ❌ Wrong order
app
  .get('/orders', handler)
  .use(rateLimit({ ... })) // Too late!

// ✅ Correct order
app
  .use(rateLimit({ ... })) // First!
  .get('/orders', handler)
```

### Issue: Health checks getting rate limited

**Solution:** Skip health check endpoint

```typescript
.use(rateLimit({
  skip: (request) => request.url.includes('/health')
}))
```

## Security Best Practices

### ✅ DO:
- Use rate limiting in production
- Set appropriate limits per endpoint type
- Log rate limit violations
- Monitor rate limit metrics
- Whitelist trusted IPs (monitoring services)

### ❌ DON'T:
- Set limits too low (blocks legitimate users)
- Set limits too high (doesn't prevent abuse)
- Forget to skip health checks
- Use same limit for all endpoints
- Ignore rate limit logs (they indicate attacks)

## FAQ

**Q: What's a good default rate limit?**  
A: 100 requests per minute for most APIs.

**Q: Should I rate limit health checks?**  
A: No, monitoring services need frequent checks.

**Q: Can attackers bypass rate limiting?**  
A: They can use multiple IPs, but it makes attacks much harder and more expensive.

**Q: Does rate limiting affect performance?**  
A: Minimal impact (< 1ms per request).

**Q: Should I use different limits for authenticated users?**  
A: Yes, authenticated users can have higher limits.
