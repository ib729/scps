# Better Auth Setup Guide

This project uses [Better Auth](https://www.better-auth.com/) for authentication with email/password and Microsoft OAuth support.

## Prerequisites

1. Node.js and pnpm installed
2. SQLite database (`stuco.db`) in the parent directory

## Environment Variables

Create a `.env.local` file in the `web-next` directory with the following variables:

```env
# Database
DATABASE_PATH=../stuco.db

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Better Auth - Microsoft OAuth
MICROSOFT_CLIENT_ID=your_microsoft_client_id_here
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret_here

# Better Auth Secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=your_secret_key_here
```

## Microsoft OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Set the redirect URI to: `http://localhost:3000/api/auth/callback/microsoft`
5. Copy the Application (client) ID to `MICROSOFT_CLIENT_ID`
6. Create a client secret and copy it to `MICROSOFT_CLIENT_SECRET`

## Database Migration

Run the Better Auth migration to create the required tables:

```bash
cd web-next
sqlite3 ../stuco.db < migrations/better_auth_schema.sql
```

Or if you have pnpm/npx available:

```bash
cd web-next
pnpm auth:migrate
```

This will create the following tables:
- `user` - User accounts
- `session` - User sessions
- `account` - OAuth and credential accounts
- `verification` - Email verification tokens

**Note**: The migration script is idempotent and safe to run multiple times.

## Running the App

```bash
cd web-next
pnpm install
pnpm dev
```

Navigate to `http://localhost:3000` and you'll be redirected to the login page.

## Features

- **Email/Password Authentication**: Sign up and login with email and password
- **Microsoft OAuth**: Sign in with Microsoft account
- **Session Management**: Secure session handling with cookies
- **Profile Management**: Update name and profile picture
- **Password Management**: Change password with current password verification
- **Protected Routes**: All app routes require authentication

## Routes

- `/login` - Login page
- `/signup` - Sign up page
- `/dashboard` - Main dashboard (protected)
- `/students` - Student management (protected)
- `/transactions` - Transaction history (protected)
- `/pos` - Point of sale (protected)
- `/topup` - Top-up interface (protected)

## Development Notes

- The auth configuration is in `lib/auth.ts`
- The auth client is in `lib/auth-client.ts`
- The API handler is at `app/api/auth/[...all]/route.ts`
- Session guards are implemented in `app/(app)/layout.tsx`
- Auth pages are in `app/(auth)/login` and `app/(auth)/signup`

