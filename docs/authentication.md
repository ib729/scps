# Authentication Guide

This project uses [Better Auth](https://www.better-auth.com/) for authentication with email/password and Microsoft OAuth support.

## Overview

The authentication system provides:
- **Email/Password Authentication**: Sign up and login with credentials
- **Microsoft OAuth**: Sign in with Microsoft account
- **Session Management**: Secure session handling with cookies
- **Profile Management**: Update name and profile picture
- **Password Management**: Change password with verification
- **Protected Routes**: All app routes require authentication
- **Signup Code Protection**: Prevents unauthorized account creation

## Prerequisites

1. Node.js 20+ and pnpm installed
2. SQLite database (`stuco.db`) initialized
3. Web UI setup completed (see [Getting Started](getting-started.md))

## Environment Variables

Create a `.env.local` file in the `web-next` directory:

```env
# Database
DATABASE_PATH=../stuco.db

# App URL (must match your actual URL)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Better Auth Secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your_secret_key_here

# Microsoft OAuth (optional)
MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret_here
```

### Generating Secrets

**Better Auth Secret:**
```bash
openssl rand -base64 32
```

**Production**: Use different secrets for dev and production environments.

## Database Setup

### Better Auth Tables

The authentication system requires additional database tables:
- `user` - User accounts with email, name, image
- `session` - Active user sessions
- `account` - OAuth and credential accounts
- `verification` - Email verification and password reset tokens

**Automatic Setup**: These tables are automatically created when you run `python init_db.py` or any database reset script.

**Manual Migration** (if needed):

If you have an existing database without Better Auth tables, you can add them manually:

```bash
cd web-next
sqlite3 ../stuco.db < migrations/better_auth_schema.sql
```

Or using pnpm:

```bash
cd web-next
pnpm auth:migrate
```

**Note**: The migration script is idempotent and safe to run multiple times.

### Schema Details

```sql
-- User table
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Session table
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

-- Additional tables: account, verification
-- See migrations/better_auth_schema.sql for full schema
```

## Signup Code Protection

The signup page requires an 8-digit code to create new accounts, adding an extra layer of security to prevent unauthorized signups.

### How Signup Code Works

1. User fills out signup form (name, email, password)
2. User clicks "Create account"
3. Form switches to OTP input screen
4. User enters the 8-digit code
5. If code matches, account is created
6. If code is wrong, error message is shown

### Alternative Approaches

For enhanced security, consider implementing:

1. **Server-side validation**: Move code validation to a server action
2. **Time-based codes**: Generate codes that expire
3. **Email-based codes**: Send unique codes via email
4. **Admin approval**: Require admin to approve signups
5. **Remove code requirement**: For open signups (not recommended)

## Microsoft OAuth Setup

### Azure AD Configuration

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Configure application:
   - **Name**: Stuco Management System
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: 
     - Type: Web
     - URI: `http://localhost:3000/api/auth/callback/microsoft`
5. Click "Register"
6. Copy the **Application (client) ID** to `MICROSOFT_CLIENT_ID`
7. Navigate to "Certificates & secrets"
8. Create a new client secret
9. Copy the secret value to `MICROSOFT_CLIENT_SECRET`

### Production Configuration

For production deployment:

1. Add production redirect URI:
   - `https://your-domain.com/api/auth/callback/microsoft`
2. Configure trusted domains in Azure AD
3. Set up proper app permissions

## Authentication Routes

### Public Routes
- `/login` - Login page with email/password and Microsoft OAuth
- `/signup` - Signup page with code protection

### Protected Routes
All routes under `app/(app)/` require authentication:
- `/dashboard` - Main dashboard
- `/students` - Student management
- `/transactions` - Transaction history
- `/pos` - Point of sale
- `/topup` - Top-up interface

### Session Guard

The session guard is implemented in `app/(app)/layout.tsx`:

```typescript
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  redirect("/login");
}
```

## Running the App

### Development

```bash
cd web-next
pnpm install
pnpm dev
```

Navigate to `http://localhost:3000` - you'll be redirected to the login page.

### First User Creation

1. Navigate to `/signup`
2. Fill in user details
3. Enter the signup code (default: `12345678`)
4. Account is created and you're automatically logged in

### Production

See [Deployment Guide](deployment.md) for production setup with proper secrets management.

## Features

### User Management
- ✅ Profile updates (name, image)
- ✅ Password changes with current password verification
- ✅ Real-time session data with `useSession` hook
- ✅ User avatar display with fallback initials

### Security
- ✅ Protected routes with session guards
- ✅ Automatic redirect to login for unauthenticated users
- ✅ Secure password hashing (scrypt via Better Auth)
- ✅ Session tokens with expiration
- ✅ CSRF protection
- ✅ Signup code protection

### Session Configuration

```typescript
// web-next/lib/auth.ts
session: {
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5, // 5 minutes
  },
},
advanced: {
  cookiePrefix: "better-auth",
  useSecureCookies: process.env.NODE_ENV === "production",
}
```

## Development Notes

### File Structure

```
web-next/
├── app/
│   ├── (auth)/              # Public auth routes
│   │   ├── layout.tsx       # Minimal layout
│   │   ├── login/page.tsx   # Login page
│   │   └── signup/page.tsx  # Signup page
│   ├── (app)/               # Protected routes
│   │   ├── layout.tsx       # Session guard + sidebar
│   │   └── ...              # App pages
│   └── api/
│       └── auth/
│           └── [...all]/
│               └── route.ts # Better Auth handler
├── lib/
│   ├── auth.ts              # Server auth config
│   └── auth-client.ts       # Client auth instance
└── migrations/
    └── better_auth_schema.sql
```

### Key Files

- **Server Config**: `lib/auth.ts` - Better Auth configuration
- **Client Config**: `lib/auth-client.ts` - Client-side auth hooks
- **API Handler**: `app/api/auth/[...all]/route.ts` - Auth endpoints
- **Session Guard**: `app/(app)/layout.tsx` - Protected route wrapper
- **Login Page**: `app/(auth)/login/page.tsx`
- **Signup Page**: `app/(auth)/signup/page.tsx`

## Troubleshooting

See the [Troubleshooting Guide](troubleshooting.md#authentication-issues) for common authentication issues and solutions.

### Quick Checks

1. **Environment Variables**: Verify all required variables are set in `.env.local`
2. **Database Migration**: Ensure Better Auth tables exist
3. **Secrets**: Generate secure secrets with `openssl rand -base64 32`
4. **Server Restart**: Restart dev server after changing environment variables

## Security Best Practices

### Production Deployment

1. **Change default signup code** immediately
2. **Use environment variables** for all secrets
3. **Enable HTTPS** (Better Auth sets secure cookies in production)
4. **Strong BETTER_AUTH_SECRET** (32+ characters)
5. **Restrict environment file permissions** (`chmod 600 .env.local`)
6. **Different secrets** for dev and production
7. **Regular secret rotation** (document procedure)

### Signup Code Security

- **Never commit** signup codes to version control
- **Rotate regularly** (monthly or quarterly)
- **Audit access** - track who has the code
- **Consider alternatives** for large deployments (email verification, admin approval)

## Future Enhancements

Potential authentication improvements:

- [ ] Role-based access control (admin, staff, readonly)
- [ ] Email verification for new signups
- [ ] Password reset flow via email
- [ ] Two-factor authentication (2FA)
- [ ] Session timeout configuration per role
- [ ] Audit log for authentication events
- [ ] Account lockout after failed login attempts

## Resources

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Next.js Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
- [Security Guide](security-guide.md) - Security best practices
- [Deployment Guide](deployment.md) - Production setup

**Last updated: November 12, 2025**

