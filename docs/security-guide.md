# Security Guide

This guide covers security best practices, hardening recommendations, and secrets management for the Student Council Payment System in production.

## Overview

The Student Council Payment System handles student financial data and requires proper security measures. This guide focuses on the Raspberry Pi 4 Model B deployment, which is the tested and supported platform.

## Secrets Management

### Environment Variables

All sensitive configuration should be stored in environment variables, never committed to version control.

#### Web UI Secrets (`web-next/.env.local`)

```bash
# Database location (use absolute path)
DATABASE_PATH=$PROJECT_ROOT/stuco.db

# Better Auth secret (generate with: openssl rand -base64 32)
BETTER_AUTH_SECRET=<your-generated-secret>

# NFC tap authentication (generate with: openssl rand -hex 32)
NFC_TAP_SECRET=<your-nfc-secret>

# Optional: Trusted origins for Better Auth
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
PN532_DEVICE=tty:AMA0:pn532
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
chmod 600 $PROJECT_ROOT/web-next/.env.local
chmod 600 $PROJECT_ROOT/.env.broadcaster

# Verify ownership
chown $USER:$USER $PROJECT_ROOT/web-next/.env.local
chown $USER:$USER $PROJECT_ROOT/.env.broadcaster
```

### Database Security

```bash
# Set appropriate database permissions
chmod 664 $PROJECT_ROOT/stuco.db
chmod 664 $PROJECT_ROOT/stuco.db-wal
chmod 664 $PROJECT_ROOT/stuco.db-shm

# Verify ownership
chown $USER:$USER $PROJECT_ROOT/stuco.db*
```

## Network Security

### Firewall Configuration

Use UFW (Uncomplicated Firewall) on Raspberry Pi OS:

```bash
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

Better Auth is configured with:
- Minimum 8 characters
- Password hashing with bcrypt
- Session-based authentication
- CSRF protection

#### Signup Code Protection

The system uses a signup code to prevent unauthorized account creation:

```bash
# In web-next/.env.local
SIGNUP_CODE=your-secure-code
```

Setup a strong code and share it only with authorized staff.

#### Session Security

Sessions are stored in the database with:
- Secure cookie flags (HttpOnly, SameSite)
- Session expiration
- Token rotation on login

### NFC Tap Authentication

The tap broadcaster authenticates with the web server using a shared secret:

1. **Server-side validation**: `/api/nfc/ws` verifies the secret before accepting taps
2. **Rate limiting**: Failed authentication attempts are rate-limited (5 attempts/minute)
3. **Connection tracking**: Each broadcaster connection is logged with IP and timestamp

### Input Validation

All user inputs are validated:

- **Server-side**: Zod schemas validate all form data
- **Database**: SQLite constraints prevent invalid data
- **Amount validation**: Currency amounts validated as positive decimals
- **UID validation**: Card UIDs must match expected format

## Reverse Proxy (Production)

### Nginx Configuration

Use Nginx as a reverse proxy for SSL termination and security headers:

```nginx
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
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
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
# Create dedicated user for stuco (if not already done)
sudo useradd -r -s /bin/bash -d $HOME $USER
sudo mkdir -p $HOME
sudo chown -R $USER:$USER $HOME

# Never run services as root
# systemd services should specify User=$USER
```

### File System Security

#### Read-Only Partitions

Consider mounting `/boot` as read-only:

```bash
# Add to /etc/fstab
/boot vfat defaults,ro 0 2
```

#### Secure Temporary Directories

```bash
# Add to /etc/fstab for /tmp
tmpfs /tmp tmpfs defaults,noexec,nosuid,nodev 0 0
```

## Monitoring and Logging

### Log Management

#### Systemd Journal

Monitor service logs:

```bash
# View web UI logs
journalctl -u stuco-web -f

# View broadcaster logs
journalctl -u tap-broadcaster -f

# View logs from last hour
journalctl -u stuco-web --since "1 hour ago"

# Export logs
journalctl -u stuco-web --since "2025-11-01" > /tmp/stuco-logs.txt
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
journalctl -u stuco-web | grep -i "auth.*fail"
```

#### NFC Tap Monitoring

Monitor for suspicious tap patterns:

```bash
# Check broadcaster logs for unusual activity
journalctl -u tap-broadcaster | grep -i "error\|fail"
```

## Backup Security

### Encrypted Backups

For cloud backups (Cloudflare R2), consider encrypting before upload:

```bash
# Encrypt backup
gpg --symmetric --cipher-algo AES256 stuco_backup_20251110.tar.gz

# Upload encrypted version
rclone copy stuco_backup_20251110.tar.gz.gpg r2:stuco-db-backups/

# Restore and decrypt
rclone copy r2:stuco-db-backups/stuco_backup_20251110.tar.gz.gpg .
gpg --decrypt stuco_backup_20251110.tar.gz.gpg > stuco_backup_20251110.tar.gz
```

### Backup Access Control

Restrict access to backup directory:

```bash
chmod 700 $PROJECT_ROOT/db_backups
chown -R $USER:$USER $PROJECT_ROOT/db_backups
```

### Automated Backup Verification

Test restore process regularly:

```bash
#!/bin/bash
# backup-verify.sh
BACKUP_FILE=$(ls -t db_backups/*.tar.gz | head -1)
TEST_DIR="/tmp/backup-test-$$"

mkdir -p "$TEST_DIR"
tar -xzf "$BACKUP_FILE" -C "$TEST_DIR"
sqlite3 "$TEST_DIR/stuco.db" "PRAGMA integrity_check;" || exit 1
rm -rf "$TEST_DIR"
echo "Backup verification successful"
```

## Incident Response

### Security Breach Response

If you suspect a security breach:

1. **Immediately**:
   ```bash
   # Stop services
   sudo systemctl stop stuco-web
   sudo systemctl stop tap-broadcaster
   
   # Backup current state
   tar -czf incident-backup-$(date +%Y%m%d-%H%M%S).tar.gz stuco.db* logs/
   ```

2. **Investigate**:
   ```bash
   # Check logs
   journalctl -u stuco-web --since today
   journalctl -u tap-broadcaster --since today
   
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
# Check integrity
sqlite3 stuco.db "PRAGMA integrity_check;"

# If corruption detected, restore from backup
cp stuco.db stuco.db.corrupted
tar -xzf db_backups/latest-backup.tar.gz
```

## Security Checklist

### Production Deployment

- [ ] All secrets generated with strong randomness
- [ ] `.env.local` and `.env.broadcaster` have 600 permissions
- [ ] Database files have appropriate permissions (664)
- [ ] Firewall configured and enabled
- [ ] SSH key authentication enabled, password auth disabled
- [ ] Nginx reverse proxy with SSL configured
- [ ] Security headers enabled in Nginx
- [ ] Rate limiting configured
- [ ] Systemd services run as non-root user
- [ ] Signup code changed from default
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

## Reporting Security Issues

For vulnerability reports, see root [SECURITY.md](../SECURITY.md) file.

**Never discuss security vulnerabilities in public issues or pull requests.**

**Last updated: November 12, 2025**

