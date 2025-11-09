# Authentication Troubleshooting

## Issues Fixed

### 1. Login/Signup Not Working

**Problem**: Authentication wasn't working because of missing configuration.

**Solutions Applied**:

1. **Added `baseURL` to server auth config** (`lib/auth.ts`)
   - Better Auth requires a `baseURL` to know where to send requests

2. **Fixed client baseURL** (`lib/auth-client.ts`)
   - Changed to use `window.location.origin` in the browser
   - This ensures it works regardless of the actual URL

3. **Added required environment variables** (`.env.local`)
   - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
   - `BETTER_AUTH_SECRET=<generated-secret>`
   - Microsoft OAuth variables (optional)

4. **Generated secure secret**
   - Used `openssl rand -base64 32` to generate a cryptographically secure secret

## After These Changes

**You MUST restart the dev server** for the environment variables to take effect:

```bash
# Stop the current dev server (Ctrl+C)
cd web-next
pnpm dev
```

## Testing Authentication

After restarting:

1. Navigate to http://localhost:3000
2. You'll be redirected to `/login`
3. Click "Sign up" to create a new account
4. Fill in:
   - Full Name
   - Email (e.g., `test@example.com`)
   - Password (min 8 characters)
5. Click "Create account"
6. You should be automatically logged in and redirected to `/dashboard`

## Common Issues

### "Module not found: better-auth"
- Run `pnpm install` in the `web-next` directory

### "Database error" or "Table not found"
- Run the migration: `sqlite3 ../stuco.db < migrations/better_auth_schema.sql`

### Microsoft OAuth not working
- You need to configure Azure AD credentials in `.env.local`
- See `AUTH_SETUP.md` for detailed Microsoft OAuth setup

### Session not persisting
- Check that cookies are enabled in your browser
- Check that `BETTER_AUTH_SECRET` is set in `.env.local`

### "CORS error" or "Origin not allowed"
- Verify `NEXT_PUBLIC_APP_URL` matches your actual URL
- Check `trustedOrigins` in `lib/auth.ts`

## Environment Variables Reference

Required in `.env.local`:

```env
# Database path
DATABASE_PATH=/home/qiss/stuco/stuco.db

# App URL (must match your actual URL)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Better Auth secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your_generated_secret_here

# Microsoft OAuth (optional)
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
```

## Debugging Tips

1. **Check browser console** (F12) for JavaScript errors
2. **Check Network tab** (F12) to see API requests to `/api/auth/*`
3. **Check server logs** in the terminal where `pnpm dev` is running
4. **Verify database tables exist**:
   ```bash
   sqlite3 ../stuco.db "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user', 'session', 'account', 'verification');"
   ```

## Success Indicators

When working correctly, you should see:
- ✅ No errors in browser console
- ✅ POST request to `/api/auth/sign-up/email` returns 200
- ✅ Automatic redirect to `/dashboard` after signup
- ✅ User appears in the sidebar with their name
- ✅ Logout works and redirects to `/login`

