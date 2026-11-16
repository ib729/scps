# Security Guide

This guide covers security best practices, hardening recommendations, and secrets management for the Student Council Payment System in production.

## Overview

The Student Council Payment System handles customer financial data and requires
secrets, access controls and careful recovery procedures. Raspberry Pi guidance
below is operational advice, not a claim of physical or production acceptance.

## Secrets Management

### Environment Variables

All sensitive configuration should be stored in environment variables, never committed to version control.

#### Web UI Secrets (`web-next/.env.local`)

```bash
# Database location (literal absolute path; do not rely on dotenv shell expansion)
DATABASE_PATH=/absolute/path/to/scps/scps.db

# Better Auth secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=<your-generated-secret>

# NFC tap authentication (generate with: openssl rand -hex 32)
NFC_TAP_SECRET=<your-nfc-secret>

# Public HTTPS origin and optional additional trusted origins
NEXT_PUBLIC_APP_URL=https://your-domain.com
BETTER_AUTH_TRUSTED_ORIGINS=https://your-domain.com
```

#### NFC Broadcaster Secrets (`.env.broadcaster`)

```bash
# NFC tap secret (must match web UI)
NFC_TAP_SECRET=<your-nfc-secret>

# Next.js server URL
NEXTJS_URL=http://localhost:3000

# POS lane identifier
POS_LANE_ID=default

# NFC device
PN532_DEVICE=pn532_uart:/dev/ttyAMA0
```

**Important**: Both `.env.local` and `.env.broadcaster` are in `.gitignore` and should never be committed.

### Generating Strong Secrets

```bash
# For BETTER_AUTH_SECRET (base64, 32 bytes)
openssl rand -base64 32

# For NFC_TAP_SECRET (hex, 32 bytes)
openssl rand -hex 32
```

### File Permissions

Protect environment files:

```bash
# Restrict access to environment files
chmod 600 "$PROJECT_ROOT/web-next/.env.local"
chmod 600 "$PROJECT_ROOT/.env.broadcaster"

# Verify ownership matches the configured service user, not necessarily your shell user.
ls -l "$PROJECT_ROOT/web-next/.env.local" "$PROJECT_ROOT/.env.broadcaster"
```

### Database Security

Restrict the ledger directory and all database/WAL/SHM files to the service user
and, only if necessary, a trusted operator group. Prefer `0700` directories and
`0600` files for a single service user; use `0770`/`0660` for an intentional shared
group. Never use world-write permissions. SQLite needs directory write permission
to create sidecars; changing only the main file's mode is insufficient.

## Network Security

### Firewall Configuration

Use UFW (Uncomplicated Firewall) on Raspberry Pi OS:

```bash
# First allow your actual SSH port before enabling UFW, to avoid locking yourself out.
sudo ufw allow 22/tcp
# Enable firewall
sudo ufw enable

# Allow SSH (if remote access needed)
sudo ufw allow 22/tcp

# Allow HTTP (if using nginx reverse proxy)
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Block direct access to Next.js (force through reverse proxy)
sudo ufw deny 3000/tcp

# Check status
sudo ufw status
```

### Local Network Only

If running on local network without internet exposure:

```bash
# Allow only from local network (example: 192.168.1.0/24)
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Deny all other access to port 3000
sudo ufw deny 3000/tcp
```

### SSH Hardening

```bash
# Disable password authentication, use SSH keys only
sudo nano /etc/ssh/sshd_config

# Set these values:
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart ssh
```

## Application Security

### Better Auth Configuration

#### Strong Password Requirements

Email/password authentication is enabled with Better Auth. Its database stores
sessions and credentials; production configuration enables secure cookies and
disables the cookie cache. Do not assume the presence of a bcrypt dependency means
every authentication path uses bcrypt; preserve credential formats during upgrades.
Use strong unique passwords and HTTPS, and review current library defaults when upgrading.

#### Customer registration and operator access

Public registration creates an unlinked customer login, not an operator or financial account.
Provision the first administrator with repository-root `./scps-cli users`.
Administrators verify identity and link existing customer balances at `/admin/users`;
email addresses are identifiers, not verified proof of identity. Signup cannot grant
staff/admin access, and last-administrator protection must remain enabled.

Staff/admin share `/admin/*` operator pages, but `/admin/users` and `/admin/payments`
and their protected mutations are administrator-only. Customers use `/customer`
or `/customer/pending` and see only owned history/balance, never another customer's
data, card UID or internal notes. A payment claim never credits money; only confirmed
administrator approval credits base cents once. Hiding navigation is not authorization.

#### Session Security

Sessions and credentials are stored in the authentication tables. Treat database
backups as secrets too. Keep the public HTTPS origin and trusted-origin configuration
aligned with the reverse proxy; secure cookies require the production HTTPS setup.
Do not infer session invalidation merely from changing a secret: review active
sessions during incident recovery.

### NFC Tap Authentication

The tap broadcaster authenticates with the web server using a shared secret:

1. **Server-side validation**: `/api/nfc/ws` verifies the secret before accepting taps
2. **Rate limiting**: Failed authentication attempts are rate-limited (5 attempts/minute)
3. **Connection tracking**: Each broadcaster connection is logged with IP and timestamp

### Input Validation

All user inputs are validated:

- **Server-side**: Validate form/action/API inputs and recheck authorization.
- **Database**: SQLite constraints and foreign keys protect ledger relationships.
- **Amount validation**: Integer cents, safe ranges and permitted decimal precision.
- **UID validation**: The CSV importer accepts 4–20 hexadecimal characters and checks ownership.

## Reverse Proxy (Production)

### Nginx Configuration

Use Nginx as a reverse proxy for SSL termination and security headers:

`limit_req_zone` belongs in Nginx's `http` context, not inside `server`:

```nginx
# Inside http { ... }
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    listen 443 ssl http2;
    server_name stuco.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/stuco.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stuco.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate Limiting
    limit_req zone=api_limit burst=20 nodelay;

    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket for NFC taps (no buffering)
    location /api/nfc/ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_buffering off;
    }
}
```

### SSL Certificates

Use Let's Encrypt for free SSL certificates:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d stuco.yourdomain.com

# Auto-renewal is configured automatically
# Test renewal:
sudo certbot renew --dry-run
```

## System Hardening

### Raspberry Pi OS Security

#### Keep System Updated

```bash
# Update package lists and upgrade
sudo apt update && sudo apt upgrade -y

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

#### Disable Unused Services

```bash
# List running services
systemctl list-units --type=service --state=running

# Disable unnecessary services (examples)
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon
```

#### User Account Security

```bash
# Inspect the deployment account and rendered service user.
id
systemctl cat scps scps-reader scps-reader2
```

Use a dedicated unprivileged service account with only required directory/device
access. Do not turn an existing login into a system account or grant blanket sudo.
Reader reset operations need narrowly scoped noninteractive privileges; validate
those separately before enabling readers.


### File System Security

Review mount options against the actual host and recovery requirements before
changing them. Keep temporary files private and protect sensitive logs.

## Monitoring and Logging

### Log Management

#### Systemd Journal

Monitor service logs:

```bash
# View web UI logs
journalctl -u scps -f

# View broadcaster logs
journalctl -u scps-reader -f

# View logs from last hour
journalctl -u scps --since "1 hour ago"

# Export only to a private location, then redact before sharing.
umask 077
journalctl -u scps --since "1 hour ago" > "$HOME/scps-logs.txt"
```

#### Log Rotation

Systemd journal is configured with automatic rotation. Verify settings:

```bash
# Check journal size
journalctl --disk-usage

# Configure max size (optional)
sudo nano /etc/systemd/journald.conf
# Set: SystemMaxUse=500M
sudo systemctl restart systemd-journald
```

### Security Monitoring

#### Failed Login Attempts

Monitor Better Auth login failures:

```bash
# Check web logs for authentication failures
journalctl -u scps | grep -i "auth.*fail"
```

#### NFC Tap Monitoring

Monitor for suspicious tap patterns:

```bash
# Check broadcaster logs for unusual activity
journalctl -u scps-reader | grep -i "error\|fail"
```

## Backup Security

### Encrypted Backups

Use the typed backup workflow and `rclone crypt`, not plaintext uploads of database
files. From `web-next`:

```sh
node --import tsx tools/ops/setup-r2-crypt.ts
node --import tsx tools/ops/cloud_backup_r2.ts
```

Keep R2 credentials scoped to the backup bucket. Restrict rclone configuration
permissions, and preserve crypt passwords/salts in a separate secure recovery
location: new passwords do not decrypt old objects. Do not log credentials or
put them in command-line arguments. No retention deletion is enabled automatically.

### Backup Access Control

Restrict access to backup directory:

```bash
chmod 700 "$PROJECT_ROOT/db_backups"
# Verify this directory belongs to the configured backup/service user.
ls -ld "$PROJECT_ROOT/db_backups"
```

### Automated Backup Verification

Regularly rehearse recovery using disposable ledgers and local rclone aliases.
For archive inspection, create an empty private staging directory and run from
`web-next`:

```sh
node --import tsx tools/sqlite-snapshot.ts extract \
  /absolute/path/to/backup.tar.zst /absolute/path/to/empty-staging
```

The extractor accepts only root regular database/WAL/SHM members, rejects unsafe,
duplicate and truncated archives, checks decompressor completion, and folds staged
WAL through SQLite into an integrity/FK-checked snapshot. Never extract over a live
ledger. Verify expected balances/history as well as structural integrity.

## Incident Response

### Security Breach Response

If you suspect a security breach:

1. **Immediately**:
   ```bash
   # Stop services
   sudo systemctl stop scps scps-reader scps-reader2
   # Stop every other writer too; preserve logs separately with restricted permissions.
   # From web-next, preserve a consistent ledger snapshot:
   node --import tsx tools/ops/web_backup.ts /absolute/path/to/incident.tar.zst
   ```

2. **Investigate**:
   ```bash
   # Check logs
   journalctl -u scps --since today
   journalctl -u scps-reader --since today
   
   # Check for unauthorized access
   last -f /var/log/wtmp
   ```

3. **Rotate Secrets**:
   - Generate new BETTER_AUTH_SECRET
   - Generate new NFC_TAP_SECRET
   - Update both web UI and broadcaster configurations
   - Restart services

4. **Review**:
   - Check database for suspicious transactions
   - Verify no unauthorized user accounts
   - Review system logs for unusual activity

### Database Integrity

Regularly verify database integrity:

```bash
# Use the actual configured absolute database path.
sqlite3 /absolute/path/to/scps.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Do not copy a live database/WAL or unpack an archive onto it. Stop all writers
before restore. From `web-next`, the remote restore command is:

```sh
node --import tsx tools/ops/restore_from_r2.ts backup.tar.zst --writers-stopped
```

Restore requires known inactive/failed web service state, private staging and a
verified pre-restore snapshot; the flag also covers undetectable external writers.
Old cent-based domain backups are normalized only in staging. Non-cent legacy
money requires explicit conversion. See [Database Guide](database.md) for migration
and recovery: rollback requires the matching application and database together,
and restoring a snapshot loses later ledger writes.

## Security Checklist

### Production Deployment

- [ ] All secrets generated with strong randomness
- [ ] `.env.local` and `.env.broadcaster` have 600 permissions
- [ ] Ledger directory/database/sidecars restricted to service user or trusted group
- [ ] Firewall configured and enabled
- [ ] SSH key authentication enabled, password auth disabled
- [ ] Nginx reverse proxy with SSL configured
- [ ] Security headers enabled in Nginx
- [ ] Rate limiting configured
- [ ] Systemd services run as non-root user
- [ ] First administrator provisioned through CLI; registration linking and role grants restricted to administrators
- [ ] Automated backups configured
- [ ] Backup verification tested
- [ ] Log monitoring in place
- [ ] System updates automated
- [ ] Unnecessary services disabled

### Regular Maintenance

- [ ] Review logs weekly
- [ ] Update system packages monthly
- [ ] Test backup restore quarterly
- [ ] Rotate secrets annually
- [ ] Review user accounts quarterly
- [ ] Check SSL certificate expiry
- [ ] Verify firewall rules
- [ ] Test incident response procedure

## Resources

- [Deployment Guide](deployment.md) - Production setup
- [Authentication Guide](authentication.md) - Better Auth configuration
- [Database Guide](database.md) - Backup and maintenance
- [NFC Setup](nfc-setup.md) - Secure NFC configuration


