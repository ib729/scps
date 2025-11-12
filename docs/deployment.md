# Deployment Guide

This guide covers production deployment options for the Stuco system, including Docker, systemd services, SSL configuration, and environment management.

## Prerequisites

- Production-ready server (Raspberry Pi 4B+ or Linux server)
- Domain name (optional, for SSL)
- Node.js 18+, Python 3.9+, pnpm installed
- Build tools installed (see [Getting Started](getting-started.md))

## Deployment Options

### Option 1: Docker Deployment (Recommended)

Docker provides isolated, reproducible deployments with easy scaling.

#### Build Docker Image

```bash
cd web-next
docker build -t stuco-web:latest .
```

The Dockerfile uses multi-stage builds:
- `deps` stage: Installs dependencies with build tools
- `builder` stage: Builds Next.js production bundle
- `runner` stage: Minimal runtime image with Node.js only

#### Run Container

```bash
docker run -d \
  --name stuco-web \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_PATH=/app/data/stuco.db \
  -e NFC_TAP_SECRET=your-production-secret \
  -v /path/to/stuco.db:/app/data/stuco.db:rw \
  --restart unless-stopped \
  stuco-web:latest
```

**Environment Variables:**
- `NODE_ENV=production` - Optimizes Next.js for production
- `DATABASE_PATH` - Absolute path to SQLite database
- `NFC_TAP_SECRET` - Shared secret for NFC tap authentication
- `PORT` - Port to listen on (default: 3000)

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  web:
    build: ./web-next
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/stuco.db
      - NFC_TAP_SECRET=${NFC_TAP_SECRET}
    volumes:
      - ./stuco.db:/app/data/stuco.db:rw
      - ./db_backups:/app/backups:rw
    restart: unless-stopped
    
  tap-broadcaster:
    image: python:3.11-slim
    command: python /app/tap-broadcaster.py --device tty:AMA0:pn532
    environment:
      - NEXTJS_URL=http://web:3000
      - NFC_TAP_SECRET=${NFC_TAP_SECRET}
    volumes:
      - .:/app
      - /dev:/dev
    privileged: true
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

### Option 2: Systemd Services (Native)

Run directly on the host system using systemd for process management.

#### Web UI Service

Create `/etc/systemd/system/stuco-web.service`:

```ini
[Unit]
Description=Stuco Web UI
After=network.target

[Service]
Type=simple
User=stuco
Group=stuco
WorkingDirectory=/home/stuco/stuco/web-next
Environment="NODE_ENV=production"
Environment="DATABASE_PATH=/home/stuco/stuco/stuco.db"
Environment="NFC_TAP_SECRET=your-production-secret"
Environment="PORT=3000"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

**Setup:**
```bash
# Create dedicated user
sudo useradd -r -s /bin/bash -d /home/stuco stuco
sudo mkdir -p /home/stuco/stuco
sudo chown -R stuco:stuco /home/stuco/stuco

# Build application
cd /home/stuco/stuco/web-next
sudo -u stuco pnpm build

# Install and enable service
sudo systemctl daemon-reload
sudo systemctl enable stuco-web
sudo systemctl start stuco-web
```

#### NFC Tap Broadcaster Service

The `tap-broadcaster.service` file is already included in the repo (in `systemd/`). Install it:

```bash
sudo cp systemd/tap-broadcaster.service /etc/systemd/system/
sudo nano /etc/systemd/system/tap-broadcaster.service
```

Update the environment variables:

```ini
[Unit]
Description=NFC Tap Broadcaster for Stuco POS
After=network.target

[Service]
Type=simple
User=stuco
Group=stuco
WorkingDirectory=/home/stuco/stuco
Environment="NEXTJS_URL=http://localhost:3000"
Environment="NFC_TAP_SECRET=your-production-secret"
Environment="POS_LANE_ID=default"
Environment="PN532_DEVICE=tty:AMA0:pn532"
ExecStart=/home/stuco/stuco/.venv/bin/python /home/stuco/stuco/tap-broadcaster.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable tap-broadcaster
sudo systemctl start tap-broadcaster
```

#### Service Management

```bash
# Check status
sudo systemctl status stuco-web
sudo systemctl status tap-broadcaster

# View logs
journalctl -u stuco-web -f
journalctl -u tap-broadcaster -f

# Restart services
sudo systemctl restart stuco-web
sudo systemctl restart tap-broadcaster

# Stop services
sudo systemctl stop stuco-web
```

**Quick Start After Reboot:**

When you reboot your system:

1. ✅ Network starts
2. ✅ `stuco-web` service starts automatically
3. ✅ Next.js server loads with WebSocket support
4. ✅ `tap-broadcaster` service starts automatically
5. ✅ Connects to Next.js via WebSocket
6. ✅ Ready to detect NFC card taps

**Total startup time:** ~10-15 seconds

**Verify after reboot:**
```bash
# 1. Check services are running
sudo systemctl status stuco-web tap-broadcaster

# 2. Test web server
curl http://localhost:3000

# 3. Check NFC broadcaster logs
journalctl -u tap-broadcaster -n 20

# Should show:
# [WS] Connected successfully
# [WS] Authenticated successfully
# [NFC] Waiting for card tap...
```

**Helper Scripts:**
You also have these scripts available:

```bash
# Test NFC connection
./scripts/test-nfc.sh

# Run broadcaster with all settings (if you stop the service)
./scripts/run-nfc.sh --simulate
```

**Access Your Application:**
Once services are running:
- **Web UI:** http://localhost:3000 (or http://your-ip:3000)
- **POS Page:** http://localhost:3000/pos
- **Dashboard:** http://localhost:3000/dashboard

#### Production Ready Checklist

✅ Next.js built for production  
✅ WebSocket server configured  
✅ NFC broadcaster configured  
✅ USB device detected  
✅ Authentication secret set  
✅ Auto-start on boot enabled  
✅ Restart on failure enabled  
✅ Logs configured (journalctl)  

## Reverse Proxy with Nginx

Use nginx as a reverse proxy for SSL termination and improved performance.

### Install Nginx

```bash
sudo apt update
sudo apt install nginx
```

### Configure Site

Create `/etc/nginx/sites-available/stuco`:

```nginx
upstream stuco_web {
    server localhost:3000;
    keepalive 64;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name stuco.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name stuco.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/stuco.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stuco.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;

    # Proxy to Next.js
    location / {
        proxy_pass http://stuco_web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE for NFC taps (no buffering)
    location /api/nfc/stream {
        proxy_pass http://stuco_web;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        chunked_transfer_encoding on;
    }

    # Access Logs
    access_log /var/log/nginx/stuco_access.log;
    error_log /var/log/nginx/stuco_error.log;
}
```

### Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/stuco /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL with Let's Encrypt

### Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

### Obtain Certificate

```bash
sudo certbot --nginx -d stuco.example.com
```

Certbot will:
- Verify domain ownership
- Obtain certificate
- Update nginx configuration
- Set up auto-renewal

### Auto-Renewal

Certbot automatically sets up a cron job. Test renewal:

```bash
sudo certbot renew --dry-run
```

## Environment Configuration

### Production Environment Variables

Create `/home/stuco/stuco/web-next/.env.production`:

```bash
NODE_ENV=production
DATABASE_PATH=/home/stuco/stuco/stuco.db
NFC_TAP_SECRET=<generate-with-openssl>
NEXT_TELEMETRY_DISABLED=1
```

Generate a secure secret:

```bash
openssl rand -hex 32
```

### Secure Secrets Management

**Option 1: Environment files with restricted permissions**
```bash
chmod 600 /home/stuco/stuco/web-next/.env.production
chown stuco:stuco /home/stuco/stuco/web-next/.env.production
```

**Option 2: Systemd environment files**
```bash
# Create /etc/stuco/environment
DATABASE_PATH=/home/stuco/stuco/stuco.db
NFC_TAP_SECRET=your-secret

# Restrict permissions
sudo chmod 600 /etc/stuco/environment
sudo chown stuco:stuco /etc/stuco/environment

# Reference in service file
EnvironmentFile=/etc/stuco/environment
```

## Database Configuration

### Enable WAL Mode

For production with concurrent access:

```bash
sqlite3 /home/stuco/stuco/stuco.db "PRAGMA journal_mode=WAL;"
```

### Permissions

```bash
chown stuco:stuco /home/stuco/stuco/stuco.db*
chmod 664 /home/stuco/stuco/stuco.db*
```

## Port Management

### Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Block direct access to app (optional)
sudo ufw deny 3000/tcp
```

### Change Default Port

Modify in systemd service or docker-compose:

```bash
Environment="PORT=8080"
```

Or in Next.js:
```bash
pnpm start -p 8080
```

## Health Checks

### Systemd Health Check

Add to service file:

```ini
[Service]
ExecStartPost=/bin/sleep 5
ExecStartPost=/usr/bin/curl -f http://localhost:3000/api/health || exit 1
```

### Docker Health Check

Add to Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js
```

## Monitoring

### Log Aggregation

```bash
# View combined logs
journalctl -u stuco-web -u tap-broadcaster -f

# Export logs
journalctl -u stuco-web --since "1 hour ago" > /tmp/stuco_logs.txt
```

### Performance Monitoring

```bash
# Check resource usage
systemctl status stuco-web

# Monitor in real-time
htop -p $(pgrep -f "node.*start")
```

## Backup Strategy

### Automated Database Backups

See [Database Guide](database.md) for cron setup.

```bash
# Add to crontab
0 2 * * * cd /home/stuco/stuco && tar -czf db_backups/auto_$(date +\%Y\%m\%d).tar.gz stuco.db*
```

### Full System Backup

```bash
# Backup entire application
tar -czf stuco_full_backup_$(date +%Y%m%d).tar.gz \
  /home/stuco/stuco \
  /etc/systemd/system/stuco-*.service \
  /etc/nginx/sites-available/stuco
```

## Troubleshooting

### Service Failed to Start

**Check logs:**
```bash
journalctl -u stuco-web -n 50
journalctl -u tap-broadcaster -n 50
```

**Common issues:**
- Port 3000 already in use
- USB device unplugged
- Build files missing (run `cd web-next && pnpm build`)

### NFC Not Detecting Cards

**Check device:**
```bash
ls -l /dev/ttyUSB0
```

**Restart broadcaster:**
```bash
sudo systemctl restart tap-broadcaster
journalctl -u tap-broadcaster -f
```

### WebSocket Not Connecting

**Check web server:**
```bash
curl http://localhost:3000
sudo systemctl status stuco-web
```

**Restart both services:**
```bash
sudo systemctl restart stuco-web tap-broadcaster
```

### Web UI Won't Start

```bash
# Check logs
journalctl -u stuco-web -n 50

# Common issues:
# - Port already in use: change PORT environment variable
# - Database not found: check DATABASE_PATH
# - Permission denied: check file ownership
```

### SSL Certificate Issues

```bash
# Renew certificate manually
sudo certbot renew --force-renewal

# Check certificate expiry
sudo certbot certificates
```

### High Memory Usage

```bash
# Check Node.js memory
NODE_OPTIONS="--max-old-space-size=512" pnpm start

# Add to systemd service
Environment="NODE_OPTIONS=--max-old-space-size=512"
```

**Configuration Files:**
All configuration is in:
- `/etc/systemd/system/stuco-web.service`
- `/etc/systemd/system/tap-broadcaster.service`

To modify:
```bash
sudo nano /etc/systemd/system/stuco-web.service
sudo systemctl daemon-reload
sudo systemctl restart stuco-web
```

## Security Checklist

- [ ] Strong NFC_TAP_SECRET set (32+ hex chars)
- [ ] SSL certificate installed and auto-renewal enabled
- [ ] Firewall configured (ufw/iptables)
- [ ] Services running as non-root user
- [ ] Database file permissions restricted (664)
- [ ] Environment files secured (600)
- [ ] Regular automated backups configured
- [ ] Nginx security headers enabled
- [ ] Rate limiting configured
- [ ] Logs monitored regularly

## Next Steps

- Configure automated backups (see [Database Guide](database.md))
- Set up monitoring alerts
- Review [Security Guide](security.md) for hardening
- Test disaster recovery procedures

**Last updated: November 11, 2025**

