# Rate Limiting Implementation

## Overview

Rate limiting telah diimplementasikan untuk melindungi API dari penyalahgunaan, serangan DDoS, dan memastikan kualitas layanan untuk semua pengguna.

## Configuration

### Global Rate Limit
- **Limit**: 100 requests per minute per IP address
- **Window**: 60 seconds (1 minute)
- **Identifier**: IP address
- **Response**: HTTP 429 (Too Many Requests)

### Implementation Details

```typescript
// apps/api/src/index.ts
import { rateLimit } from "elysia-rate-limit";

app.use(rateLimit({
  duration: 60000,        // 1 minute window
  max: 100,               // 100 requests per minute
  errorResponse: {
    success: false,
    message: "Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.",
    error: "RATE_LIMIT_EXCEEDED"
  },
  generator: (req, server) => {
    // Use IP address as identifier
    return server?.requestIP(req)?.address || 'unknown';
  },
  skip: (req) => {
    // Skip rate limiting for health check endpoint
    return req.url.endsWith('/health');
  }
}));
```

## How It Works

### Request Flow

```
┌─────────────────────────────────────────────────────────┐
│ Client (IP: 192.168.1.1)                                │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Request 1-100
                    ▼
┌─────────────────────────────────────────────────────────┐
│ Rate Limiter                                            │
│ - Check: 192.168.1.1 → 99 requests in last 60s         │
│ - Decision: ALLOW (under limit)                         │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ API Handler                                             │
│ - Process request                                       │
│ - Return response                                       │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
            ✅ HTTP 200 OK


┌─────────────────────────────────────────────────────────┐
│ Client (IP: 192.168.1.1)                                │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Request 101
                    ▼
┌─────────────────────────────────────────────────────────┐
│ Rate Limiter                                            │
│ - Check: 192.168.1.1 → 100 requests in last 60s        │
│ - Decision: BLOCK (exceeded limit)                      │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
            🚫 HTTP 429 Too Many Requests
            {
              "success": false,
              "message": "Terlalu banyak permintaan...",
              "error": "RATE_LIMIT_EXCEEDED"
            }
```

### Counter Reset

- Counter direset setelah 60 detik dari request pertama
- Setiap IP address memiliki counter terpisah
- Counter disimpan di memory (in-memory storage)

## Testing

### Quick Test

```bash
# Test rate limiting (sends 105 requests, expects 5 to be blocked)
bun run test-rate-limit-quick.ts
```

**Expected Output:**
```
✅ Rate limiting WORKING!
   Limit: 100 requests/minute
   First 100 succeeded, then blocked 5
```

### Full Test (with reset verification)

```bash
# Test rate limiting with 60s wait to verify reset
bun run test-rate-limit.ts
```

## Error Response

When rate limit is exceeded, API returns:

```json
{
  "success": false,
  "message": "Terlalu banyak permintaan. Silakan coba lagi dalam beberapa saat.",
  "error": "RATE_LIMIT_EXCEEDED"
}
```

**HTTP Status**: `429 Too Many Requests`

## Exemptions

The following endpoints are **exempt** from rate limiting:

- `/health` - Health check endpoint (for monitoring)

## Frontend Handling

Frontend harus menangani error 429 dengan:

1. **Tampilkan pesan error** yang user-friendly
2. **Retry dengan exponential backoff**
3. **Disable button** sementara untuk mencegah spam

### Example Frontend Code

```typescript
async function apiCall(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const data = await response.json();
      
      // Show user-friendly error
      toast.error(data.message || "Terlalu banyak permintaan. Tunggu sebentar.");
      
      // Wait 60 seconds before allowing retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Retry request
      return apiCall(url, options);
    }
    
    return response;
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
}
```

## Production Considerations

### Current Configuration (Development & Production)

- **Global limit**: 100 requests/minute per IP
- **Storage**: In-memory (resets on server restart)
- **Identifier**: IP address

### Recommended Adjustments for Production

1. **Use Redis for distributed rate limiting** (if using multiple servers)
   ```typescript
   // Future: Use Redis store for multi-server setup
   import { RedisStore } from "elysia-rate-limit-redis";
   ```

2. **Different limits per endpoint type**
   ```typescript
   // Example: Stricter limits for sensitive endpoints
   - Login: 5 requests/minute
   - Sync orders: 10 requests/minute
   - Get orders: 100 requests/minute
   ```

3. **Whitelist trusted IPs** (optional)
   ```typescript
   skip: (req) => {
     const ip = server?.requestIP(req)?.address;
     const trustedIPs = ['192.168.1.100', '10.0.0.1'];
     return trustedIPs.includes(ip);
   }
   ```

## Monitoring

### Log Rate Limit Events

Rate limit events are automatically logged:

```
[rate-limit] IP 192.168.1.1 exceeded limit (100 requests in 60s)
```

### Metrics to Monitor

1. **Rate limit hit rate**: Berapa sering rate limit triggered
2. **Top offending IPs**: IP mana yang paling sering kena rate limit
3. **Endpoint distribution**: Endpoint mana yang paling sering di-hit

## Security Benefits

✅ **Prevents DDoS attacks**: Membatasi request dari single IP
✅ **Prevents brute force**: Membatasi login attempts
✅ **Prevents API abuse**: Mencegah scraping/crawling berlebihan
✅ **Ensures fair usage**: Semua user mendapat akses yang adil
✅ **Reduces server load**: Mencegah overload dari spam requests
✅ **Saves costs**: Mengurangi bandwidth dan CPU usage

## Troubleshooting

### Issue: Legitimate users getting rate limited

**Solution**: Increase the limit or adjust the window
```typescript
max: 200,           // Increase to 200 requests/minute
duration: 60000,    // Keep 1 minute window
```

### Issue: Rate limit not working

**Verification**:
```bash
# Run test script
bun run test-rate-limit-quick.ts

# Expected: Some requests should be blocked (HTTP 429)
```

### Issue: Rate limit resets too quickly

**Solution**: Increase the window duration
```typescript
duration: 120000,   // 2 minutes instead of 1 minute
```

## Related Documentation

- [Security Migration Guide](./SECURITY_MIGRATION.md)
- [CORS Configuration](./CORS_CONFIGURATION.md)
- [Key Rotation Guide](./KEY_ROTATION_GUIDE.md)

## Package Information

- **Package**: `elysia-rate-limit`
- **Version**: `^4.6.1`
- **Repository**: https://github.com/rayriffy/elysia-rate-limit
- **License**: MIT

## Summary

Rate limiting telah berhasil diimplementasikan dengan konfigurasi:
- ✅ 100 requests per minute per IP
- ✅ HTTP 429 response untuk exceeded requests
- ✅ Health check endpoint dikecualikan
- ✅ Tested dan verified working

Web kamu sekarang terlindungi dari API abuse dan serangan DDoS! 🛡️
