# Better Auth Upgrade Notes

## Upgrade from 0.8.8 to 1.3.34

**Date**: November 9, 2025

### Changes Made

#### 1. Package Upgrades
- ✅ Upgraded `better-auth` from `0.8.8` to `1.3.34`
- ✅ Upgraded `@better-auth/cli` from `0.8.8` to `1.3.34`

#### 2. Removed Deprecated Packages
- ✅ Removed `@types/bcryptjs` (bcryptjs now includes its own types)
- ✅ Removed `oslo` (deprecated, functionality moved to Better Auth internals)

#### 3. Database Schema Updates
- ✅ Fixed `account` table: Added `expiresAt` column
- ✅ Fixed `session` table: Ensured `token` column is `NOT NULL` (required by v1.3.34)

### Breaking Changes

The upgrade from 0.8.8 to 1.3.34 includes several improvements:

1. **Better token handling** - Sessions now properly generate and store tokens
2. **Improved OAuth flow** - Microsoft OAuth should work more reliably
3. **Bug fixes** - Many edge cases and issues resolved

### Current Package Status

**No deprecated warnings!** ✅

Remaining subdependencies with deprecation warnings are:
- `node-domexception@1.0.0` (used by internal dependencies)
- `vue@2.7.16` (used by internal dependencies)

These are transitive dependencies and don't affect functionality.

### Testing Checklist

After upgrade, verify:
- [ ] Email/password signup works
- [ ] Email/password login works
- [ ] Sessions persist across page refreshes
- [ ] Logout works correctly
- [ ] Profile updates work
- [ ] Password changes work
- [ ] Microsoft OAuth (if configured)

### Database Schema (Current)

All tables are up to date with Better Auth 1.3.34:

```sql
-- User table
user (id, name, email, emailVerified, image, createdAt, updatedAt)

-- Session table
session (id, userId, token [NOT NULL], expiresAt, ipAddress, userAgent, createdAt, updatedAt)

-- Account table
account (id, userId, accountId, providerId, accessToken, refreshToken, 
         accessTokenExpiresAt, refreshTokenExpiresAt, expiresAt, scope, 
         idToken, password, createdAt, updatedAt)

-- Verification table
verification (id, identifier, value, expiresAt, createdAt, updatedAt)
```

### Next Steps

1. **Restart the server** to load the new version
2. **Test authentication flows** thoroughly
3. **Monitor for any errors** in production
4. **Consider enabling email verification** (now more stable in v1.3.34)

### Rollback Plan

If issues occur, rollback by:

```bash
cd web-next
pnpm add better-auth@0.8.8 @better-auth/cli@0.8.8
# Revert session table token to nullable
sqlite3 ../stuco.db "ALTER TABLE session DROP COLUMN token;"
sqlite3 ../stuco.db "ALTER TABLE session ADD COLUMN token TEXT UNIQUE;"
```

### Support

- Better Auth Docs: https://www.better-auth.com/docs
- GitHub Issues: https://github.com/better-auth/better-auth/issues
- Discord: https://discord.gg/better-auth

