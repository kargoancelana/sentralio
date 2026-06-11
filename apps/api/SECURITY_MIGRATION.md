# Security Migration: Partner Key Encryption

## Overview

This migration encrypts the `partner_key` field in the `shopee_credentials` table to improve security. Previously, only `access_token` and `refresh_token` were encrypted, but `partner_key` was stored in plaintext.

## Why This Matters

The `partner_key` is a **master key** for Shopee API access. If it's compromised:
- ❌ Attackers can generate valid API signatures
- ❌ Attackers can refresh tokens
- ❌ Attackers can access all shop data
- ❌ Attackers can perform actions on behalf of your shop

## What Changed

### Before (Insecure)
```sql
-- Database backup
partnerKey: "my_partner_key_plaintext"  -- ❌ PLAINTEXT
accessToken: "a1b2c3:encrypted_hex"     -- ✅ ENCRYPTED
refreshToken: "d4e5f6:encrypted_hex"    -- ✅ ENCRYPTED
```

### After (Secure)
```sql
-- Database backup
partnerKey: "g7h8i9:encrypted_hex"      -- ✅ ENCRYPTED
accessToken: "a1b2c3:encrypted_hex"     -- ✅ ENCRYPTED
refreshToken: "d4e5f6:encrypted_hex"    -- ✅ ENCRYPTED
```

## Migration Steps

### 1. Validate TOKEN_SECRET_KEY

Your `TOKEN_SECRET_KEY` in `.env` **MUST be exactly 32 bytes** (64 hex characters).

**Generate a secure key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Update `.env`:**
```env
TOKEN_SECRET_KEY=your_generated_64_character_hex_string_here
```

### 2. Deploy Code Changes

The code changes are already applied:
- ✅ `shopee-auth.ts` - Decrypt `partnerKey` when reading
- ✅ `shopee-auth.route.ts` - Encrypt `partnerKey` when inserting
- ✅ `seed.ts` - Encrypt `partnerKey` in seed data
- ✅ `crypto.ts` - Validate key length

### 3. Run Migration Script

**⚠️ IMPORTANT: Backup your database first!**

```bash
# Backup database
mysqldump -u root -p sentralio > backup_before_migration.sql

# Run migration
cd apps/api
bun run migrate-encrypt-partner-key.ts
```

**Expected output:**
```
[migrate] Starting partner_key encryption migration...
[migrate] Found 1 credential(s) to migrate.
[migrate] Shop 67890: partner_key encrypted successfully.

[migrate] Migration complete!
  - Migrated: 1
  - Skipped (already encrypted): 0
  - Errors: 0

[migrate] ✅ All credentials migrated successfully!
```

### 4. Verify Migration

**Check database:**
```sql
SELECT id, shop_id, 
       LEFT(partner_key, 20) as partner_key_preview,
       LEFT(access_token, 20) as access_token_preview
FROM shopee_credentials;
```

**Expected result:**
```
partner_key_preview: "a1b2c3d4e5f6:7890ab..."  -- Contains ":" = encrypted
access_token_preview: "g7h8i9j0k1l2:3456mn..."  -- Contains ":" = encrypted
```

### 5. Test Application

```bash
# Start server
bun run dev

# Test token refresh (should work normally)
curl http://localhost:3000/shopee/credentials/status
```

## Rollback (If Needed)

If something goes wrong:

```bash
# Restore database backup
mysql -u root -p sentralio < backup_before_migration.sql

# Revert code changes (git)
git revert HEAD
```

## Security Checklist

After migration:
- [ ] `TOKEN_SECRET_KEY` is exactly 32 bytes
- [ ] Database backup created
- [ ] Migration script ran successfully
- [ ] All `partner_key` values contain ":" (encrypted format)
- [ ] Application starts without errors
- [ ] Token refresh works correctly
- [ ] API calls to Shopee work correctly

## FAQ

**Q: Will this break existing functionality?**  
A: No. The code automatically decrypts `partner_key` when needed. Everything works the same, just more secure.

**Q: Do I need to re-connect my Shopee shop?**  
A: No. Existing credentials are migrated automatically.

**Q: What if I add a new shop after migration?**  
A: New shops will automatically have encrypted `partner_key` (code already updated).

**Q: Is this migration reversible?**  
A: Yes, via database backup. But there's no reason to reverse it (encryption is always better).

## Support

If you encounter issues:
1. Check `TOKEN_SECRET_KEY` is exactly 32 bytes
2. Check database backup exists
3. Check migration script output for errors
4. Restore from backup if needed
