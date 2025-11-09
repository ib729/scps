# Security Guide

Security considerations and best practices for the Stuco Snack Bar Management System.

## Overview

The Stuco system handles student financial data and NFC card information, requiring careful attention to security. This guide covers authentication, secrets management, data protection, and hardening recommendations.

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

### Current State

The system currently has:
- `users` table in database (ready for authentication)
- Password hashing with bcryptjs
- User CRUD operations in `app/actions/users.ts`

**Status**: Foundation implemented, but no active authentication flow.

### Recommended Implementation

1. **Add Authentication Middleware**

Create `middleware.ts` in web-next root:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session');
  
  if (!session && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
};
```

2. **Session Management**

Options:
- **NextAuth.js**: Industry-standard authentication library
- **Iron Session**: Encrypted, cookie-based sessions
- **Custom JWT**: Roll your own with jose library

3. **Role-Based Access Control**

Add `role` field to users table:

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'
  CHECK (role IN ('admin', 'staff', 'readonly'));
```

Roles:
- **admin**: Full access (user management, database reset)
- **staff**: POS, top-up, student management
- **readonly**: View-only access to reports

## Secrets Management

### NFC Tap Secret

The `NFC_TAP_SECRET` authenticates tap broadcasts from the Python broadcaster to the Next.js API.

**Generation:**
```bash
openssl rand -hex 32
```

**Storage:**
- **Development**: `.env.local` (gitignored)
- **Production**: Environment file with restricted permissions

```bash
# Set permissions
chmod 600 /etc/stuco/secrets.env
chown stuco:stuco /etc/stuco/secrets.env
```

**Rotation:**
```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update in both locations
echo "NFC_TAP_SECRET=$NEW_SECRET" >> /etc/stuco/secrets.env
# Update systemd service environment
sudo systemctl restart stuco-web tap-broadcaster
```

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

### Password Storage

User passwords use bcryptjs with automatic salt generation:

```typescript
import bcrypt from 'bcryptjs';

// Hash password (cost factor: 10 rounds)
const hash = await bcrypt.hash(password, 10);

// Verify password
const isValid = await bcrypt.compare(password, hash);
```

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

**Setup**: See [Deployment Guide](deployment.md) for Let's Encrypt configuration.

### NFC Tap Broadcasts

The tap broadcaster POSTs to `/api/nfc/tap` with a shared secret.

**Threats**:
- Replay attacks (reusing captured tap events)
- Secret leakage
- Man-in-the-middle on local network

**Mitigations**:

1. **HTTPS Only** (production)
2. **Timestamp Validation**

Add to `/api/nfc/tap/route.ts`:

```typescript
const maxAge = 5000; // 5 seconds
const now = Date.now();
const tapTime = new Date(payload.reader_ts).getTime();

if (Math.abs(now - tapTime) > maxAge) {
  return NextResponse.json({ error: 'Stale tap event' }, { status: 400 });
}
```

3. **IP Whitelist** (optional, for single-Pi setups)

```typescript
const allowedIPs = ['127.0.0.1', '192.168.1.100'];
const clientIP = request.headers.get('x-real-ip');

if (!allowedIPs.includes(clientIP)) {
  return NextResponse.json({ error: 'Unauthorized IP' }, { status: 403 });
}
```

4. **Rate Limiting**

Limit tap POSTs to prevent DoS:

```typescript
import { RateLimiter } from 'limiter';

const limiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: 'second'
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

### Database Security

**Permissions**:
```bash
# Restrict database access to stuco user
chown stuco:stuco /home/stuco/stuco/stuco.db*
chmod 660 /home/stuco/stuco/stuco.db*
```

**Foreign Keys**: Always enabled to prevent orphaned records.

**Backups**:
- Automated daily backups (see [Database Guide](database.md))
- Store backups on separate volume/server
- Encrypt backup archives:

```bash
# Encrypt backup
tar -czf - stuco.db* | openssl enc -aes-256-cbc -e -out backup.tar.gz.enc -pbkdf2

# Decrypt backup
openssl enc -aes-256-cbc -d -in backup.tar.gz.enc -out backup.tar.gz -pbkdf2
```

### Transaction Logging

All transactions are logged with:
- Student ID
- Card UID (if applicable)
- Transaction type and amount
- Staff member name
- Timestamp (UTC)

**Audit Trail**: Transactions are immutable (deletes are tracked).

**Compliance**: Retain logs per institutional policy.

### Card UID Protection

Card UIDs are personally identifiable and should be protected.

**Storage**: Plain text in database (required for lookup).

**Display**: 
- Show last 4 characters only in UI (e.g., `****BEEF`)
- Full UID only for admin/enrollment

**Logging**: Avoid logging card UIDs in application logs.

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

- [ ] HTTPS enabled with valid certificate
- [ ] Firewall configured (only ports 22, 80, 443 open)
- [ ] Database permissions restricted (660, owned by app user)
- [ ] Environment files secured (600, owned by app user)
- [ ] Services running as non-root user
- [ ] SELinux/AppArmor enabled (if available)

### Secrets

- [ ] NFC_TAP_SECRET is 32+ hex characters
- [ ] Secrets not committed to git (.env.local in .gitignore)
- [ ] Production secrets different from development
- [ ] Secret rotation procedure documented
- [ ] Passwords hashed with bcrypt (never plain text)

### Application

- [ ] Authentication enabled (or staff access controlled)
- [ ] Role-based access control implemented
- [ ] Transaction logs immutable
- [ ] Card UIDs not logged in application logs
- [ ] Rate limiting on API endpoints
- [ ] Input validation on all forms (Zod schemas)

### Network

- [ ] NFC tap events over HTTPS (production)
- [ ] Timestamp validation on tap events
- [ ] IP whitelist for tap broadcaster (optional)
- [ ] SSE connections secured
- [ ] Nginx security headers enabled

### Data

- [ ] Automated daily backups configured
- [ ] Backups stored off-system
- [ ] Backup encryption enabled (optional)
- [ ] Database integrity checked regularly
- [ ] Audit logs reviewed weekly

### Monitoring

- [ ] Logs aggregated and monitored
- [ ] Alerts on unusual patterns (large adjustments, failed logins)
- [ ] Service health checks configured
- [ ] Uptime monitoring enabled

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

- [ ] Implement full authentication with NextAuth.js
- [ ] Add role-based access control
- [ ] Card challenge-response authentication
- [ ] Encrypted database fields for sensitive data
- [ ] Security information and event management (SIEM) integration
- [ ] Two-factor authentication for admin accounts
- [ ] Automated security scanning (OWASP ZAP, Dependabot)

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/security)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS Benchmarks for Linux](https://www.cisecurity.org/cis-benchmarks/)

**Updated**: November 2025

