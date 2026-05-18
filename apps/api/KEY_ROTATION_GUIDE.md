# Encryption Key Rotation Guide

## Overview

Key rotation is the process of replacing your encryption key with a new one. This improves security by limiting the impact of a compromised key.

## Why Rotate Keys?

### Without Rotation
```
2024: Encrypt with KEY_V1
2025: Still using KEY_V1
2026: KEY_V1 compromised! ❌
      → All data from 2024-2026 can be decrypted
```

### With Rotation
```
2024: Encrypt with KEY_V1
2025: Rotate to KEY_V2, re-encrypt all data
2026: KEY_V1 compromised! ⚠️
      → Only 2024 data at risk
      → 2025-2026 data SAFE (uses KEY_V2)
```

## When to Rotate

Rotate your encryption key when:
- ✅ **Scheduled rotation** (every 6-12 months recommended)
- ✅ **Key compromise suspected** (immediate rotation required)
- ✅ **Employee departure** (if they had access to keys)
- ✅ **Security audit recommendation**
- ✅ **Compliance requirement** (some regulations require rotation)

## How Key Rotation Works

### Current System (No Rotation)
```typescript
// Only one key
TOKEN_SECRET_KEY=abc123...

// All data encrypted with same key
accessToken: "iv:encrypted_with_abc123"
```

### With Rotation Support
```typescript
// Multiple keys (new + old)
TOKEN_SECRET_KEY=xyz789...      // v2 (current, for encryption)
TOKEN_SECRET_KEY_V1=abc123...   // v1 (old, for decryption only)

// New data uses v2
accessToken: "v2:iv:encrypted_with_xyz789"

// Old data still readable with v1
oldAccessToken: "v1:iv:encrypted_with_abc123"
```

## Step-by-Step Rotation Process

### Step 1: Backup Database

**CRITICAL: Always backup before rotation!**

```bash
mysqldump -u root -p wms_sync > backup_before_rotation_$(date +%Y%m%d).sql
```

### Step 2: Generate New Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
f1e2d3c4b5a6978869504132a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2
```

### Step 3: Update .env

```env
# NEW: Current key (v2) - for encryption
TOKEN_SECRET_KEY=f1e2d3c4b5a6978869504132a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2

# OLD: Previous key (v1) - for decryption only
TOKEN_SECRET_KEY_V1=e5ed092cb1b416f847666fe0679ae71861612f1541e59997adf5611c934d91e7
```

### Step 4: Update Crypto Import

Replace the old crypto import with the rotation-aware version:

```typescript
// OLD (no rotation support)
import { encrypt, decrypt } from "./utils/crypto";

// NEW (with rotation support)
import { encrypt, decrypt } from "./utils/crypto-rotation";
```

**Files to update:**
- `apps/api/src/services/shopee-auth.ts`
- `apps/api/src/modules/shopee/shopee-auth.route.ts`
- `apps/api/src/db/seed.ts`
- Any other files using encrypt/decrypt

### Step 5: Test Application

```bash
# Start server
cd apps/api
bun run dev

# Should start without errors
# Old encrypted data should still be readable
```

### Step 6: Run Rotation Migration

```bash
cd apps/api
bun run migrate-rotate-encryption-key.ts
```

**Expected output:**
```
[rotate] Starting encryption key rotation...
[rotate] Key info: { currentVersion: 2, availableVersions: [2, 1], totalKeys: 2 }
[rotate] Found 2 credential(s) to check.
[rotate] Shop 181462922: Re-encrypting accessToken...
[rotate] Shop 181462922: Re-encrypting refreshToken...
[rotate] Shop 181462922: Re-encrypting partnerKey...
[rotate] Shop 181462922: ✅ Re-encrypted successfully.
[rotate] Shop 1128703753: Re-encrypting accessToken...
[rotate] Shop 1128703753: Re-encrypting refreshToken...
[rotate] Shop 1128703753: Re-encrypting partnerKey...
[rotate] Shop 1128703753: ✅ Re-encrypted successfully.

[rotate] Key rotation complete!
  - Re-encrypted: 2
  - Skipped (already latest): 0
  - Errors: 0

[rotate] ✅ All credentials rotated successfully!
```

### Step 7: Verify

```bash
# Check database - all encrypted values should start with "v2:"
mysql -u root -p wms_sync -e "SELECT id, shop_id, LEFT(access_token, 10) FROM shopee_credentials;"

# Expected:
# access_token starts with "v2:..."
```

### Step 8: Test Application Again

```bash
# Restart server
bun run dev

# Test API calls
curl http://localhost:3000/shopee/credentials/status

# Should work normally
```

### Step 9: Remove Old Key (After 30 Days)

After confirming everything works for 30 days:

```env
# Remove TOKEN_SECRET_KEY_V1
TOKEN_SECRET_KEY=f1e2d3c4b5a6978869504132a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2
# TOKEN_SECRET_KEY_V1=...  ← Remove this line
```

**Why wait 30 days?**
- Allows time to detect any issues
- Ensures all old encrypted data has been re-encrypted
- Provides rollback window if needed

## Rollback Procedure

If something goes wrong:

### Option 1: Restore from Backup

```bash
# Stop server
# Restore database
mysql -u root -p wms_sync < backup_before_rotation_20240507.sql

# Revert .env
TOKEN_SECRET_KEY=e5ed092cb1b416f847666fe0679ae71861612f1541e59997adf5611c934d91e7
# Remove TOKEN_SECRET_KEY_V1

# Restart server
bun run dev
```

### Option 2: Keep Both Keys

If rotation failed but some data was re-encrypted:

```env
# Keep both keys
TOKEN_SECRET_KEY=f1e2d3c4b5a6978869504132a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2
TOKEN_SECRET_KEY_V1=e5ed092cb1b416f847666fe0679ae71861612f1541e59997adf5611c934d91e7

# System will decrypt with appropriate key based on version
```

## Rotation Schedule

### Recommended Schedule

| Scenario | Frequency |
|----------|-----------|
| **Normal operations** | Every 12 months |
| **High security** | Every 6 months |
| **After incident** | Immediately |
| **Compliance requirement** | As required (e.g., PCI-DSS: annually) |

### Automation (Future Enhancement)

Consider automating rotation:
```typescript
// Pseudo-code
if (keyAge > 365 days) {
  sendAlert("Encryption key rotation recommended");
}
```

## Security Best Practices

### ✅ DO:
- Backup database before rotation
- Test thoroughly after rotation
- Keep old key for 30 days minimum
- Document rotation date and reason
- Use strong random keys (32 bytes)
- Store keys securely (environment variables, not code)

### ❌ DON'T:
- Rotate without backup
- Delete old key immediately
- Reuse old keys
- Share keys via email/chat
- Commit keys to git
- Use weak/predictable keys

## Monitoring

### Check Key Version Distribution

```sql
-- Check how many records use each key version
SELECT 
  CASE 
    WHEN access_token LIKE 'v2:%' THEN 'v2'
    WHEN access_token LIKE 'v1:%' THEN 'v1'
    ELSE 'legacy'
  END as key_version,
  COUNT(*) as count
FROM shopee_credentials
GROUP BY key_version;
```

### Expected After Rotation
```
key_version | count
------------|------
v2          | 2
```

## Troubleshooting

### Error: "Encryption key version X not found"

**Cause:** Trying to decrypt data encrypted with a key that's not in .env

**Solution:** Add the missing key version to .env:
```env
TOKEN_SECRET_KEY_V1=old_key_here
```

### Error: "Invalid encrypted format"

**Cause:** Corrupted encrypted data

**Solution:** Restore from backup

### Some Records Not Re-encrypted

**Cause:** Migration script failed partway

**Solution:** Re-run migration script (it's idempotent - safe to run multiple times)

## FAQ

**Q: How long does rotation take?**  
A: Usually < 1 minute for small databases. Scales with number of credentials.

**Q: Will rotation cause downtime?**  
A: No. The system supports both old and new keys simultaneously.

**Q: Can I rotate multiple times?**  
A: Yes. Each rotation increments the version number (v1 → v2 → v3, etc.)

**Q: What if I lose the old key?**  
A: Old encrypted data cannot be decrypted. Always keep backups!

**Q: Do I need to rotate partner_key from Shopee?**  
A: No. This rotates the encryption key, not the Shopee API keys.

## Support

If you encounter issues during rotation:
1. Check logs for specific error messages
2. Verify .env configuration
3. Ensure database backup exists
4. Consider rollback if critical
