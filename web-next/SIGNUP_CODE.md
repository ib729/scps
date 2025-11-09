# Signup Code Configuration

## Overview

The signup page requires an 8-digit code to create new accounts. This adds an extra layer of security to prevent unauthorized signups.

## Current Code

**Default Code**: `12345678`

⚠️ **Change this immediately for production!**

## How to Change the Code

Edit the file: `app/(auth)/signup/page.tsx`

Find this line near the top:

```typescript
const SIGNUP_CODE = "12345678"; // 8-digit code required to create account
```

Change `"12345678"` to your desired 8-digit code.

### Example:

```typescript
const SIGNUP_CODE = "98765432"; // Your custom 8-digit code
```

## How It Works

1. User fills out the signup form (name, email, password)
2. User clicks "Create account"
3. Form switches to OTP input screen
4. User enters the 8-digit code
5. If code matches, account is created
6. If code is wrong, error message is shown

## User Experience

- ✅ Clean 8-digit OTP input using Shadcn Input OTP component
- ✅ Button disabled until all 8 digits are entered
- ✅ "Back" button to return to the form
- ✅ Clear error messages for invalid codes
- ✅ Auto-focuses on OTP input

## Security Considerations

### For Production:

1. **Change the default code** immediately
2. **Don't commit the code** to public repositories
3. **Use environment variable** (recommended):

```typescript
const SIGNUP_CODE = process.env.NEXT_PUBLIC_SIGNUP_CODE || "12345678";
```

Then add to `.env.local`:
```env
NEXT_PUBLIC_SIGNUP_CODE=your_secret_code
```

### Alternative Approaches:

1. **Server-side validation**: Move code validation to a server action
2. **Time-based codes**: Generate codes that expire
3. **Email-based codes**: Send unique codes via email
4. **Admin approval**: Require admin to approve signups

## Sharing the Code

When sharing the signup code with authorized users:

1. Share via secure channel (not email/SMS)
2. Change the code periodically
3. Keep track of who has the code
4. Consider using different codes for different user groups

## Disabling the Code Requirement

If you want to allow open signups, simply remove the OTP step:

1. Remove the `showOtpStep` state
2. Remove the OTP UI
3. Call `authClient.signUp.email` directly in `handleSignup`

## Current Flow

```
┌─────────────────┐
│  Signup Form    │
│  - Name         │
│  - Email        │
│  - Password     │
└────────┬────────┘
         │ Click "Create account"
         ▼
┌─────────────────┐
│  OTP Input      │
│  □□□□□□□□       │
│  (8 digits)     │
└────────┬────────┘
         │ Enter code
         ▼
┌─────────────────┐
│  Verification   │
│  - Check code   │
│  - Create user  │
│  - Auto login   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Dashboard     │
└─────────────────┘
```

## Testing

To test the signup flow:

1. Go to https://stuco.ivanbelousov.com/signup
2. Fill in the form
3. Click "Create account"
4. Enter code: `12345678`
5. Click "Verify and Create Account"
6. You should be logged in and redirected to dashboard

## Support

If users forget the code or need access:
- Share the code securely
- Or temporarily change it for them
- Or create their account manually via database

