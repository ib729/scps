# Scripts Reference

The Student Council Payment System runs its web server, administrative CLI, database tools and operational workflows in TypeScript. Use **Node.js >=26.13.1 <27** and **pnpm 12.21.0**. Python >=3.11 is only a possible third-party native-addon compilation dependency; it is not an application runtime.

## Invocation and database paths

From the repository root, the only shell entrypoints are:

```bash
./scps-cli
./scps-remote-cli
./scripts/setup.sh
```

The first two only resolve the package directory and launch TypeScript. The Debian bootstrap installs OS/Node/pnpm/native-build dependencies and invokes the typed setup stage. All other examples below run **from `web-next/`**, after `pnpm install --frozen-lockfile`:

```bash
cd web-next
node --import tsx tools/ops/web-next-check-prereqs.ts
```

`DATABASE_PATH` configured in `web-next/.env.local` is canonical: relative values resolve against `web-next`, not the caller's directory. If unset, an existing package-local database wins, otherwise the fallback is repository-root `stuco.db`. Other relative arguments, such as CSV, SQL and output filenames, use the command's working directory. Prefer absolute paths for maintenance.

Current data uses `customers`, `customer_id` and `user_customer_links`; roles are exactly `admin`, `staff`, `customer`. See [Getting Started](getting-started.md) before opening a new database.

## Administrative CLI

Run these from the repository root:

```bash
./scps-cli users       # Interactive operator creation, listing, password reset/deletion
./scps-cli ledger      # Interactive cash top-up or signed balance adjustment
./scps-cli import      # Interactive customer/card CSV import, with dry-run prompt
./scps-cli import-db /absolute/path/to/validated.db --yes
./scps-cli diagnose   # Interactive typed USB/UART/I2C diagnostics
```

With no subcommand the CLI opens its menu. `users` creates staff/admin accounts; public signup creates customers only and never grants the first account administrator access. An administrator controls customer-login links in `/admin/users`.

The launcher changes to `web-next`, so relative import paths resolve there. CLI debits are administrative adjustments and do **not** enforce the web POS weekly overdraft policy.

`import-db [source]` accepts `-y, --yes` to confirm an explicit source without prompts. **Stop all writers and create a separate verified backup first.** This CLI command does not enforce a systemd stopped-state guard or make an automatic pre-restore backup. It validates a private SQLite snapshot, normalizes supported pre-cutover cent-schema backups, then replaces contents through SQLite's backup API. It never deletes live WAL files. Arbitrary legacy currency conversion requires the separate converter below.

### Remote CLI

Configure local `web-next/.env.local` or the process environment:

```dotenv
SCPS_VPS_HOST=server.example.com
SCPS_VPS_USER=scps
SCPS_VPS_DIR=/var/www/scps
SCPS_VPS_PORT=22
SCPS_VPS_SSH_KEY=~/.ssh/id_ed25519
```

```bash
./scps-remote-cli
./scps-remote-cli users
```

The typed remote CLI uses `ssh -t` and POSIX-quotes the remote directory and every forwarded argument. Default directory is `/var/www/scps`, port `22`, username the local OS user; missing host triggers host/username prompts. Only the SSH key's leading `~/` is expanded locally. A configured remote directory is literal, so use an absolute path, not `$HOME` or `~`. A missing configured key warns and leaves SSH's normal authentication selection in effect. SSH failures/signals propagate; no remote command is treated as successful merely because a connection was attempted.

## Operational workflows

Each of the following is a distinct entrypoint under `web-next/tools/ops/`; retired shell paths have no aliases. Commands require their external utilities and permissions. Mutating command failures exit nonzero rather than silently continuing; inspect output before restarting services or retrying.

### Setup, application deployment and OS updates

| Basename | Invocation from `web-next` | Capability and guard |
|---|---|---|
| `web-next-check-prereqs` | `node --import tsx tools/ops/web-next-check-prereqs.ts` | Read-only pinned Node/pnpm and native-build tool checks. Checks Python >=3.11 for compilation; Linux gcc/g++/make required, pkg-config recommended. Missing requirements return 1. |
| `web-next-setup` | `node --import tsx tools/ops/web-next-setup.ts` | Checks prerequisites, installs frozen dependencies and rebuilds `better-sqlite3`; stops on failure. |
| `setup-debian` | `node --import tsx tools/ops/setup-debian.ts --systemd` or `--no-systemd` | Typed stage after the bootstrap: private env, database initialization only when missing, and build. New environments use port 38173. With `--systemd`, installs all three units and enables/restarts **web only**. |
| `deploy-vps` | `node --import tsx tools/ops/deploy-vps.ts [branch]` | Default `main`; refuses a dirty checkout, fetches origin, selects branch, pulls ff-only, installs frozen dependencies, builds, then restarts/status-checks `stuco-web`. An install/build failure prevents restart. Does not perform the domain migration. |
| `deploy-remote` | `node --import tsx tools/ops/deploy-remote.ts user@server.example.com [branch]` | Runs typed VPS deploy over `ssh -t`. Default remote directory expands the **remote** `$HOME/scps`; `SCPS_REMOTE_PATH` overrides with a literal POSIX-quoted directory. Branch defaults to `main`; SSH exit/signal propagates. |
| `auto-update` | `sudo node --import tsx tools/ops/auto-update.ts` | OS maintenance, not application deployment: apt update, upgrade, autoremove and autoclean; appends `/var/log/auto-update.log`, records consecutive failures in `/var/tmp/auto-update-failures`, and refuses after three. Review/fix the cause before deliberately removing that counter. |

For first-time Debian or Ubuntu setup run `./scripts/setup.sh` from the repository root as the intended service user with sudo access. It offers systemd installation; `--systemd` and `--no-systemd` select explicitly, and noninteractive runs without a flag skip services. Reader units are installed inactive when selected: configure reader environment, serial access and noninteractive reset privileges before enabling them. See [Deployment](deployment.md).

### Backup, restore and database maintenance

| Basename | Invocation from `web-next` | Capability and guard |
|---|---|---|
| `web_backup` | `node --import tsx tools/ops/web_backup.ts /absolute/existing/directory/backup.tar.zst` | Online SQLite snapshot with integrity/FK verification, then tar+zstd. Publishes atomically only after compression completes; failed compression never publishes the partial archive. Parent output directory must exist. |
| `cloud_backup_r2` | `node --import tsx tools/ops/cloud_backup_r2.ts` | Checks raw/crypt remotes, creates repository `db_backups/stuco_backup_YYYYMMDD_HHMMSS.tar.zst`, uploads through crypt and reports counts. Upload failure returns nonzero and preserves the local archive. No retention deletion enabled. |
| `setup-r2-crypt` | `node --import tsx tools/ops/setup-r2-crypt.ts` | Interactive raw Cloudflare S3 and crypt configuration. Hides crypt password/salt and R2 secret input; configuration failures do not print credentials. Reuses an existing raw remote and creates/updates crypt without deleting it first. |
| `restore_from_r2` | `node --import tsx tools/ops/restore_from_r2.ts backup.tar.zst --writers-stopped` | Requires one basename ending `.tar.zst`, then the flag, and known `inactive`/`failed` local `stuco-web.service`. Downloads/extracts privately, creates a verified pre-restore archive, restores via SQLite. Does not stop/start services. Unknown/unavailable service state refuses. |
| `reset_db` | `node --import tsx tools/ops/reset_db.ts --writers-stopped` | **Deletes all ledger and authentication data.** Requires known stopped web state plus exact interactive `yes`; cancellation changes nothing. Backs up an existing ledger, transactionally replaces schema/content and verifies final schema/integrity/FKs. Never unlinks a live database. |
| `run_migration` | `node --import tsx tools/ops/run_migration.ts /absolute/path/to/migration.sql` | Accepts exactly one SQL path, or a basename found in root `migrations/`. Creates verified `<database>.backup.<timestamp>.<pid>`, then runs `sqlite3 -bail`. Preserves SQL/dot-command/explicit-transaction semantics; failure retains the snapshot, with no automatic rollback of earlier SQL. Stop writers yourself; this workflow has no stopped-state flag/guard. |

`web_backup` snapshots online; do not archive a live database and its sidecars by copying them separately. Default compression is `zstd -15 -T0`; `ZSTD_CLEVEL` and `ZSTD_NBTHREADS` override compression level/thread count. Archives contain the verified snapshot as root `stuco.db`.

Backup configuration:

```bash
export RCLONE_REMOTE=r2
export RCLONE_CRYPT_REMOTE=r2-crypt
export R2_PATH=stuco-db-backups
node --import tsx tools/ops/setup-r2-crypt.ts
node --import tsx tools/ops/cloud_backup_r2.ts
rclone ls r2-crypt:
```

Defaults are the values shown. Crypt maps to `r2:stuco-db-backups` when configured; backup/restore use the crypt remote root. Changing `R2_PATH` alone does not rewrite an existing crypt remote. Preserve the existing crypt password **and salt**, plus a protected copy of the rclone configuration: new keys cannot read old encrypted backups. Do not put credentials in cron command lines or logs.

Example daily cron, after creating a restricted log directory; replace paths and ensure cron's PATH contains the pinned Node and rclone:

```cron
0 2 * * * cd /srv/scps/web-next && /absolute/path/to/node --import tsx tools/ops/cloud_backup_r2.ts >> /srv/scps/logs/r2-backup.log 2>&1
```

Before destructive maintenance stop web, development processes, CLI writers and any external database clients. `--writers-stopped` is an operator assertion: no command can detect arbitrary external writers. Keep pre-restore/reset snapshots and verify recovery on a disposable copy. Do not enable retention deletion until you have a separately reviewed retention policy.

### Reader lifecycle and diagnostics

Install native `libnfc-bin`, `usbutils`, `lsof` and `udev` on reader hosts. Support is PN532 UART/I2C and libnfc-supported USB; unsupported or ambiguous explicit devices fail, rather than choosing another reader. See [NFC Setup](nfc-setup.md) and [Dual readers](nfc-setup.md#dual-readers) for wiring and native calibration.

| Basename | Invocation from `web-next` | Capability and side effects |
|---|---|---|
| `run-nfc` | `node --import tsx tools/ops/run-nfc.ts [broadcaster options]` | Loads repository-root `.env.broadcaster` without overriding existing environment, then runs typed broadcaster. |
| `test-nfc` | `node --import tsx tools/ops/test-nfc.ts [broadcaster options]` | Same environment loading, adds `--test`: authenticated single `DEADBEEF` tap; exit 0/1. Network test, not physical reader proof. |
| `dev-with-nfc` | `node --import tsx tools/ops/dev-with-nfc.ts` | Stops all installed reader owners, checks release, resets selected USB adapters, launches development custom server and waits up to 20s for `/login`; starts primary and previously active readers only after readiness. Ctrl+C stops web but intentionally leaves reader services running. Reset/readiness failure prevents reader startup; inspect actual service state after a partial start failure. |
| `check_usb_port` | `node --import tsx tools/ops/check_usb_port.ts` | Read-only lsusb/topology/TTY/kernel observations; does not open a reader or claim TTY presence means health. |
| `reset-usb-nfc` | `node --import tsx tools/ops/reset-usb-nfc.ts [USB0\|USB1\|/dev/ttyUSBn]` | Stop owners yourself first. Resolves selected TTY's actual sysfs USB ancestor; unbinds, waits 2s, always rebinds even on interrupt, waits 1s and bounds device-return wait. Default selects CH340 adapters first, otherwise USB serial adapters. Requires sysfs reset privileges. |
| `recover-nfc` | `node --import tsx tools/ops/recover-nfc.ts [USB0\|USB1\|/dev/ttyUSBn]` | Stops both installed broadcaster owners, refuses unmanaged TTY owners, resets actual USB ancestry, settles, probes native communication, then starts services. Failure before restart leaves services stopped. |
| `fix-readers` | `node --import tsx tools/ops/fix-readers.ts` | Stops both owners, checks exclusive release, reloads `ch341` with 2s/3s calibration waits, probes native readers and starts services. Driver reload can affect other devices using it; it attempts reload even if interrupted. |
| `disable-usb-autosuspend` | `sudo node --import tsx tools/ops/disable-usb-autosuspend.ts` | Backs up `/boot/firmware/cmdline.txt`, validates single-line format, sets `usbcore.autosuspend=-1` preserving file ownership/mode, and attempts original-content recovery if editing fails. Asks `y/N` before reboot; gives 5s to cancel. |
| `test-reader2-hardware` | `node --import tsx tools/ops/test-reader2-hardware.ts` | Reader 2 specialist observations for `/dev/ttyUSB1`, wiring/power, sysfs ancestry and serial settings; stops both owners and performs a bounded native probe. Leaves services stopped for diagnosis. |
| `test_replug` | `node --import tsx tools/ops/test_replug.ts [USB0\|USB1\|/dev/ttyUSBn]` | Interactive before/unplug/replug comparison of the same TTY, default USB0; services must already be stopped. Requires real removal/return and exclusive native communication; does not mutate services. |
| `verify-nfc-auto-recovery` | `node --import tsx tools/ops/verify-nfc-auto-recovery.ts [--observe-seconds 1..120]` | Reads actual boot/autosuspend and service restart/enabled state. Default 10s fresh journal window requires hardware error followed by successful tap, with no later reader error, for each active reader. No service mutation; incomplete evidence exits nonzero. |

Do not run direct probes/reset while a broadcaster owns the reader. Coordinated recovery workflows stop both installed owners and use `lsof` to refuse unmanaged owners; missing ownership evidence is an error, not permission to seize the device. Active/authenticated service status proves neither native reader health nor recovery.

Broadcaster examples, from `web-next`, with matching `NFC_TAP_SECRET` configured:

```bash
node --import tsx tools/ops/run-nfc.ts --simulate
node --import tsx tools/ops/run-nfc.ts --device pn532_uart:/dev/ttyUSB0
node --import tsx tools/ops/run-nfc.ts --device pn532_i2c:/dev/i2c-1
node --import tsx tools/ops/test-nfc.ts --url https://payments.example.com --lane reader-1
```

Options are `--url`, `--secret`, `--lane`, `--device`, `--simulate`, `--test`. Prefer secret environment/config over a process-list-visible `--secret`. Environment equivalents are `NEXTJS_URL` (default `http://localhost:3000`), `NFC_TAP_SECRET`, `POS_LANE_ID` (default `default`), `PN532_DEVICE`. Explicit CLI device wins over environment, then deterministic native autodiscovery, then the legacy AMA0 default. Configure exact devices for multiple readers. Legacy UART/I2C selectors normalize to native connstrings; legacy USB bus/device selectors must resolve uniquely.

Simulation uppercases typed UIDs; `q`, `quit`, `exit` or EOF stops it. Authentication success gates taps; disconnected taps are not buffered/replayed. Native probes have a five-second bound plus child cleanup. The loop retains 100ms spacing, 1.5s UID debounce, independent network 1–60s and hardware 1–30s retry backoff.

Additional direct diagnostics:

```bash
node --import tsx hardware/diagnose-nfc.ts
node --import tsx hardware/test-readers.ts
node --import tsx hardware/test-usb-ports.ts
```

These respectively provide interactive single-reader USB/TTY/kernel diagnosis, sequential bounded USB0/USB1 tests, and physical-port comparison. Stop owners before native probes. Physical dual-reader, unplug/replug, network outage and stop-window acceptance must be observed on deployment hardware; simulation is not that proof.

## Customer import, snapshots and schema cutover

Back up the configured ledger before importing. Run the commands below from
`web-next`. For snapshot, migration and rollback procedures, see the
[Database Guide](database.md).

Customer names must be unique; financial accounts start at zero cents. Importing
a customer does not create or approve a website login. Administrators link
registrations in `/admin/users`.

### CSV format

Use UTF-8 with a `name` header and an optional `uid` header:

```csv
name,uid
"Doe, Jane",AB12CD34
John Doe,DEADBEEF
Alice Johnson,
```

Names-only CSV:

```csv
name
Jane Smith
John Doe
```

Quoted multiline record:

```csv
name,uid
"Alice
Johnson",ABCD
```

The full CSV parser supports quoted commas, escaped quotes and multiline fields.
Names are trimmed. Leave the UID empty for customers without cards; nonempty UIDs
are normalized to uppercase and must contain 4–20 hexadecimal characters.
Obtain them by tapping the reader on `/admin/pos`. Never assign one card to two
customers. Reimporting a duplicate name can attach a new, unowned active card.

### CSV import

Run the typed importer from `web-next`; it loads the package environment and resolves
relative `DATABASE_PATH` values against that package, independently of the caller's cwd.

```sh
# From web-next; DATABASE_PATH may also be configured in .env.local.
node --import tsx tools/batch-import-customers.ts --template customers.csv
node --import tsx tools/batch-import-customers.ts --template --with-uid customers-with-cards.csv
node --import tsx tools/batch-import-customers.ts --dry-run customers.csv
node --import tsx tools/batch-import-customers.ts customers.csv
node --import tsx tools/batch-import-customers.ts --no-skip-duplicates customers.csv
```

Check the exit status and row errors. Each valid row commits atomically; invalid
field/column counts and failed inserts are reported while later valid rows continue,
and any row error makes the command fail. Structurally malformed CSV (for example,
an unclosed quote) fails parsing before imports; it cannot be safely split into rows.
A dry run opens an existing ledger read-only, including schema, and checks planned
within-file duplicates/card ownership without persisting them. Default duplicate
handling skips existing names and may attach an unowned card;
`--no-skip-duplicates` makes duplicates errors.
Template generation never opens a database and writes the requested CSV file
(replacing that file if it exists). Keep source CSV files for audit.

### Direct SQL import

For controlled one-time imports, stop competing writers and use a transaction:

```sql
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO customers(name) VALUES ('John Doe'),('Jane Smith');
INSERT INTO accounts(customer_id,balance,max_overdraft_week)
SELECT id,0,0 FROM customers
WHERE id NOT IN (SELECT customer_id FROM accounts);
COMMIT;
```

Apply this to the configured database, not a cwd-dependent `stuco.db`:

```sh
sqlite3 /absolute/path/to/stuco.db < import-customers.sql
```

Do not use `INSERT OR REPLACE`: it can delete an existing customer and change
ownership. Prefer the importer for UID validation and card-conflict handling.

### Verify import

```sql
SELECT COUNT(*) FROM customers;
SELECT * FROM customers ORDER BY id DESC LIMIT 10;
SELECT c.* FROM customers c
LEFT JOIN accounts a ON a.customer_id=c.id
WHERE a.customer_id IS NULL;
SELECT c.name,k.card_uid FROM customers c
JOIN cards k ON k.customer_id=c.id ORDER BY c.name;
```

Missing accounts should be investigated before linking registrations. Duplicate
names, invalid hexadecimal UIDs, conflicting card owners and malformed CSV rows
need correction in the source file. Export Excel/Sheets data as UTF-8 CSV, retain
quoted names, preview with `--dry-run`, then try a small batch first.

Snapshot uses SQLite's online backup API and verifies integrity/FKs. Extraction accepts only root regular `stuco.db` plus optional legacy WAL/SHM, rejects unsafe/duplicate/truncated members, and folds staged WAL without touching a live ledger. Extraction stdout is the verified staged database path only.

### Existing installations

Do not run fresh initialization or reset against an existing ledger. Stop all
writers, preserve credentials and a verified snapshot, and follow the
[upgrade and rollback procedure](database.md#customer-domain-upgrade).
Rollback requires the matching old application and pre-upgrade database and
loses later writes. Restore normalization is forward recovery, not rollback.

## Operational checks and troubleshooting

```bash
sqlite3 /absolute/path/to/stuco.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Integrity should report `ok`; the FK check should return no rows. For read-only weekly reporting, amounts remain integer cents:

```sql
SELECT strftime('%Y-%W', created_at) AS week, COUNT(*) AS transactions,
       SUM(CASE WHEN type='TOPUP' THEN amount ELSE 0 END) AS topup_cents,
       SUM(CASE WHEN type='DEBIT' THEN -amount ELSE 0 END) AS debit_cents
FROM transactions
WHERE created_at >= datetime('now', '-7 days')
GROUP BY week;
```

- If Node/tsx cannot start, check the pinned Node version, package dependencies and service/cron PATH. Do not make `.ts` executable or run it directly.
- For native binding errors use the prerequisite/rebuild tools above; a native build may need Python, but application commands do not.
- A ledger needs a writable **directory** for WAL/SHM as well as an appropriately owned file. Fix permissions deliberately with writers stopped, not blanket world-writable modes.
- Inspect `journalctl -u stuco-web` and both reader units. Do not equate successful SSH, a TTY, or WebSocket authentication with a completed deployment or healthy reader.

See [Getting Started](getting-started.md), [Deployment](deployment.md), [Database](database.md), [Security](security-guide.md) and [Troubleshooting](troubleshooting.md).
