# Security Guide

**Last Updated**: November 2025  
**Status**: Production-ready with recommended enhancements

## Threat Model

### Assets to Protect

- Student financial records (balances, transactions)
- NFC card UIDs (personally identifiable)
- Staff access to POS and management functions
- Database integrity

### Potential Threats

- Unauthorized access to student data
- NFC card cloning or replay attacks
- Database manipulation or deletion
- Man-in-the-middle attacks on NFC broadcasts
- Insider threats (staff misuse)

## Authentication & Authorization

### Current Implementation ✅

The system now has **full authentication** implemented using Better Auth:

**Implementation Files:**
- `web-next/lib/auth.ts` - Better Auth configuration with email/password and Microsoft OAuth
- `web-next/lib/auth-client.ts` - Client-side auth hooks
- `web-next/app/api/auth/[...all]/route.ts` - Auth API endpoints
- `web-next/app/(app)/layout.tsx` - Session guard protecting all app routes
- `web-next/app/(auth)/login/page.tsx` - Login page
- `web-next/app/(auth)/signup/page.tsx` - Signup page with code protection

**Features:**
- ✅ Email/password authentication with bcrypt hashing
- ✅ Session management with secure cookies (production: secure, httpOnly)
- ✅ Protected routes - all `/dashboard`, `/pos`, `/students`, `/transactions`, `/topup` require authentication
- ✅ Signup code protection
- ✅ Microsoft OAuth ready (requires env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`)
- ✅ Database schema: `user`, `session`, `account`, `verification` tables (see `migrations/better_auth_schema.sql`)

**Session Configuration:**
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

**Session Guard Example:**
```typescript
// web-next/app/(app)/layout.tsx (lines 15-21)
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  redirect("/login");
}
```

### Remaining Work - Role-Based Access Control ⚠️

**Status**: Not yet implemented

Add `role` field to Better Auth user table:

```sql
ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'
  CHECK (role IN ('admin', 'staff', 'readonly'));
```

Proposed roles:
- **admin**: Full access (user management, database reset, adjustments)
- **staff**: POS, top-up, student management
- **readonly**: View-only access to reports and dashboard

**Implementation Steps:**
1. Add role column to `user` table
2. Create role middleware in `web-next/app/(app)/layout.tsx`
3. Protect sensitive actions (adjustments, user management) with role checks
4. Add role selection in signup flow (admin-only)

## Secrets Management

### NFC Tap Secret ✅

The `NFC_TAP_SECRET` authenticates tap broadcasts from the Python broadcaster to the Next.js API.

**Implementation:**
- `tap-broadcaster.py` (lines 135-137) - Reads from `$NFC_TAP_SECRET` env var
- `web-next/app/api/nfc/tap/route.ts` (lines 24-32) - Validates secret on POST
- `systemd/tap-broadcaster.service` (line 10) - Systemd service environment

**Validation Logic:**
```typescript
// web-next/app/api/nfc/tap/route.ts
const expectedSecret = process.env.NFC_TAP_SECRET;
if (expectedSecret && validated.secret !== expectedSecret) {
  console.warn("[NFC Tap] Authentication failed");
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}
```

**Generation:**
```bash
openssl rand -hex 32
```

**Storage:**
- **Development**: `.env.local` (gitignored)
- **Production**: Systemd service file or `/etc/stuco/secrets.env`

```bash
# Set permissions for production secrets file
chmod 600 /etc/stuco/secrets.env
chown qiss:qiss /etc/stuco/secrets.env
```

**Rotation:**
```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update systemd service
sudo systemctl edit tap-broadcaster.service
# Add: Environment="NFC_TAP_SECRET=<new-secret>"

# Update Next.js env
echo "NFC_TAP_SECRET=$NEW_SECRET" >> /home/qiss/stuco/web-next/.env.local

# Restart services
sudo systemctl restart tap-broadcaster
cd /home/qiss/stuco/web-next && pm2 restart stuco-web
```

### Better Auth Secret ✅

**Implementation:**
- `web-next/lib/auth.ts` - Uses `BETTER_AUTH_SECRET` for session encryption
- Required for production deployments

**Generation:**
```bash
openssl rand -base64 32
```

**Storage:**
- Add to `web-next/.env.local`: `BETTER_AUTH_SECRET=<generated-secret>`

### Database Encryption

SQLite does not support encryption natively. Options:

1. **SQLCipher** (Encrypted SQLite)
   - Requires compilation with encryption support
   - Performance overhead ~5-15%
   - Better-sqlite3 has SQLCipher variant

2. **Filesystem Encryption**
   - Use LUKS (Linux) or dm-crypt
   - Encrypt entire partition containing stuco.db
   - No performance penalty on reads

3. **Application-Level Encryption**
   - Encrypt sensitive fields (e.g., card_uid) in application
   - Requires key management
   - More complex, use only if necessary

**Recommendation**: Filesystem encryption for production on shared servers.

### Password Storage ✅

User passwords use bcryptjs with automatic salt generation (10 rounds):

**Implementation:**
- `web-next/lib/repositories/users.ts` (lines 8-9, 96-98, 119-124) - Password hashing and verification
- Better Auth handles password hashing automatically for email/password accounts

```typescript
// web-next/lib/repositories/users.ts
const passwordHash = bcrypt.hashSync(data.password, 10);

// Verification
const isValid = bcrypt.compareSync(password, user.password_hash);
```

**Security Notes:**
- ✅ 10 rounds (2^10 = 1,024 iterations) - adequate for 2025
- ✅ Automatic salt generation per password
- ✅ Never logged or exposed in API responses

**Never**:
- Store passwords in plain text
- Use reversible encryption (use hashing only)
- Log passwords or password hashes

## Network Security

### HTTPS/TLS

**Production Requirement**: Always use HTTPS for the web UI.

**Why**:
- Protects NFC tap events containing card UIDs
- Prevents session hijacking
- Encrypts student financial data in transit
- Secures Better Auth session cookies (marked secure in production)

**Configuration:**
```typescript
// web-next/lib/auth.ts (lines 31-32)
advanced: {
  useSecureCookies: process.env.NODE_ENV === "production",
}
```

**Setup**: See [Deployment Guide](deployment.md) for Let's Encrypt/Nginx configuration.

**Note**: User has confirmed HTTPS certificate is already configured ✅

### NFC Tap Broadcasts ✅ (Partial)

The tap broadcaster POSTs to `/api/nfc/tap` with a shared secret.

**Current Implementation:**
- ✅ Shared secret validation (`NFC_TAP_SECRET`)
- ✅ Zod schema validation for payload structure
- ✅ 800ms debounce in `tap-broadcaster.py` (line 203)
- ✅ SSE stream endpoint authenticated (requires login) - `web-next/app/api/nfc/stream/route.ts` (lines 17-25)
- ⚠️ **Missing**: Timestamp validation (replay attack prevention)
- ⚠️ **Missing**: Rate limiting on `/api/nfc/tap` endpoint

**SSE Stream Security:**
```typescript
// web-next/app/api/nfc/stream/route.ts
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  console.warn("[SSE] Unauthorized connection attempt");
  return new Response("Unauthorized", { status: 401 });
}
```

This ensures only logged-in staff can receive tap notifications while allowing multiple devices to connect simultaneously.

**Threats**:
- Replay attacks (reusing captured tap events)
- Secret leakage
- Man-in-the-middle on local network
- DoS via tap flooding

**Recommended Enhancements**:

1. **Timestamp Validation** ⚠️ (Not implemented)

Add to `web-next/app/api/nfc/tap/route.ts`:

```typescript
const maxAge = 5000; // 5 seconds
const now = Date.now();
const tapTime = new Date(validated.reader_ts).getTime();

if (Math.abs(now - tapTime) > maxAge) {
  return NextResponse.json({ error: 'Stale tap event' }, { status: 400 });
}
```

2. **IP Whitelist** (Optional, for single-Pi setups)

```typescript
const allowedIPs = ['127.0.0.1', '::1'];
const clientIP = request.headers.get('x-real-ip') || 
                 request.headers.get('x-forwarded-for')?.split(',')[0];

if (!allowedIPs.includes(clientIP)) {
  return NextResponse.json({ error: 'Unauthorized IP' }, { status: 403 });
}
```

3. **Rate Limiting** ⚠️ (Not implemented)

Consider using `@upstash/ratelimit` or similar:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, "10 s"),
});
```

### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Block direct access to app port (if using reverse proxy)
sudo ufw deny 3000/tcp
```

## Data Protection

### Database Security ✅

**Permissions:**
```bash
# Restrict database access to qiss user
chown qiss:qiss /home/qiss/stuco/stuco.db*
chmod 660 /home/qiss/stuco/stuco.db*
```

**Foreign Keys:** ✅ Always enabled via `PRAGMA foreign_keys = ON` in `web-next/lib/db.ts` (line 32)

**Backups:** ✅ Implemented

**Implementation:**
- `scripts/cloud_backup_r2.sh` - Cloudflare R2 backup script using rclone
- Creates compressed tar.gz archives of `stuco.db`, `stuco.db-wal`, `stuco.db-shm`
- Uploads to R2 with metadata (timestamp, type, project)
- Local retention in `db_backups/` directory

**Backup Script Features:**
- ✅ Automated compression
- ✅ Cloud storage (Cloudflare R2)
- ✅ Local retention
- ✅ Metadata tagging
- ⚠️ Encryption not enabled by default

**Enable Backup Encryption:**
```bash
# Encrypt backup before upload
tar -czf - stuco.db* | openssl enc -aes-256-cbc -e -out backup.tar.gz.enc -pbkdf2

# Decrypt backup
openssl enc -aes-256-cbc -d -in backup.tar.gz.enc -out backup.tar.gz -pbkdf2
```

**Schedule Backups:**
```bash
# Add to crontab
crontab -e
# Daily at 2 AM
0 2 * * * /home/qiss/stuco/scripts/cloud_backup_r2.sh >> /home/qiss/stuco/logs/backup.log 2>&1
```

### Transaction Logging ✅

All transactions are logged in the `transactions` table with:
- Student ID
- Card UID (if applicable)
- Transaction type (TOPUP, DEBIT, ADJUST)
- Amount (stored as tenths of CNY)
- Overdraft component
- Description
- Staff member name
- Timestamp (UTC, ISO format)

**Implementation:**
- `web-next/lib/repositories/transactions.ts` - Transaction CRUD operations
- `web-next/app/actions/pos.ts` - POS checkout with transaction logging
- `web-next/app/actions/topup.ts` - Top-up and adjustment logging

**Audit Trail:** 
- ✅ All transactions immutably recorded
- ⚠️ **Security Gap**: `deleteTransaction()` function exists in `transactions.ts` (line 73-77)
  - Allows deletion without audit trail
  - **Recommendation**: Replace with soft-delete or remove function entirely
  - Transactions should be reversed via ADJUST type, not deleted

**Compliance**: Retain logs per institutional policy (currently indefinite retention).

### Card UID Protection ⚠️

Card UIDs are personally identifiable and should be protected.

**Storage**: ✅ Plain text in database (required for lookup via `cards` table)

**Display:** 
- ⚠️ **Security Gap**: Full UID displayed in UI without masking
  - `web-next/app/(app)/students/[id]/cards-list.tsx` (line 46) - Shows full UID
  - `web-next/app/(app)/pos/pos-form.tsx` (lines 349, 439) - Shows full UID in dialogs
- **Recommendation**: Mask UIDs to show last 4 chars only (e.g., `****BEEF`)
- Full UID only for admin/enrollment operations

**Logging:** 
- ✅ Not logged in application logs
- ✅ Stored in transactions table for audit purposes only
- Console logs in `tap-broadcaster.py` show full UID (acceptable for local debugging)

**Recommended Masking Function:**
```typescript
// Add to web-next/lib/utils.ts
export function maskCardUid(uid: string): string {
  if (uid.length <= 4) return uid;
  return '****' + uid.slice(-4);
}
```

## NFC Security

### Card Cloning

**Risk**: MIFARE Classic cards are vulnerable to cloning.

**Mitigations**:
1. Use MIFARE DESFire or NTAG cards (encrypted sectors)
2. Implement card challenge-response authentication
3. Monitor for duplicate UIDs
4. Alert on suspicious patterns (same card, multiple quick taps)

**Detection**:

```sql
-- Find cards used by multiple students (should never happen)
SELECT card_uid, COUNT(DISTINCT student_id) as student_count
FROM cards
GROUP BY card_uid
HAVING student_count > 1;
```

### Replay Attack Prevention

**Current State**: Basic 800ms debounce in tap-broadcaster.py.

**Enhanced Protection**:

1. **Nonce-based authentication** (future enhancement)
   - Server sends nonce on connect
   - Broadcaster signs tap with nonce + secret
   - Server validates signature

2. **Timestamp validation** (recommended)
   - Reject taps older than 5 seconds
   - Prevents replay of captured tap events

### Physical Security

- Store NFC reader in tamper-evident enclosure
- Monitor reader USB/UART connection
- Alert on tap-broadcaster disconnections

## Insider Threat Mitigation

### Staff Accountability

- Require staff name on all transactions
- Log staff actions (top-ups, adjustments)
- Regular audit of transactions by staff member

### Separation of Duties

- **Staff**: Process transactions
- **Admin**: User management, database access
- **Readonly**: Reports only, no modifications

### Audit Procedures

Weekly reviews:

```sql
-- Large adjustments
SELECT * FROM transactions
WHERE type = 'ADJUST' AND ABS(amount) > 1000
ORDER BY created_at DESC;

-- Top-ups by staff member
SELECT staff, COUNT(*), SUM(amount) as total
FROM transactions
WHERE type = 'TOPUP'
GROUP BY staff
ORDER BY total DESC;
```

## Security Checklist

### Deployment

- [x] HTTPS enabled with valid certificate ✅
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [x] Database permissions restricted (660, owned by qiss user) ✅
- [ ] Environment files secured (600, owned by app user)
- [x] Services running as non-root user (qiss) ✅
- [ ] SELinux/AppArmor enabled (if available)

### Secrets

- [x] NFC_TAP_SECRET is 32+ hex characters ✅
- [x] Secrets not committed to git (.env.local in .gitignore) ✅
- [ ] Production secrets different from development
- [x] Secret rotation procedure documented ✅
- [x] Passwords hashed with bcrypt (never plain text) ✅
- [x] BETTER_AUTH_SECRET configured ✅

### Application

- [x] Authentication enabled (Better Auth with email/password) ✅
- [ ] 🔴 **CRITICAL**: Remove default user bootstrap (`getCurrentUser()` in `users.ts`)
- [ ] Role-based access control implemented
- [ ] 🟠 **HIGH**: Remove transaction deletion or implement soft-delete
- [x] Card UIDs not logged in application logs ✅
- [ ] 🟡 Rate limiting on API endpoints
- [x] Input validation on all forms (Zod schemas) ✅
- [ ] 🟠 Mask card UIDs in UI (show last 4 chars only)

### Network

- [x] NFC tap events over HTTPS (production) ✅
- [ ] 🟠 **HIGH**: Timestamp validation on tap events (replay attack prevention)
- [x] SSE stream endpoint authenticated (requires login) ✅
- [ ] IP whitelist for tap broadcaster (optional)
- [ ] Nginx security headers enabled

### Data

- [x] Automated backups available (R2 script) ✅
- [x] Backups stored off-system (Cloudflare R2) ✅
- [ ] 🟡 Backup encryption enabled
- [x] Database integrity via foreign keys ✅
- [ ] Audit logs reviewed weekly (manual process)

### Monitoring

- [ ] Logs aggregated and monitored
- [ ] Alerts on unusual patterns (large adjustments, failed logins)
- [ ] Service health checks configured
- [ ] Uptime monitoring enabled

### Priority Actions

**Immediate (Critical 🔴):**
1. Remove default user bootstrap from `getCurrentUser()`

**High Priority (🟠):**
2. Add timestamp validation to `/api/nfc/tap` endpoint
3. Remove or soft-delete transaction deletion functionality
4. Implement card UID masking in UI

**Medium Priority (🟡):**
5. Implement rate limiting on API endpoints
6. Add role-based access control
7. Enable backup encryption

**Completed ✅:**
- ~~Add authentication to `/api/nfc/stream` endpoint~~ (November 9, 2025)

## Security Gaps & Recommendations

This section documents identified security gaps and recommended mitigations discovered during the November 2025 security review.

### Critical Gaps 🔴

#### 1. Default User Bootstrap in Production

**Location**: `web-next/app/actions/users.ts` (lines 32-37)

**Issue**: The `getCurrentUser()` function automatically creates a default user with hardcoded credentials if no users exist:
- Email: `hello@ivanbelousov.com`
- Password: `password123`

**Risk**:
- Known credentials in production
- Unauthorized access if database is reset
- Violates principle of explicit user creation

**Impact**: High - Allows unauthorized access with known credentials

**Mitigation**:
```typescript
// Remove auto-creation logic from getCurrentUser()
// Require explicit user creation via signup flow or CLI tool
if (users.length === 0) {
  return { 
    success: false, 
    error: "No users found. Create first user via signup page." 
  };
}
```

### High Priority Gaps 🟠

#### 2. Transaction Deletion Without Audit Trail

**Location**: `web-next/lib/repositories/transactions.ts` (lines 73-77)

**Issue**: `deleteTransaction()` function permanently deletes transactions from the database. The action is exposed via `web-next/app/actions/transactions.ts` (lines 66-89).

**Risk**:
- Loss of audit trail
- Potential for financial fraud (hiding unauthorized transactions)
- Compliance violations (transaction logs should be immutable)

**Impact**: Medium-High - Compromises financial audit integrity

**Mitigation**:
1. Remove `deleteTransaction()` and `deleteTransactionAction()` functions
2. Use ADJUST transactions to reverse errors
3. Or implement soft-delete with `deleted_at` timestamp

```sql
-- Add soft delete column
ALTER TABLE transactions ADD COLUMN deleted_at TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN deleted_by TEXT DEFAULT NULL;
```

#### 3. Missing Timestamp Validation on NFC Taps

**Location**: `web-next/app/api/nfc/tap/route.ts`

**Issue**: No validation that tap events are recent. Allows replay attacks where captured tap events can be resubmitted.

**Risk**:
- Replay attacks (reusing old tap events)
- Unauthorized charges if attacker captures tap event

**Impact**: Medium - Enables replay attacks

**Mitigation**: See "NFC Tap Broadcasts" section above for timestamp validation code.

#### 4. Full Card UID Exposure in UI

**Location**: Multiple files (see "Card UID Protection" section)

**Issue**: Card UIDs displayed in full without masking in student details and POS dialogs.

**Risk**:
- Privacy violation (UIDs are PII)
- Over-the-shoulder viewing risk
- Unnecessary data exposure

**Impact**: Medium - Privacy concern

**Mitigation**: Implement UID masking function (see "Card UID Protection" section).

### Medium Priority Gaps 🟡

#### 5. No Rate Limiting on API Endpoints

**Location**: All API routes in `web-next/app/api/`

**Issue**: No rate limiting on critical endpoints like `/api/nfc/tap`, `/api/auth/*`.

**Risk**:
- DoS attacks via tap flooding
- Brute force attacks on auth endpoints
- Resource exhaustion

**Impact**: Medium - Service availability risk

**Mitigation**: Implement rate limiting (see "NFC Tap Broadcasts" section).

#### 6. No Role-Based Access Control

**Location**: All authenticated routes

**Issue**: All authenticated users have full access to all operations (POS, top-up, adjustments, student management).

**Risk**:
- Insider threats (staff making unauthorized adjustments)
- Lack of separation of duties
- Compliance issues

**Impact**: Medium - Insider threat risk

**Mitigation**: Implement RBAC (see "Authentication & Authorization" section).

#### 7. Backup Encryption Not Enabled

**Location**: `scripts/cloud_backup_r2.sh`

**Issue**: Database backups uploaded to R2 without encryption.

**Risk**:
- Data exposure if R2 bucket is compromised
- Compliance violations (unencrypted PII in cloud storage)

**Impact**: Medium - Data confidentiality risk

**Mitigation**: Add encryption step to backup script (see "Database Security" section).

### Low Priority Gaps 🟢

#### 8. No IP Whitelisting for Tap Broadcaster

**Location**: `web-next/app/api/nfc/tap/route.ts`

**Issue**: Tap endpoint accepts requests from any IP address (only secret validation).

**Risk**: Minor - Secret provides adequate protection

**Impact**: Low - Defense in depth measure

**Mitigation**: Optional IP whitelist (see "NFC Tap Broadcasts" section).

#### 9. Verbose Error Messages

**Location**: Various server actions

**Issue**: Some error messages may expose internal details (e.g., database errors).

**Risk**: Information disclosure

**Impact**: Low - Minor information leakage

**Mitigation**: Review error messages and sanitize for production.

## Incident Response

### Card Compromise

If a card is cloned or stolen:

1. **Revoke Card**
   ```sql
   UPDATE cards SET status = 'revoked' WHERE card_uid = 'COMPROMISED_UID';
   ```

2. **Issue Replacement**
   - Enroll new card for student
   - Old card UID remains revoked (audit trail)

3. **Investigate**
   - Review transactions with compromised card
   - Check for unauthorized charges
   - Adjust student balance if needed

### Database Corruption

1. **Stop Services**
   ```bash
   sudo systemctl stop stuco-web tap-broadcaster
   ```

2. **Check Integrity**
   ```bash
   sqlite3 stuco.db "PRAGMA integrity_check;"
   ```

3. **Restore from Backup**
   ```bash
   cp db_backups/latest_backup.tar.gz .
   tar -xzf latest_backup.tar.gz
   ```

4. **Verify & Restart**
   ```bash
   sqlite3 stuco.db ".tables"
   sudo systemctl start stuco-web tap-broadcaster
   ```

### Unauthorized Access

1. **Revoke Access**
   - Change NFC_TAP_SECRET
   - Reset user passwords
   - Review user accounts

2. **Audit Activity**
   - Review transaction logs for suspicious activity
   - Check database for unauthorized changes
   - Investigate access logs

3. **Harden System**
   - Update secrets
   - Enable additional monitoring
   - Review firewall rules

## Compliance Considerations

### Data Privacy

- Student financial data may be subject to FERPA (US) or similar regulations
- Obtain consent for NFC card enrollment
- Provide data access/deletion upon request
- Limit data retention per policy

### Access Logs

Retain logs showing:
- Who accessed which student records
- Transaction history (immutable)
- System changes (user additions, config updates)

### Third-Party Dependencies

- Regularly update npm/pip packages (`pnpm update`, `pip install -U`)
- Monitor security advisories for Next.js, better-sqlite3, nfcpy
- Run `pnpm audit` and `pip check` regularly

## Future Enhancements

- [x] ~~Implement full authentication with NextAuth.js~~ ✅ Completed with Better Auth
- [ ] Add role-based access control (in progress)
- [ ] Card challenge-response authentication (advanced NFC security)
- [ ] Encrypted database fields for sensitive data (SQLCipher)
- [ ] Security information and event management (SIEM) integration
- [ ] Two-factor authentication for admin accounts
- [ ] Automated security scanning (OWASP ZAP, Dependabot)
- [ ] Audit log viewer in admin dashboard
- [ ] Automated security alerts (failed login attempts, large adjustments)
- [ ] Session timeout configuration per role

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/security)
- [Better Auth Documentation](https://www.better-auth.com/docs)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS Benchmarks for Linux](https://www.cisecurity.org/cis-benchmarks/)

---

**Last Updated**: November 9, 2025  
**Review Status**: Comprehensive security audit completed  
**Next Review**: Recommended after implementing priority actions

