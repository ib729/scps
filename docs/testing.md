# Testing Guide

Use disposable SQLite databases, identities, secrets and local storage. Never use
a production ledger or `.env.local` as a fixture. The procedures below are checks
to perform, not claims that this checkout, deployment or physical readers passed.

## Automated checks

From `web-next`, use Node `>=26.13.1 <27` and pnpm `12.21.0`:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

`pnpm test` explicitly discovers `lib`, `tests`, `tools` and `hardware`
`**/*.test.ts`, runs them sequentially, then runs the CLI self-check.
For a focused run, name test files explicitly:

```sh
node --import tsx --test lib/customer-schema.test.ts tools/migrate-customer.test.ts
node --import tsx --test tools/batch-import-customers.test.ts tools/import-legacy-db.test.ts
node --import tsx --test tools/sqlite-snapshot.test.ts tools/restore-database.test.ts tools/backup-roundtrip.test.ts
```

Do not use bare `node --test`: production diagnostics such as
`hardware/test-readers.ts` also start with `test-` and are not automated test files.
No first-party Python test runner, virtualenv or runtime requirements file is needed.
Python may still be needed to compile third-party native addons.

HTTP/WebSocket tests launch the actual custom development server against disposable
core/auth databases. Close browser smoke servers first to avoid the shared Next
development lock. Production builds also need a separately initialized disposable
database and explicit test-only auth/NFC configuration.

### What the fixtures establish

- Domain/role migration: preservation, idempotency, refusal of mixed schemas and rollback.
- Account access: administrator linking/grants, private customer projections and role denial.
- Payments: parsing, reservations/review, replay refusal and credit rollback.
- CSV: quoted/multiline parsing, UID ownership, row rollback, dry runs and template behavior.
- Archive/restore: committed WAL snapshots, unsafe/truncated archives and old cent-domain staging.
- NFC: local real WebSocket server, reconnect/stale-read handling and real cancellable child fixtures.
- Operations: fake OS executables and temporary files at external boundaries; real child
  processes for argument quoting/exit behavior; **local rclone aliases**, not cloud acceptance.

Fake systemctl/sudo/USB tools do not prove real privileges, device resets or service
ownership. Child cancellation fixtures do not prove a physical PN532 releases its
port. Local rclone roundtrips do not prove real R2 credentials or remote recovery.

## Disposable browser acceptance

Start the custom server from `web-next` with test-only configuration:

```sh
pnpm dev
```

Provision a disposable administrator using repository-root `./scps-cli users`.
Check separate unauthenticated, unlinked customer, linked customer, staff and admin sessions:

1. `/login` and `/signup` remain public. Signup creates only a customer login;
   `/customer/pending` waits for administrator-controlled ledger linkage at `/admin/users`.
2. A linked customer sees only their own `/customer` balance/history and requests.
   Customer A must not receive B's data, card UIDs or internal notes.
3. Staff/admin share `/admin`, `/admin/customers`, `/admin/transactions`,
   `/admin/pos` and `/admin/topup`. Staff must be denied `/admin/users`,
   `/admin/payments` and their protected actions/API calls.
4. Verify last-administrator protection and denial when directly calling protected
   actions/API/WebSockets rather than merely hiding navigation.
5. A mounted empty payment queue receives a newly created request. Claiming does
   not credit; administrator confirmation credits base cents exactly once; rejection
   never credits. Check newest resolved history and pending claimed-first order.
6. Legacy page URLs permanently redirect to canonical routes, preserving detail
   suffixes/query values. POST actions must not redirect.

No real transfer is needed. A missing merchant QR should show configuration failure;
use only a disposable same-origin test image for loading checks, never commit a fake QR.

## Authenticated tap smoke without hardware

Set the same disposable `NFC_TAP_SECRET` in server and broadcaster environments.
From `web-next`:

```sh
node --import tsx hardware/tap-broadcaster.ts --test
node --import tsx hardware/tap-broadcaster.ts --simulate
```

Test mode authenticates to `/api/nfc/ws`, sends `DEADBEEF`, and exits 0/1.
Simulation accepts hexadecimal UIDs; try `DEADBEEF`, `CAFE1234`, then `quit`.
Also check `q`, `exit` and EOF cleanly terminate. Do not paste production secrets
into command history or issue logs.

With an authenticated operator browser at `/admin/pos`, verify connection and tap
delivery, enrollment/customer selection and the configured lane. At `/admin`, check
the tap alert/navigation behavior. Use two operator browsers to check same-lane
delivery; customer sessions must not gain operator tap data.

For lane isolation, start separate simulations:

```sh
node --import tsx hardware/tap-broadcaster.ts --simulate --lane lane-a
node --import tsx hardware/tap-broadcaster.ts --simulate --lane lane-b
```

Observe each configured browser lane receives only its own events. Repeat rapid
UID input to check deduplication; do not infer physical card-presence behavior from
simulation. Stop/restart only the disposable server to check reconnect/authentication,
network retry backoff and no replay of disconnected taps.

## Physical reader and service acceptance — separate, unverified until performed

Supported scope is documented PN532 UART/I2C and libnfc-supported USB devices.
Install native libnfc tools (`libnfc-bin` on Debian), grant the service user serial
permissions, and use exact selectors when multiple readers are attached.
Do not run two processes owning the same reader.

```sh
# From web-next, with all other owners of this reader stopped:
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyAMA0
# USB-to-UART PN532 example:
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyUSB0
# I2C example:
node --import tsx hardware/tap-broadcaster.ts --device pn532_i2c:/dev/i2c-1
```

These are selectors, not guarantees the device exists. Unsupported explicit
selectors must fail, not choose another reader. See [NFC setup](nfc-setup.md) for
wiring, native calibration and diagnostic commands.

For **both deployed readers**, record:

- Repeated taps, removal/re-tap and different cards; correct UIDs and lane identity.
- Healthy no-card behavior versus unavailable reader errors.
- Unplug/replug and hardware retry without unnecessary network reconnect.
- Network outage/reconnect with no buffered old card UID delivered afterward.
- Stop waits for owned child/reader release before replacement, within the
  systemd ten-second stop window.
- Reader2's five-second startup settle, configured restart behavior and actual
  permissions/noninteractive reset privileges.

Do not copy unrendered systemd templates directly into `/etc/systemd/system`;
deployment setup renders their paths/user/Node placeholders. Inspect installed
unit status and `journalctl -u stuco-web -u tap-broadcaster -u tap-broadcaster-reader2`.
Host service mutation, USB reset, wiring acceptance, real SSH/deploy and cloud
backup/restore require a separately authorized deployment window.

## Rootless production-container acceptance

From repository root:

```sh
podman build -f web-next/Dockerfile -t scps:cutover-smoke .
```

Start the actual image rootlessly with a disposable migrated legacy ledger mounted
at `/app/data`, `DATABASE_PATH=/app/data/stuco.db`, and test-only auth/NFC secrets.
Repeat role/route/payment browser checks, launch the actual CLI, deliver an
authenticated simulated tap, and perform a local-only backup/restore roundtrip.
Verify no application workflow invokes a Python runtime. Container simulation is
not physical NFC proof.

## Failure evidence

Collect the exact command/exit status, Node/pnpm versions, redacted server and
broadcaster output, browser console/network details and relevant journal logs.
For missing cards, check selector, serial permissions, wiring and native libnfc
availability. For auth failure, compare secret configuration without printing it.
The custom server owns WebSockets; a hosting platform without that persistent
server is not equivalent. Do not publish tokens, card UIDs, customer data or credentials.

Measure latency/resource use on the actual deployment rather than treating
unmeasured targets as passed performance claims.
