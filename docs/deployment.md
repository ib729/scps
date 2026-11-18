# Deployment Guide

Deploy the Student Council Payment System as **one custom web process** with a writable SQLite ledger and, where needed, separate native NFC reader processes. Use Node.js **>=26.13.1 <27** and pnpm **12.21.0**. All repository application and operational logic is TypeScript. Python >=3.11 may be required to compile third-party native dependencies; it is not needed by application workflows at runtime.

Run `pnpm dev` / `pnpm start`, not `next dev` / `next start`: the custom `server.ts` supplies authenticated NFC WebSockets and trusted signup client identity. Package-local tools run from `web-next` with `node --import tsx`.

## Before deployment

- Use a nonroot service account with a maintained Linux host, sufficient build memory and appropriate native-build tools.
- Keep one web process. Signup's five-attempt/ten-minute per-client budget includes successful and failed attempts and resets with that process; multiple workers require shared limiting storage.
- Prepare DNS, HTTPS, a loopback reverse proxy, private secrets and tested encrypted recovery material.
- Preserve the existing ledger, auth credentials, application revision and environment files before an upgrade. **Do not initialize/reset an existing installation.**
- Current schema is `customers` / `customer_id` / `user_customer_links`, with roles `admin | staff | customer`. Follow [Existing-schema upgrade](#existing-schema-upgrade-and-rollback) before starting the new app against an old ledger.

## Native Debian/Ubuntu deployment

### Initial setup

From a repository owned by the intended service user, with sudo access:

```bash
# Repository root
./scripts/setup.sh
```

For a new installation, the shell bootstrap requires Git and a clean checkout on a branch with a configured upstream. It fast-forwards before installing Node, pinned pnpm and OS dependencies. Rerunning setup after the web updater is configured skips the pull, install and build.

The typed `web-next/tools/ops/setup-host.ts` stage:

1. Creates/restricts `web-next/.env.local`, sets the canonical quoted database path and generates a missing Better Auth secret without logging its value. A new environment uses port 38173 and matching localhost URL/origin; an existing environment retains its settings.
2. Initializes both core and auth schemas **only if the database does not exist**. The initial school year runs from the host's current local calendar year to the following year, for example `2026-2027`. Setup preserves existing databases and requires explicit legacy migration.
3. Builds as the service user with the pinned PATH preserved through sudo.
4. If systemd is selected, installs the managed web service, inactive reader units, and the web updater with its check timer. It retires owned legacy units and restarts **only `scps`**.

Use `--systemd` or `--no-systemd` to select explicitly. For a new installation, noninteractive setup without a flag skips systemd. If setup finds `scps.service` for this checkout, it skips the prompt and uses systemd. Once the updater is installed, reruns keep SCPS running, or start it if it is stopped. If an update is in progress, setup leaves the services alone. If systemd was skipped, start from `web-next` with `pnpm start`.

Setup refuses to retire a legacy unit with drop-ins or a unit belonging to another repository. Review and migrate those overrides manually before retrying. Legacy unit files are kept disabled for rollback; setup does not create aliases or restart them.

Do not copy unrendered repository units directly: they contain placeholders. Configure public URL, origins and secrets before public access, then restart web. Setup itself is not proof of a working production environment.

### Environment and writable ledger

The custom server loads `web-next/.env.local`. Set a real, private configuration, for example:

```dotenv
DATABASE_PATH=/srv/scps-data/scps.db
BETTER_AUTH_SECRET=<independently-generated-random-secret>
NFC_TAP_SECRET=<separate-shared-reader-secret>
NEXT_PUBLIC_APP_URL=https://payments.example.com
TRUSTED_ORIGINS=https://payments.example.com
TRUST_PROXY=true
NEXT_TELEMETRY_DISABLED=1
```

Generate independent secrets with `openssl rand -hex 32`; copy them securely rather than putting real secrets in commands/history. Restrict the env file to its owner (`chmod 600 web-next/.env.local`). A separate systemd `EnvironmentFile` may supply values instead; keep it protected and remember process environment takes precedence over dotenv.

Configured relative `DATABASE_PATH` resolves against `web-next`, regardless of caller cwd. Without configuration, discovery checks `web-next/stuco.db`, root `stuco.db`, `web-next/scps.db`, then root `scps.db`. If none exists, root `scps.db` is selected. Prefer one explicit absolute path in production.

The service user needs access to the **ledger directory**, not just the file, so SQLite can create WAL/SHM. Restrict directory traversal and database access to the intended account/administrators; do not make it world-writable or change ownership on a live ledger. See [Database](database.md) and [Security](security-guide.md).

The rendered web unit defaults to `HOSTNAME=0.0.0.0`; new automated setups configure `PORT=38173` in `.env.local`. Existing configurations without a port retain the server default of 3000. For native loopback-only deployment, use a systemd override:

```bash
sudo systemctl edit scps.service
```

```ini
[Service]
Environment="HOSTNAME=127.0.0.1"
Environment="PORT=38173"
```

Then reload/restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart scps.service
sudo systemctl status scps.service
journalctl -u scps.service -f
```

Change `PORT` through environment, not an invented `pnpm start -p` flag. Match the reverse proxy and reader URL to the chosen port. If URL/origin values change, rebuild for public build-time configuration as appropriate before restart.

### Application updates

After reviewing and making the intended release available on origin, run **on the server**, from `web-next`:

```bash
node --import tsx tools/ops/deploy-vps.ts
node --import tsx tools/ops/deploy-vps.ts main
```

This refuses a dirty checkout, fetches origin, selects the branch (default `main`), pulls ff-only, installs with `--frozen-lockfile`, builds and only then restarts/status-checks web. Install/build failures stop before restart; failures are not automatic application/database rollbacks. This flow does **not** migrate an old ledger for you.

From a configured local checkout, the separate deployment transport is:

```bash
# Local web-next directory
node --import tsx tools/ops/deploy-remote.ts scps@server.example.com main
```

It uses `ssh -t`; default repository is the remote user's `$HOME/scps`. `SCPS_REMOTE_PATH='/absolute/path with spaces/scps'` overrides it literally. Directory and branch arguments are POSIX-quoted; custom paths do not expand `$HOME`, `~` or shell metacharacters. SSH exit/signal propagates. The remote must already have the required Node/pnpm/dependencies to invoke the typed deployment tool.

#### Enable the Update SCPS button

Run `./scripts/setup.sh --systemd` from the checkout root as the service user with sudo access. Use a maintenance window for the first installation on an existing live host: setup builds in the original checkout once and restarts web. Setup installs the updater and only grants passwordless access to restart `scps.service`. It refuses to replace a customized web launcher or conflicting updater files.

The checkout must track a branch on `origin`. The service user needs noninteractive read access to that remote and space for two isolated builds. Keep the original checkout and its `.env.local` in place as the updater's control directory. The worker fetches and runs code from the configured branch as the SCPS user, so restrict who can push to it.

Administrators can deploy from **Settings > Application updates > Update SCPS**. The worker builds separately using a disposable SQLite database, tests startup, then restarts only web and checks `/login` on the expected process. If the new release fails, it boots the previously confirmed release. See `journalctl -u scps-update.service` for details. The health check does not verify NFC hardware or payments.

Systemd setup configures a 20-second stop timeout. On an existing updater-managed installation still using the old 90-second default, the updated setup script installs `31-release-stop-timeout.conf` and reloads systemd without restarting web. If the original checkout has an older setup script, use `sudo systemctl edit scps.service` to add `TimeoutStopSec=20s` under `[Service]`, then reload systemd. Retry updates outside payment activity because a timed-out stop disconnects remaining requests.

On hosts or service cgroups with at most 2 GiB of RAM, the production build uses one static generation worker, lower-memory Webpack compilation, and a 768 MiB Node old-generation limit by default. The updater keeps its existing RAM cap to protect the live service. In testing with a 945 MiB RAM cap, the build used about 900 MiB of swap. Keep swap available on small hosts; if builds still exhaust memory, use a larger host instead of removing the cap on a busy server.

The `scps-update-check.timer` checks whether 30 days have passed since the last successful upstream check. It shows **An update is available** in Settings without installing anything or restarting SCPS. See `journalctl -u scps-update-check.service` for check failures.

Do not publish migration-dependent releases to the updater branch until the host is ready. The worker blocks changes to known schema and database startup files and never runs migrations or restores the ledger.

To replace an older manually installed updater or to perform manual maintenance, disable `scps-update.path` and `scps-update-check.timer` if installed, then wait for the worker services to finish. In a maintenance window, stop web and archive the old updater units, launcher, `30-release-update.conf`, `31-release-stop-timeout.conf` if present, sudoers rule and `/var/lib/scps-update` before reloading systemd. Keep the ledger and `.env.local` in place. Follow the manual migration instructions if needed before running setup again. Do not restart the original checkout against an incompatible ledger.

### Reader services

Readers may run on a separate Pi while web/SQLite live on the VPS. Install matching Node/package dependencies and native libnfc tools on that host. Supported scope is PN532 UART/I2C and libnfc-supported USB; unsupported or ambiguous explicit selectors fail. Configure exact devices for two readers. See [NFC Setup](nfc-setup.md) and [Dual readers](nfc-setup.md#dual-readers) for wiring, calibration and remote-reader setup.

Create a restricted repository-root `.env.broadcaster` with the matching server secret and deployment URL:

```dotenv
NEXTJS_URL=https://payments.example.com
NFC_TAP_SECRET=<same-reader-secret-as-web>
```

Both reader units load that file. Their rendered defaults select `tty:USB0:pn532` / `tty:USB1:pn532` and lanes `reader-1` / `reader-2`; adjust each installed unit/drop-in if those are not the actual devices/lanes. Avoid a shared `PN532_DEVICE`/`POS_LANE_ID` in the common env file when readers require different values.

Before enabling:

- Give the service user actual serial/I2C/USB permissions. For Debian serial devices this often means `dialout` membership and a new login/service restart; native USB/I2C may need appropriate udev/group rules.
- Confirm no unmanaged process owns the selected devices. Probes/reset must not race active broadcasters.
- Review the units' pre-start USB resets: the unprivileged Node tool calls `sudo tee` on `/sys/bus/usb/drivers/usb/unbind` and `/sys/bus/usb/drivers/usb/bind`. It needs **noninteractive** privileges; setup does not install sudoers rules. Use `visudo` and a site-reviewed, narrowly scoped policy, not unrestricted Node/tee/modprobe sudo. Even access restricted to those two sysfs paths permits USB disruption, so treat the service identity as privileged hardware access.
- UART/I2C or native USB deployments not using the default USB-serial reset must deliberately adapt the installed pre-start/device settings; the supplied reset targets USB0/USB1.

Only after that configuration:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now scps-reader.service
# Only when the second reader is configured:
sudo systemctl enable --now scps-reader2.service
journalctl -u scps-reader.service -u scps-reader2.service -f
```

Units use package cwd and `node --import tsx hardware/tap-broadcaster.ts`, `Restart=always`, `RestartSec=5`, a one-second post-stop settle and a ten-second stop window. Reader 2 retains its five-second pre-start settle after reset. These settings are not evidence that physical hardware passes the stop deadline.

For a network-only test or simulation, from `web-next`:

```bash
node --import tsx tools/ops/test-nfc.ts
node --import tsx tools/ops/run-nfc.ts --simulate
```

The wrappers load `.env.broadcaster`; direct hardware entrypoints need environment supplied separately. A successful authenticated simulated tap proves neither native reader health nor physical recovery. For hardware diagnosis stop owners first; see the full [23-workflow reference](scripts.md#operational-workflows). Recovery tools intentionally leave services stopped when reset/probe fails. Administrator Settings repair actions are unavailable without configured host privileges; do not grant broad passwordless root or arbitrary Node execution to enable them.

Settings backup and repair invoke Node/tsx from `web-next`. Existing `WEB_BACKUP_SCRIPT` and `FIX_READERS_SCRIPT_PATH` overrides must point to compatible typed entrypoints; relative overrides resolve against the package, not the shell's launch directory. Reader repair runs Node without elevation and requires only its fixed native service/module/ownership commands through a narrowly reviewed sudo policy; never grant arbitrary Node or general `systemctl`/`modprobe` execution to the web identity.
These actions target the web host only. When readers run on a separate Pi, run the reader-host tools there; local Settings repair is not remote hardware recovery.

## HTTPS and reverse proxy

### Automated HTTPS on a dedicated VPS

On a Debian or Ubuntu VPS with TCP ports 80 and 443 open, run one of:

```sh
./scripts/setup.sh --https scps.school.org
./scripts/setup.sh --https YOUR_PUBLIC_IP
```

Replace the example with the actual hostname or a static public IPv4 or IPv6 address. Pass IPv6 without brackets. IP mode needs no DNS. For a hostname, ask whoever manages DNS to point its `A` or `AAAA` record at the VPS first. If the school uses Cloudflare for DNS, leave the record **DNS only**. Do not enable the Cloudflare proxy or add a second proxy hop to this setup.

The command enables the systemd web service, binds the app to loopback, configures its public URL and trusted origin before building, and configures Caddy to obtain and renew Let's Encrypt certificates. IP certificates use the approximately six-day `shortlived` profile and renew automatically. Setup prints the URL only after checking trusted HTTPS and the login response locally. Confirm it also opens from a device outside the VPS network before handing over the URL.

Setup needs [the official Caddy 2.11.4 or newer 2.x Debian package](https://caddyserver.com/docs/install#debian-ubuntu-raspbian). It installs Caddy if a compatible package is available from configured apt repositories. Otherwise install the official package once, then rerun setup. Ports 80 and 443 must be available to Caddy. Setup does not change DNS, firewalls, or custom Caddyfiles, and refuses unrelated web-service overrides. To retry after fixing DNS or firewall rules, use the same hostname or IP. Use the manual configuration below if the VPS already hosts other sites or you need to change an existing managed HTTPS address.

### Manual Nginx configuration

Default `TRUST_PROXY=false` uses the socket peer. Set `TRUST_PROXY=true` **only** for a single loopback reverse proxy, with no publicly reachable app port. Only a loopback immediate peer's rightmost valid forwarded address is trusted; caller `X-Real-IP` and `x-scps-client-ip` are ignored. Nginx must append `$remote_addr` to `X-Forwarded-For` or overwrite it. The automated Caddy configuration overwrites it with the socket peer. Remote or multi-hop topologies are unsupported without separate trust configuration.

Install Nginx and configure DNS for your actual domain. The following assumes TLS certificate files already exist; for initial certificate issuance first serve a plain HTTP site, then use your certificate provider/Certbot before enabling the TLS block. Put `map` and `limit_req_zone` in Nginx's **http context**, not inside `server`:
The proxy example below uses port 3000. Replace it with 38173 for a new automated native setup, or use the port configured for your deployment.


```nginx
map $http_upgrade $scps_connection_upgrade {
    default upgrade;
    '' close;
}
limit_req_zone $binary_remote_addr zone=scps_api:10m rate=10r/s;

server {
    listen 80;
    server_name payments.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name payments.example.com;
    ssl_certificate /etc/letsencrypt/live/payments.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/payments.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;

    location / {
        limit_req zone=scps_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $scps_connection_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/nfc/ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $scps_connection_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    access_log /var/log/nginx/scps_access.log;
    error_log /var/log/nginx/scps_error.log;
}
```

Enable the site under your distribution's Nginx layout, then validate before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

If using Certbot's distribution Nginx integration, obtain/configure your certificate with `sudo certbot --nginx -d payments.example.com`; confirm the installed renewal timer/job and test `sudo certbot renew --dry-run`. Certbot is external administration tooling, not an SCPS application dependency.

Permit SSH before changing firewall policy; allow 80/443 and deny public 3000. Do not lock yourself out of a remote host. The reverse proxy's limits supplement, not replace, application signup authorization and rate limiting.

## Existing-schema upgrade and rollback

Ordinary startup rejects old/mixed/non-cent schemas; it never silently converts money. Deploy/update commands do not replace this maintenance procedure.

1. Stop `scps`, any legacy `stuco-web`, development servers, CLI writers and any external writers. Preserve the old application revision, env files and crypt credentials.
2. With the new typed tools installed, from `web-next`, create a verified snapshot at a new path:

   ```bash
   node --import tsx tools/sqlite-snapshot.ts snapshot /absolute/path/to/scps.db /absolute/path/to/pre-upgrade.db
   ```

3. For a supported cent-based pre-cutover ledger:

   ```bash
   node --import tsx tools/migrate-customer.ts --writers-stopped
   ```

   It takes another verified pre-migration backup and performs atomic domain/role conversion, preserving IDs, balances, cards, archive/payment/login state and credentials. Detected active web service refuses; unavailable systemd warns, so you remain responsible for stopping every writer.

4. For older money schemas, convert from a separate source snapshot:

   ```bash
   node --import tsx tools/import-legacy-db.ts --source /absolute/path/to/legacy-copy.db --target /absolute/path/to/scps.db --writers-stopped
   ```

   This requires known inactive/failed local web state, validates a staged final schema and creates a pre-target backup before SQLite replacement. Scale 10 or absent legacy marker means exact ×10 to cents, scale 100 is unchanged; unsupported scales/unsafe amounts refuse. Specify source/target explicitly; its defaults are root `IMPORTTHIS/stuco.db` and root `stuco.db`.

5. Build/start the new application and check operator/customer login, account links, cents/balances, payment decisions and history. Staff/admin use `/admin`, `/admin/customers`, `/admin/transactions`, `/admin/pos`, `/admin/topup`; `/admin/users` and `/admin/payments` are administrator-only. Buyers use `/customer` or `/customer/pending`. Public `/login`, `/signup` and `/api/*` remain.

Old page GET/HEAD URLs permanently redirect with suffixes/query values preserved; POST actions do not redirect. Public signup is customer-only; linking and role grants remain administrator-controlled. A payment claim does not credit money; confirmed administrator approval credits the base amount once.

For rollback, stop every writer again and restore the **matching old application plus its pre-upgrade database together**. Do not run old SQL callers against customer schema. A snapshot rollback does **not** preserve later ledger writes: retain a copy for deliberate reconciliation before replacing anything. Current restore tools normalize supported old cent-schema backups to the new schema, so that path is for forward recovery, not a way to produce an old-schema rollback ledger.

## Encrypted backup and restore

From `web-next`, configure the storage account used by the backup service/cron:

```bash
export RCLONE_REMOTE=r2
export RCLONE_CRYPT_REMOTE=r2-crypt
export R2_PATH=stuco-db-backups
node --import tsx tools/ops/setup-r2-crypt.ts
node --import tsx tools/ops/cloud_backup_r2.ts
rclone ls r2-crypt:
```

Setup hides crypt password/salt and R2 secret input and avoids printing credential-bearing configuration failures. It reuses raw configuration and creates/updates crypt without deleting it first. Keep the old crypt password/salt and protected rclone configuration to read old backups. The crypt remote maps the raw bucket/path; changing `R2_PATH` alone does not relocate an existing configured crypt root.

Backups use verified **online SQLite snapshots**, `zstd -15 -T0` by default and atomic archive publication. Uploads use the crypt remote, preserve local archives on failure and do not enable retention deletion. Never archive a live ledger and its sidecars by copying them separately.

Local archive, with an existing restricted output directory:

```bash
node --import tsx tools/ops/web_backup.ts /absolute/path/to/backups/manual.tar.zst
```

Daily cron example (replace paths, arrange PATH/rclone credentials, create restricted log directory):

```cron
0 2 * * * cd /srv/scps/web-next && /absolute/path/to/node --import tsx tools/ops/cloud_backup_r2.ts >> /srv/scps/logs/r2-backup.log 2>&1
```

Restore deliberately, after stopping **every** writer:

```bash
sudo systemctl stop scps.service
# Also stop all non-service/external writers before acknowledging the flag.
cd /srv/scps/web-next
node --import tsx tools/ops/restore_from_r2.ts stuco_backup_YYYYMMDD_HHMMSS.tar.zst --writers-stopped
```

Use an actual listed basename, not the placeholder timestamp. Restore requires known inactive/failed local web state; unavailable/unknown/empty state refuses. The flag cannot prove external writers are stopped. It securely downloads/extracts, accepts only root regular SQLite members, folds staged WAL, validates schema/integrity/FKs/cent scale, creates `db_backups/pre_restore_backup_*.tar.zst`, and restores through SQLite without deleting live sidecars. Supported old cent-schema backups normalize privately; arbitrary older money schemas require explicit conversion.

For local `.db` restore, make your own verified pre-restore snapshot first, then run `./scps-cli import-db /absolute/path/to/backup.db --yes` from the repository root with writers stopped. That CLI command has no automatic pre-backup/systemd guard. See [Database](database.md) and [Scripts](scripts.md) for extraction, reset and SQL migration failure semantics. Keep a protected backup of environment files, service/proxy configuration and crypt credentials separately from the database.

## Remote management

Local `web-next/.env.local` or environment:

```dotenv
SCPS_VPS_HOST=server.example.com
SCPS_VPS_USER=scps
SCPS_VPS_DIR=/var/www/scps
SCPS_VPS_PORT=22
SCPS_VPS_SSH_KEY=~/.ssh/id_ed25519
```

From the local repository root:

```bash
./scps-remote-cli
./scps-remote-cli users
```

The wrapper runs the remote `./scps-cli` over `ssh -t`, quotes directory/every argument and propagates SSH failure/signals. Defaults: `/var/www/scps`, port 22, local OS username. An unset host triggers prompts. Remote directories are literal; only a key's leading `~/` expands locally. This is a privileged administrative console, not a customer access tunnel.

## Monitoring, acceptance and troubleshooting

```bash
systemctl status scps.service
journalctl -u scps.service -n 50
journalctl -u scps-reader.service -u scps-reader2.service -f
curl -I http://127.0.0.1:3000/login
```

Use existing routes for basic HTTP reachability; there is no documented dedicated health endpoint/script. A responding login page is not a financial or reader-health check.

Before calling a deployment ready, verify on a disposable copy first and then under your deployment change process:

- [ ] Native dependencies load, production build exists, correct DB opens and directory permits WAL.
- [ ] Login/signup/linking, staff denial of administration, last-admin protection and private customer history behave correctly.
- [ ] Balances and cents match the pre-upgrade ledger; claim does not credit, approval credits once.
- [ ] TLS/origins/proxy client identity and firewall match the actual topology.
- [ ] Encrypted backup is readable with retained crypt material; pre-restore backup and recovery are exercised.
- [ ] Both physical readers pass repeated taps, removal, unplug/replug, unavailable reader, network outage and service-stop timing.

These are **required observations, not a statement that final tests or physical checks have passed**. Service-active status and simulation cannot substitute for hardware acceptance.

For start failures inspect logs for wrong DB/schema, permissions, port conflict or missing build/dependencies. For NFC failures inspect actual device/ownership, `lsusb`, serial permissions and native probe errors with owners stopped. For WebSocket failures check URL/secret, trusted origins and proxy upgrade handling. Check certificate expiry/renewal using your provider's tooling. Avoid changing live ownership or resetting unrelated USB devices as a generic fix.

See [Getting Started](getting-started.md), [Security](security-guide.md), [Database](database.md), [NFC Setup](nfc-setup.md) and [Troubleshooting](troubleshooting.md).
