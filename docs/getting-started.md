# Getting Started

Set up the Student Council Payment System with a Next.js custom server, SQLite ledger, TypeScript administrative tools and optional native NFC readers. Buyers are **customers**; operator and buyer pages use separate namespaces.

## Prerequisites

- **Node.js >=26.13.1 <27**.
- **pnpm 12.21.0**.
- **SQLite CLI** for manual setup/maintenance; `zstd` and `rclone` for archive/cloud workflows.
- Native-addon build tools when prebuilt dependencies are unavailable: Linux gcc/g++/make and Python >=3.11; Xcode command-line tools on macOS. Python is for third-party native compilation only, not an SCPS runtime.
- Reader hosts also need the same Node/package dependencies, Debian `libnfc-bin`, `usbutils`, `lsof`, `udev`, and appropriate device permissions.

Check installed versions:

```bash
node --version
pnpm --version
```

To install pinned pnpm locally, from the repository root:

```bash
npm install --prefix .local/pnpm --no-save pnpm@12.21.0
export PATH="$PWD/.local/pnpm/node_modules/.bin:$PATH"
```

For Debian native builds/manual administration, install distribution packages as needed:

```bash
sudo apt update
sudo apt install build-essential python3 pkg-config git curl sqlite3 zstd rclone
```

On a Pi hosting the whole stack, allow enough memory for native compilation and production builds; a suitably configured swap file may help. Do not copy native `node_modules` between incompatible OS/CPU/Node versions.

## Choose fresh setup or upgrade

**Existing installation? Do not initialize or reset its database.** Preserve its ledger and environment files and follow [Deployment: existing-schema upgrade and rollback](deployment.md#existing-schema-upgrade-and-rollback). Startup rejects legacy/mixed/non-cent schemas; it does not silently convert money.

### Automated Debian or Ubuntu setup

From the repository root, as the intended service user with sudo access:

```bash
./scripts/setup.sh
```

This bootstrap detects Debian, Ubuntu and derivatives, then fast-forwards the current Git branch from its configured upstream. Use a clean checkout; if the pull fails, setup stops before installing dependencies or restarting services. The bootstrap installs OS/Node/native-build prerequisites, pins pnpm and installs package dependencies, then invokes `web-next/tools/ops/setup-host.ts`. The typed stage configures the private env file, creates a missing auth secret without printing it, initializes core+auth only for a **missing** ledger, and builds. A new environment defaults to port **38173** and matching localhost URL and trusted origin. Existing environment settings and ledgers are preserved.

The automated production build and web service disable Next.js telemetry with `NEXT_TELEMETRY_DISABLED=1`.

The script asks whether to install systemd services. Answer yes to install missing units and enable/restart **web only**. Reruns preserve existing units for this checkout. Configure `.env.broadcaster`, device selection, serial access and noninteractive USB reset privileges before enabling the readers. Use `--systemd` or `--no-systemd` to select explicitly; noninteractive runs without a flag skip services. Without systemd, start the production server from `web-next` with `pnpm start`.

The web service binds all interfaces by default. Restrict port 38173 with a firewall or loopback override before exposing the host.

Before allowing public access:

1. Edit `web-next/.env.local` for your actual database, HTTPS URL and trusted origins.
2. Create the initial administrator using `./scps-cli users` from the repository root.
3. Configure the loopback proxy/firewall and restart `scps` as described in [Deployment](deployment.md).
4. Configure encrypted backups using the typed tools below.

### Manual development/fresh setup

From the repository root:

```bash
cd web-next
pnpm install --frozen-lockfile
cp .env.local.example .env.local
chmod 600 .env.local
cd ..
```

Do not overwrite an existing `.env.local`. Choose **one** database path, generate a secret with `openssl rand -hex 32`, and edit the file:

```dotenv
DATABASE_PATH=../scps.db
BETTER_AUTH_SECRET=<generated-secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:3000
# Optional until readers are used:
# NFC_TAP_SECRET=<separate-generated-shared-secret>
```

Relative `DATABASE_PATH` is always relative to `web-next`, so `../scps.db` means the repository-root ledger. If unset, discovery checks package and root `stuco.db` first, then package and root `scps.db`; a new ledger defaults to root `scps.db`. Prefer an absolute path for deployment; its parent directory must be writable by the service account for WAL/SHM.

For a **new** root ledger only, apply both schemas. The existence guard prevents this example from being used to initialize an existing file:

```bash
# Repository root; this matches DATABASE_PATH=../scps.db above.
export DATABASE_PATH="$PWD/scps.db"
test ! -e "$DATABASE_PATH" &&
  sqlite3 -bail "$DATABASE_PATH" < migrations/schema.sql &&
  sqlite3 -bail "$DATABASE_PATH" < web-next/migrations/better_auth_schema.sql
```

If initialization fails, stop and inspect the error before starting the app; do not reset an existing ledger to hide a schema problem. For a different path, set both the environment configuration and commands consistently.

Create the first operator:

```bash
./scps-cli users
```

Choose **Create a new user**, then **Admin**. There is no automatic first-user administrator promotion and no signup code granting operator access. Public `/signup` creates a customer, who remains pending until an administrator links the login to its ledger record.

Inspect the configured database:

```bash
sqlite3 "$DATABASE_PATH" ".tables"
sqlite3 "$DATABASE_PATH" "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Expect core `customers`, `cards`, `accounts`, `transactions`, `user_customer_links`, payment/overdraft tables and auth `user`, `session`, `account`, `verification`. Integrity should report `ok`; FK check should return no rows. Money is integer cents (`550` means ¥5.50).

Start the custom development server:

```bash
cd web-next
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `pnpm dev` invokes `node --import tsx server.ts`; do not bypass it with `next dev`, because it supplies NFC WebSockets and signup client identity. Production is `pnpm build` followed by `pnpm start`; see [Deployment](deployment.md) before exposing it.

## Accounts, routes and common tasks

Roles are exactly `admin | staff | customer`; a teacher who only buys is a customer, not a separate role.

| Task | Page |
|---|---|
| Shared operator dashboard | `/admin` |
| Customer ledger and enrollment | `/admin/customers`, `/admin/customers/[id]` |
| Sales, top-up and transaction history | `/admin/pos`, `/admin/topup`, `/admin/transactions` |
| Administrator-only login linking/role management | `/admin/users` |
| Administrator-only payment review | `/admin/payments` |
| Linked customer balance/history | `/customer` |
| Unlinked customer waiting for approval | `/customer/pending` |

`/login`, `/signup` and `/api/*` remain unchanged. Old page URLs permanently redirect with detail suffixes/query values preserved; POST actions do not redirect.

- Add a customer in `/admin/customers`, then enroll the card on its detail page. The new account starts at zero balance.
- Charge through `/admin/pos`: select by tap or manual customer choice, enter the currency amount and transaction details, then charge.
- Record an operator top-up through `/admin/topup`. Customer-submitted payment requests require administrator review; claiming payment alone does not credit, and confirmed approval credits the base amount once.
- Link a public customer signup to its owned ledger record through administrator `/admin/users`. Shared `/admin` access does not authorize staff to manage users or approve payments.
- Use repository-root `./scps-cli ledger` for administrative signed adjustments. Unlike web POS, CLI debit adjustments do not enforce the weekly overdraft policy.

See [User Guide](user-guide.md) and [Authentication](authentication.md) for workflows and authorization.

## TypeScript administrative tools

From the repository root:

```bash
./scps-cli
./scps-cli users
./scps-cli ledger
./scps-cli import
./scps-cli diagnose
```

The launcher changes cwd to `web-next`; relative CSV/backup arguments resolve there. It uses the same configured ledger and package dependencies as web, not an independent database.

Standalone CSV commands run **from `web-next`**:

```bash
node --import tsx tools/batch-import-customers.ts --template --with-uid customers.csv
node --import tsx tools/batch-import-customers.ts --dry-run customers.csv
node --import tsx tools/batch-import-customers.ts customers.csv
```

Dry run is read-only. Template generation writes only the header and does not open the database. Add your customer rows before importing. Valid rows are atomic; later valid rows can succeed after an earlier bad row, but any row failure returns nonzero. See [Customer import](scripts.md#customer-import-snapshots-and-schema-cutover).

For remote administration configure local `SCPS_VPS_HOST`, `SCPS_VPS_USER`, `SCPS_VPS_DIR`, `SCPS_VPS_PORT`, `SCPS_VPS_SSH_KEY` in `web-next/.env.local`, then run `./scps-remote-cli` from the repository root. It uses `ssh -t` with quoted remote directory/arguments. Defaults and separate remote deployment behavior are in [Remote management](deployment.md#remote-management).

## NFC quick start

Reader support is **PN532 UART/I2C and libnfc-supported USB**, not every NFC device family. Unsupported/ambiguous explicit selections fail. Install native tools on the reader host:

```bash
sudo apt install libnfc-bin usbutils lsof udev
```

Create repository-root `.env.broadcaster`, restrict it to its owner and use the same reader secret as the server:

```dotenv
NEXTJS_URL=http://localhost:3000
NFC_TAP_SECRET=<same-secret-as-server>
POS_LANE_ID=default
```

For a new automated local setup, use `NEXTJS_URL=http://localhost:38173` instead. Match the web server's configured port.

With package dependencies installed, from `web-next`:

```bash
node --import tsx tools/ops/run-nfc.ts --simulate
node --import tsx tools/ops/test-nfc.ts
```

The first accepts manually typed UIDs (uppercase normalization; `q`, `quit`, `exit` or EOF stops). The second sends one authenticated `DEADBEEF` test tap and exits 0/1. Neither proves physical reader operation.

For hardware, **stop broadcaster owners before manually opening the reader**, then select its exact native connstring:

```bash
node --import tsx tools/ops/run-nfc.ts --device pn532_uart:/dev/ttyUSB0
# Or the configured Pi UART / I2C backend:
node --import tsx tools/ops/run-nfc.ts --device pn532_uart:/dev/ttyAMA0
node --import tsx tools/ops/run-nfc.ts --device pn532_i2c:/dev/i2c-1
```

CLI device wins over `PN532_DEVICE`, then deterministic native discovery, then the legacy AMA0 default. Multiple readers need exact per-reader device/lane settings. Legacy UART/I2C selectors are normalized; USB bus/device selectors must resolve uniquely to supported native devices. Native libnfc owns UART baud/I2C timing, not an application serial driver.

Follow [NFC Setup](nfc-setup.md), [Dual readers](nfc-setup.md#dual-readers) and [Deployment reader services](deployment.md#reader-services) before enabling services. Device permissions and noninteractive USB-reset privileges are not installed automatically. A connected/authenticated reader service or existing TTY does not establish hardware health.

## Backups, maintenance and upgrades

Run tools from `web-next`:

```bash
node --import tsx tools/ops/web_backup.ts /absolute/existing/backups/manual.tar.zst
node --import tsx tools/ops/setup-r2-crypt.ts
node --import tsx tools/ops/cloud_backup_r2.ts
```

Local backup uses a verified online SQLite snapshot, then atomic tar+zstd publication; compression/upload failures return nonzero, and an upload failure preserves the local archive. Do not copy a live DB and its sidecars separately. Crypt defaults/configuration, password/salt preservation and cron examples are in [Scripts](scripts.md#backup-restore-and-database-maintenance).

Before restore, conversion, reset or SQL maintenance, stop all writers and keep a verified snapshot. `restore_from_r2.ts backup.tar.zst --writers-stopped` requires known stopped local web state and makes a pre-restore backup. `reset_db.ts --writers-stopped` additionally requires exact typed `yes` and **removes all ledger and authentication data**. The operator assertion cannot detect arbitrary external writers.

For an already-cent-based pre-cutover schema use `node --import tsx tools/migrate-customer.ts --writers-stopped`; older currency data requires the separate source/target legacy converter. Do not use generic SQL initialization to upgrade. Supported old cent-schema backups normalize privately for forward restore. Rollback requires the matching old app **and** its pre-upgrade ledger, with writers stopped; later ledger writes do not survive snapshot rollback automatically. Read the full [upgrade/rollback procedure](deployment.md#existing-schema-upgrade-and-rollback) first.

## Troubleshooting and acceptance

- **Native binding failure:** from `web-next`, run `node --import tsx tools/ops/web-next-check-prereqs.ts`; repair the listed build prerequisites, then use `node --import tsx tools/ops/web-next-setup.ts` for frozen install/rebuild. Python, if needed, is only for that third-party build.
- **Wrong/locked DB:** check canonical path, file and parent directory permissions, and other clients/writers. Never unlink live WAL/SHM to clear a lock.
- **Reader unavailable:** inspect actual devices, wiring and native support. Stop owners before `node --import tsx hardware/diagnose-nfc.ts`; check serial permissions (`dialout` on typical Debian serial hosts), USB topology and kernel errors. Simulation is not a hardware diagnosis.
- **Service fails:** inspect `journalctl -u scps` and reader journals; confirm the rendered executable/PATH, package cwd, build, secrets and selected database. A shell session's PATH may differ from sudo/cron/systemd.

After setup, deliberately check operator/customer roles and routes, owned balance/history, payment claim/approval behavior and backup recovery on disposable data. Physical acceptance additionally needs both actual readers, repeated taps, unplug/replug, network outage and bounded shutdown.

These are instructions for checks to perform, **not claims that final tests or physical acceptance have passed**.

Next: [Deployment](deployment.md), [Database](database.md), [Scripts](scripts.md), [Security](security-guide.md), [Troubleshooting](troubleshooting.md) and [Testing](testing.md).
