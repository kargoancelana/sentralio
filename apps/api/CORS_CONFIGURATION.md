# CORS Configuration Guide

## Overview

CORS (Cross-Origin Resource Sharing) controls which domains can access your API. This is critical for security in production.

## Current Configuration

### Development Mode
```typescript
NODE_ENV=development
FRONTEND_URL=  // Empty or not set

// Allows:
- http://localhost:5173
- http://localhost:3000
- http://localhost:5175
```

### Production Mode
```typescript
NODE_ENV=production
FRONTEND_URL=https://wms.yourdomain.com

// Allows:
- https://wms.yourdomain.com (only)
```

## How It Works

The API automatically switches CORS configuration based on `NODE_ENV`:

```typescript
// apps/api/src/index.ts
.use(cors({
  origin: env.nodeEnv === 'production' 
    ? [env.frontendUrl] // Production: Whitelist specific domain
    : ["http://localhost:5173", ...], // Development: Allow localhost
  credentials: true,
}))
```

## Setup for Production

### Step 1: Deploy Frontend

Deploy your frontend to a hosting service:
- **Vercel**: `https://wms-app.vercel.app`
- **Netlify**: `https://wms-app.netlify.app`
- **Custom Domain**: `https://wms.yourdomain.com`

### Step 2: Update .env

```env
NODE_ENV=production
FRONTEND_URL=https://wms.yourdomain.com
```

### Step 3: Deploy Backend

Deploy your backend with the updated `.env` file.

### Step 4: Test

```bash
# From browser console on your frontend
fetch('https://api.yourdomain.com/health')
  .then(r => r.json())
  .then(console.log)

// Should work without CORS errors
```

## Multiple Domains (Optional)

If you need to allow multiple domains (e.g., staging + production):

```typescript
// apps/api/src/index.ts
.use(cors({
  origin: env.nodeEnv === 'production' 
    ? [
        "https://wms.yourdomain.com",      // Production
        "https://wms-staging.yourdomain.com" // Staging
      ]
    : ["http://localhost:5173", "http://localhost:3000", "http://localhost:5175"],
  credentials: true,
}))
```

## Security Best Practices

### ✅ DO:
- Use specific domain whitelist in production
- Use HTTPS in production (not HTTP)
- Keep `credentials: true` for cookie/auth support
- Test CORS before deploying

### ❌ DON'T:
- **NEVER** use `origin: "*"` in production (allows all domains)
- **NEVER** hardcode localhost in production
- **NEVER** allow HTTP in production (use HTTPS)

## Troubleshooting

### Error: "CORS policy blocked"

**Cause:** Frontend domain not in whitelist.

**Solution:**
1. Check `FRONTEND_URL` in `.env`
2. Make sure it matches your frontend domain exactly
3. Include protocol (`https://`) and no trailing slash

**Example:**
```env
# ❌ Wrong
FRONTEND_URL=wms.yourdomain.com
FRONTEND_URL=https://wms.yourdomain.com/

# ✅ Correct
FRONTEND_URL=https://wms.yourdomain.com
```

### Error: "Credentials not supported if origin is *"

**Cause:** Using `origin: "*"` with `credentials: true`.

**Solution:** Use specific domain whitelist instead of `"*"`.

### Frontend and Backend on Same Domain

If your frontend and backend are on the same domain:
```
Frontend: https://yourdomain.com
Backend:  https://yourdomain.com/api
```

You **don't need CORS** because it's same-origin. But keeping the config doesn't hurt.

## Testing

### Test Development Mode

```bash
# Start backend
cd apps/api
bun run dev

# Start frontend
cd apps/web
bun run dev

# Should work without CORS errors
```

### Test Production Mode

```bash
# Set production mode
NODE_ENV=production
FRONTEND_URL=https://your-deployed-frontend.com

# Start backend
bun run dev

# Test from browser console on your frontend
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(console.log)

// Should work if FRONTEND_URL matches
```

## Environment Variables Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `production` | Environment mode (default: `development`) |
| `FRONTEND_URL` | Production only | `https://wms.yourdomain.com` | Frontend domain for CORS whitelist |

## FAQ

**Q: Do I need to restart the server after changing FRONTEND_URL?**  
A: Yes, environment variables are loaded at startup.

**Q: Can I allow multiple frontend domains?**  
A: Yes, modify the code to include multiple domains in the array.

**Q: What if I don't set FRONTEND_URL in production?**  
A: It will default to `https://yourdomain.com` (you should change this).

**Q: Is CORS needed if frontend and backend are on same domain?**  
A: No, but it doesn't hurt to keep the config.

**Q: Can I disable CORS?**  
A: Not recommended. CORS is a security feature. If you disable it, any website can access your API.
