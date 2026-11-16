# Database Guide

The Student Council Payment System shares one SQLite ledger between the typed CLI
and web server. Money is integer **cents**: `550` means ¥5.50, with
`app_meta.currency_scale=100`. Ordinary startup refuses legacy, mixed or non-cent
schemas; it never guesses or rescales existing money.

## Paths and connections

Set `DATABASE_PATH` in `web-next/.env.local`. Configured relative paths resolve
against `web-next`, not the launch directory. Without configuration, discovery
checks `web-next/stuco.db`, root `stuco.db`, `web-next/scps.db`, then root `scps.db`.
If none exists, the default is root `scps.db`. Use an absolute path for maintenance.

Web and CLI use `better-sqlite3`, foreign-key enforcement and WAL. Do not copy a
live database or its WAL files as a backup. Use the SQLite online snapshot tools below.

## Current schema

The authoritative definitions are [`migrations/schema.sql`](../migrations/schema.sql)
and [Better Auth schema](../web-next/migrations/better_auth_schema.sql).
For a **new, empty** ledger, from repository root:

```sh
sqlite3 /absolute/path/to/scps.db < migrations/schema.sql
sqlite3 /absolute/path/to/scps.db < web-next/migrations/better_auth_schema.sql
./scps-cli users
```

The last command provisions an administrator; signup never grants operator access.
Do not initialize an old ledger with these files as a substitute for migration.

| Table | Purpose |
|---|---|
| `customers` | Unique name, stable ID and archive flag |
| `cards` | UID ownership through `customer_id`, active/revoked status |
| `accounts` | `customer_id`, balance and weekly overdraft limit in cents |
| `transactions` | Signed cents, overdraft component, payment method, staff, UTC timestamp |
| `transaction_note_history` | Audit trail of note edits |
| `overdraft_weeks` | Cents used, keyed by customer and Shanghai Monday converted to UTC |
| `wechat_topup_requests` | Requested/payable cents and claim/review state |
| `user_customer_links` | One-to-one login-to-ledger link |
| `user`, `session`, `account`, `verification` | Authentication, distinct from financial accounts |
| `app_meta` | Currency marker |

Roles are exactly `admin | staff | customer`. Administrators link registrations
at `/admin/users`; unlinked customers wait at `/customer/pending`. Linked customers
see only their own balance/history at `/customer`, not card UIDs or internal notes.
Staff/admin share `/admin`, `/admin/customers`, `/admin/transactions`, `/admin/pos`
and `/admin/topup`; `/admin/users` and `/admin/payments` are administrator-only.
Claiming a payment never credits it. Confirmed administrator approval credits base
cents once; rejection does not credit.

Archive customers with financial history rather than deleting them. Transaction,
overdraft and payment references restrict deletion; do not apply obsolete
cascade-delete SQL to a current ledger.

```sql
SELECT c.id,c.name,c.archived,a.balance,a.max_overdraft_week
FROM customers c JOIN accounts a ON a.customer_id=c.id;
SELECT user_id,customer_id FROM user_customer_links;
SELECT customer_id,amount,created_at FROM transactions ORDER BY id DESC LIMIT 20;
```

`idx_tx_customer_time` and the other transaction indexes support customer/time
queries; see the schema files for complete columns, constraints and indexes.

## Customer-domain upgrade

Try a disposable copy first. Stop **all** writers, preserve and verify a pre-upgrade
snapshot, then from `web-next`:

```sh
node --import tsx tools/migrate-customer.ts --writers-stopped
```

This command resolves the canonical database, refuses an active local
`scps.service` or legacy `stuco-web.service`, and creates an integrity/FK-checked online backup before
mutation. If systemd state is unavailable it warns; the flag still asserts that
every writer, including external processes, has stopped. It cannot detect arbitrary
external writers.

The migration atomically renames the financial domain to `customers`,
`customer_id` and `user_customer_links`, and normalizes authentication roles.
IDs, cents, credentials, sessions, links, archive flags and supported custom
indexes/triggers are preserved. Old no-role operators remain staff; unknown roles
become customer, never administrator. Mixed/colliding schemas, unknown user
columns, orphan references and non-cent markers refuse conversion. Failure rolls
the transaction back; a validated final schema is a no-op.

### Explicit legacy currency conversion

The domain migration does **not** convert tenths. For a genuinely legacy source,
use the separate converter with explicit paths, after stopping writers:

```sh
node --import tsx tools/import-legacy-db.ts \
  --source /absolute/path/to/legacy.db \
  --target /absolute/path/to/scps.db --writers-stopped
```

Its defaults are repository-root `IMPORTTHIS/stuco.db` and `stuco.db`, not the
configured `DATABASE_PATH`. A missing marker or scale `10` means exact ×10 to
cents; scale `100` means unchanged. Other scales and unsafe amounts refuse.
An already-rescaled but unmarked source cannot be inferred safely: establish its
units before conversion. The converter reads an online source snapshot, preserves
supported IDs/auth/archive/payment/link data and sequence maxima, validates a final
staged ledger, and creates a verified pre-target backup before SQLite restore.
It requires a known inactive/failed local web service and does not detect external
writers. Unsupported source tables/columns refuse rather than being silently dropped.

Restart the new application only after reviewing balances, roles and payment
state. Before rollback stop writers again, and restore the **matching old
application and pre-upgrade database together**. Snapshot rollback loses later
ledger writes; never run old SQL callers against the new customer schema.

## Backup and restore

Run typed commands from `web-next`. Install native `zstd`, and `rclone` for off-site
storage; application maintenance does not require a runtime Python environment.
Third-party native addon compilation may still require Python on build hosts.

```sh
node --import tsx tools/ops/web_backup.ts /absolute/path/to/backup.tar.zst
node --import tsx tools/sqlite-snapshot.ts snapshot \
  /absolute/path/to/scps.db /absolute/path/to/snapshot.db
```

Snapshots include committed WAL data and pass integrity/foreign-key checks.
Archives use zstd `-15 -T0` by default (`ZSTD_CLEVEL`/`ZSTD_NBTHREADS` override),
and publish atomically only after compression succeeds. Existing output archives
can be replaced, so use unique names. Integrity cannot prove an old backup contains
every expected transaction; reconcile totals and recent history too.

For an archive inspection, create an empty private staging directory, then:

```sh
node --import tsx tools/sqlite-snapshot.ts extract \
  /absolute/path/to/backup.tar.zst /absolute/path/to/empty-staging
```

Extraction prints only the staged database path. Only root regular `stuco.db` and
optional WAL/SHM members are accepted; paths, links, duplicate/unexpected members,
missing main files, truncated tar and decompressor failure refuse. Staged WAL is
folded through SQLite into a verified snapshot. Never extract over a live ledger.

### Encrypted R2 backups

Create an R2 bucket and scoped object-read/write credentials, then:

```sh
node --import tsx tools/ops/setup-r2-crypt.ts
node --import tsx tools/ops/cloud_backup_r2.ts
```

`RCLONE_REMOTE`, `RCLONE_CRYPT_REMOTE` and `R2_PATH` configure the raw remote,
encrypted remote and bucket path. Defaults use `r2` and `r2-crypt`. Preserve crypt
passwords/salts securely: changing them makes old backups unreadable. Backups stay
local as well as being uploaded; retention deletion is not enabled automatically.
Inspect objects with `rclone ls r2-crypt:` or `rclone lsl r2-crypt:`.

For daily backups, configure the deployment user's environment and writable log
directory before installing a cron entry, for example:

```cron
0 2 * * * cd /absolute/path/to/scps/web-next && /absolute/path/to/node --import tsx tools/ops/cloud_backup_r2.ts >> /absolute/path/to/scps/logs/r2_backup.log 2>&1
```

Use the actual pinned Node path; cron does not inherit your interactive PATH.
For local-only scheduling, use `tools/ops/web_backup.ts` with a unique output path.

Stop all writers before restore:

```sh
node --import tsx tools/ops/restore_from_r2.ts backup.tar.zst --writers-stopped
```

The argument must be a basename ending `.tar.zst`, not a path. Restore refuses
unknown/unavailable or active local service state, downloads to private staging,
validates extraction, and saves a verified pre-restore archive in `db_backups`.
Validated old **cent-based** domain backups are normalized only in staging before
final-schema checks. This is forward recovery, not rollback to the old schema.
Non-cent backups need explicit legacy conversion, not implicit restore scaling.
Contents are restored through SQLite, never by replacing live database/WAL files;
no service is started or stopped for you. Test restoration against disposable
data and a local rclone alias before relying on remote storage.

The local CLI `./scps-cli import-db` does not create an automatic pre-backup or
check that services are stopped. Stop all writers and make a verified snapshot
first. Keep crypt password, salt and rclone configuration, plus environment,
service and proxy backups, separate from the ledger.

## SQL migrations and destructive reset

Review SQL and stop competing writers first:

```sh
node --import tsx tools/ops/run_migration.ts /absolute/path/to/migration.sql
```

The runner creates a verified snapshot and invokes `sqlite3 -bail`, preserving
the SQL file's transaction/dot-command semantics. It does not add a transaction,
guarantee arbitrary SQL atomicity, or automatically roll back a failed migration.
Keep its snapshot for deliberate recovery.

```sh
node --import tsx tools/ops/reset_db.ts --writers-stopped
# Then, from repository root:
./scps-cli users
```

Reset follows the canonical database path, requires a known stopped web service
and exact typed `yes`, backs up an existing ledger, and transactionally replaces
**all ledger and authentication data** with fresh core/auth schema. Recreate your
administrator afterward. Never use reset as an upgrade.

## Maintenance and troubleshooting

Use the configured absolute path:

```sh
sqlite3 /absolute/path/to/scps.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
sqlite3 /absolute/path/to/scps.db ".schema"
sqlite3 /absolute/path/to/scps.db ".tables"
```

Integrity should return `ok`; foreign-key check should return no rows. Schedule
`VACUUM` during maintenance, not peak writes. For locks, identify other writers
instead of deleting WAL/SHM files. Give only the service user/trusted group access
to the containing directory, database and sidecars; never make a ledger world-writable.
See [Security Guide](security-guide.md), [Troubleshooting](troubleshooting.md) and
[Customer import](scripts.md#customer-import-snapshots-and-schema-cutover).
