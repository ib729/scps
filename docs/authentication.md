# Authentication Guide

This project uses [Better Auth](https://www.better-auth.com/) for email/password authentication. Microsoft OAuth remains unfinished: the login/signup buttons are disabled. Provider configuration below is reference material, not a supported end-to-end sign-in feature.

## Overview

The authentication system provides:
- **Email/Password Authentication**: Sign up and login with credentials
- **Microsoft OAuth**: Unfinished; disabled in the UI
- **Session Management**: Secure session handling with cookies
- **Profile Management**: Update name and profile picture
- **Password Management**: Change password with verification
- **Protected Routes**: All app routes require authentication
- **Customer approval**: Public registrations remain pending until an administrator links an existing financial customer record

## Prerequisites

1. Node.js >=26.13.1 <27 and pnpm 12.21.0 installed
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

# Trusted Origins (comma-separated list of allowed origins for CSRF protection)
# Must include all domains where your app is accessible
TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3333

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

For a **new empty database only**, apply both checked-in schemas to the same absolute path configured by `DATABASE_PATH`:

```bash
# From the repository root; replace the path with your configured fresh ledger.
sqlite3 "/absolute/path/to/stuco.db" < migrations/schema.sql
sqlite3 "/absolute/path/to/stuco.db" < web-next/migrations/better_auth_schema.sql
```

Do not apply fresh initialization or an auth-generated migration as a substitute for the existing-ledger customer migration. Stop writers, verify a backup and follow [Database Guide](database.md) for legacy roles/schema/currency conversion. Existing credentials, sessions and links must be preserved.

### Schema Details

```sql
-- User table
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER DEFAULT 0,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','staff','customer')),
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

## Customer accounts and administrator approval

Customers register with `{name,email,password}` and then sign in; no shared signup
or email verification code is required. New logins have the `customer` role and
start at `/customer/pending`. Registration never creates a customer, balance, or link.
Email addresses are login identifiers, not verified proof of identity.

Provision the first administrator (or recover operator access/passwords) with
`./scps-cli users`. There is no automatic first-user administrator promotion.
An existing administrator uses **Accounts** (`/admin/users`) to verify a person,
search for the correct existing customer record, and **Approve and link**.
Only nonarchived customers with an accounts row can be linked. One login owns at
most one financial customer; one financial customer has at most one login.
Links cannot be reassigned through this screen. Resolve identity mistakes manually
against a verified backup, never by matching a typed email/name automatically.

Administrators can create accounts with an explicit role, or grant/demote a known
registered person after confirmation. Staff cannot grant roles. The last
administrator cannot be demoted, and website deletion of an administrator is
refused until demoted. Role changes retain financial links and take effect on the
next protected request, independently of cached session roles. Deleting an
ordinary login removes its link, not financial records or history.

Staff/admin land at `/admin`; linked customers land at `/customer`. Customers
cannot access global transactions, customer actions, operator mutations, or NFC
browser subscriptions. Archived or account-less linked records remain unavailable.

### Manually reviewed QR top-ups

Customers request a base amount, e.g. ¥30.00, and see a distinct payable amount,
e.g. ¥30.01. Only the base amount is credited, only after an administrator verifies
the real receipt and approves in **Payment review** (`/admin/payments`). A sent claim alone
does not change money. Rejection gives no credit and does not refund WeChat.

Supply your own merchant QR at `web-next/public/wechat-pay-qr.png` (also .jpg,
.jpeg, .webp), or set `NEXT_PUBLIC_WCP_QR_IMAGE_URL` to a same-origin root-relative
path and rebuild. A static QR does not prefill the payable amount. Missing images
show a configuration error, not a payment-success path.

Reservations expire after 15 minutes unless marked sent. Claimed pending requests
keep their payable amount reserved until review, even past the original deadline.
The 1–99-cent suffix is unique only among pending reservations, not forever.
After expiry, do not pay. If already sent, contact an administrator with this
request ID. Investigate late/out-of-window payments manually using the existing
administrative balance workflow; never automatically match a reused amount.

The website queue/status is primary. Optional `TELEGRAM_BOT_TOKEN` and
`WCP_TELEGRAM_CHAT_ID` send plain alerts with a website review link. Telegram
cannot approve/reject payments; previously sent callback buttons are obsolete.
Missing settings or delivery failure do not fail saved payment operations.

### Existing database deployment

Stop every writer and verify a SQLite online backup of the configured database.
From `web-next`, run `node --import tsx tools/migrate-customer.ts --writers-stopped`
against a copy first, then the stopped ledger. This preserves IDs, cents, cards,
roles, credentials, sessions and links atomically. Startup refuses legacy/mixed
schemas, unknown user columns and orphan references; it never promotes a first user.
The command checks the local web service but cannot detect arbitrary external writers.
Never renumber displayed pending amounts or repair ownership links automatically.


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
- `/login` - Email/password login; Microsoft button disabled
- `/signup` - Unprivileged pending customer registration with per-client attempt budget

### Protected Routes
Operator routes under `app/(app)/admin/` require fresh staff/admin authorization:
- `/admin` - Shared staff/admin dashboard
- `/admin/customers` - Operator customer management
- `/admin/transactions` - Transaction history
- `/admin/pos` - Point of sale
- `/admin/topup` - Top-up interface
- `/admin/users`, `/admin/payments` - Administrator-only account/payment decisions
- `/customer`, `/customer/pending` - Customer-only owned account or waiting page

### Session Guard

The operator guard is implemented in `app/(app)/admin/layout.tsx`:

```typescript
const session = await requirePageStaffContext();
```

## Running the App

### Development

```bash
cd web-next
pnpm install --frozen-lockfile
pnpm dev
```

Navigate to `http://localhost:3000` - you'll be redirected to the login page.

### First User Creation

1. Run `./scps-cli users` to create the first administrator.
2. Customers register at `/signup`, then sign in to check pending status.
3. The administrator verifies and links each customer in `/admin/users`.

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
- ✅ Administrator-approved customer links and fresh database role checks

### Session Configuration

```typescript
// web-next/lib/auth.ts
session: {
  cookieCache: { enabled: false },
  updateAge: 60 * 60 * 24,
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
│   ├── (app)/admin/         # Staff/admin protected layout and pages
│   ├── (customer)/customer/ # Owned portal and pending approval
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
- **Session Guard**: `app/(app)/admin/layout.tsx` - Staff/admin route wrapper; customer pages use their own customer/link guard
- **Login Page**: `app/(auth)/login/page.tsx`
- **Signup Page**: `app/(auth)/signup/page.tsx`

## Troubleshooting

See the [Troubleshooting Guide](troubleshooting.md#authentication-and-approval) for common authentication issues and solutions.

### Quick Checks

1. **Environment Variables**: Verify all required variables are set in `.env.local`
2. **Database Migration**: Ensure Better Auth tables exist
3. **Secrets**: Generate secure secrets with `openssl rand -base64 32`
4. **Server Restart**: Restart dev server after changing environment variables

## Security Best Practices

### Production Deployment

1. **Provision the first administrator** with the operator-controlled CLI
2. **Use environment variables** for all secrets
3. **Enable HTTPS** (Better Auth sets secure cookies in production)
4. **Strong BETTER_AUTH_SECRET** (32+ characters)
5. **Restrict environment file permissions** (`chmod 600 .env.local`)
6. **Different secrets** for dev and production
7. **Regular secret rotation** (document procedure)
8. **Configure TRUSTED_ORIGINS** - Set to only the domains where your app is accessible (e.g., `https://yourdomain.com`). This prevents CSRF attacks by validating the origin of requests.

### Registration security

- Verify people manually before linking balances or granting roles.
- Typed addresses are not proof of mailbox ownership.
- Preserve the controlled signup action: direct email-signup HTTP requests are blocked.
- Password recovery uses the existing administrator CLI, not new email/SMS delivery.

## Resources

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Next.js Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
- [Security Guide](security-guide.md) - Security best practices
- [Deployment Guide](deployment.md) - Production setup

**Last updated: November 15, 2026**

