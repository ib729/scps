# Troubleshooting

Practical diagnosis for the Student Council Payment System. Start with logs and
read-only observations; do not reset a ledger, kill arbitrary processes or make
database/devices world-writable to bypass an error.

## Page refreshes through a tunnel

Development HMR uses WebSockets. If a tunnel/proxy interrupts HMR, development
pages may reload and close dialogs. Use a production deployment for remote
operation, and reserve development mode for local work:

```bash
cd "$PROJECT_ROOT/web-next"
pnpm build
pnpm start
```

Ensure the proxy supports WebSocket upgrades for `/api/nfc/ws`. Do not assume an
HMR failure proves the reader socket is broken. See [Deployment](deployment.md).

## Authentication and approval

### Login, signup or session fails

- Check `DATABASE_PATH`, `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_SECRET` in
  `web-next/.env.local`. Restart the server after configuration changes.
- Use a stable secret and the actual public URL; production cookies require
  HTTPS. Check browser cookie/CORS errors and server logs without sharing tokens.
- Verify trusted origins in `web-next/lib/trusted-origins.ts`; do not disable
  origin checks to make an unexpected host work.
- Missing auth tables require the documented initialization/upgrade procedure,
  not applying arbitrary SQL to an active ledger. See [Database](database.md).
- Microsoft sign-in requires both `MICROSOFT_CLIENT_ID` and
  `MICROSOFT_CLIENT_SECRET`, an unexpired Azure credential and matching
  `/api/auth/callback/microsoft` redirect URI on the public origin.

Public signup grants only the `customer` role. A customer stays at
`/customer/pending` until an administrator verifies and links an active customer
ledger account through `/admin/users`. Linking an archived or account-less
record is not an approval workaround. Linked customers use `/customer`.
Staff/admin use `/admin`; account administration and `/admin/payments` require
an administrator. Use `./scps-cli users` from the repository root for
first-administrator provisioning or password recovery. Signup never makes the
first user an administrator.

For diagnosis, reproduce login/signup in a fresh browser session and inspect
the failing `/api/auth/*` response and server log. Do not dump the `session` or
credential tables into support messages. See [Authentication](authentication.md).

## Web runtime and native dependencies

### Missing modules or better-sqlite3 bindings

Use the pinned Node and pnpm versions, and install dependencies for the host's
architecture rather than copying another machine's `node_modules`.
From `web-next`:

```bash
node --import tsx tools/ops/web-next-check-prereqs.ts
pnpm install --frozen-lockfile
pnpm rebuild better-sqlite3
```

`tools/ops/web-next-setup.ts` combines prerequisite checks, frozen installation
and rebuilding. Native addon compilation may need Python >=3.11 and a compiler;
this is a third-party build dependency, not an application/reader runtime.
On a Pi use a supported 64-bit OS, adequate memory and the prerequisite guidance
in [Getting Started](getting-started.md). Do not delete a lockfile as a repair.

### Port in use or 500 response

Identify the existing listener and stop it through its owner/service rather than
using blanket `kill -9`. The custom server reads `PORT`; for a separate local
development instance:

```bash
PORT=3001 pnpm dev
```

For a 500 response inspect the server's actual error, environment and selected
database. A build cannot repair missing ledger tables. Production performance
should be assessed with a production build, not development compilation.

## Database diagnosis and recovery

`DATABASE_PATH` may be absolute or relative; configured relative paths resolve
against `web-next`, not the invoking shell's cwd. Without configuration, an
existing package database wins over the repository-root default. Determine the
actual selected file before inspecting or repairing anything.

- **Connection denied:** check file and parent-directory ownership for the web
  service user, including access needed for WAL/SHM. Do not use `chmod 666`.
- **Locked/busy:** identify competing CLI/import/maintenance writers and stop
  them cleanly. Do not delete journal/WAL files or weaken locking.
- **Old/mixed schema or noncent ledger:** ordinary startup deliberately refuses
  it. Stop all writers, create a verified backup and follow the migration
  procedure in [Database](database.md). Domain migration uses
  `node --import tsx tools/migrate-customer.ts --writers-stopped` from `web-next`;
  legacy currency conversion is a separate operation, not a startup side effect.
- **Foreign-key failure:** investigate related records and the failed action;
  do not disable foreign keys or blindly run old cascade SQL.
- **Data appears stale:** check filters, refresh once and inspect whether the
  action failed/rolled back before attempting it again.

For read-only integrity inspection, substitute the actual configured path:

```bash
sqlite3 /absolute/path/to/stuco.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Never copy a live main file without accounting for WAL. Use the typed snapshot
and documented restore workflows. Restore requires stopped writers, secure
staging and a pre-restore backup; local service checks cannot detect arbitrary
external writers. Match application and snapshot versions during rollback.
Snapshot rollback does not preserve later financial writes.

### Incorrect balance or overdraft

Review the customer's transaction history at `/admin/transactions`, including
adjustments and top-ups, and check currency-scale/migration history. Values are
integer cents. Use the authorized ledger adjustment flow with a reason rather
than editing balances directly or inventing a compensating negative top-up.
Overdraft weeks use Asia/Shanghai time; investigate week boundaries before
manual intervention. See [Database](database.md) and [User Guide](user-guide.md).

## NFC: separate network presence from hardware

The POS status and authenticated `/api/nfc/status?reader=reader-1` mean
**authenticated broadcaster network presence** only. An active unit, USB
adapter, TTY or successful simulated tap does not prove a PN532 can read cards.
Do not use a GET to the tap submission endpoint as a hardware health check.

### Broadcaster disconnected or authentication fails

1. Check the configured `NEXTJS_URL`, network/proxy WebSocket upgrades and the
   custom `server.ts` runtime.
2. Verify `NFC_TAP_SECRET` matches between server and reader environment without
   printing the secret into logs or screenshots.
3. Inspect `journalctl -u tap-broadcaster -u tap-broadcaster-reader2 -f` and
   browser WebSocket errors. Restart the appropriate owner after changing env.
4. From `web-next`, test only the network path against a disposable server:

```bash
node --import tsx hardware/tap-broadcaster.ts --test --lane reader-1
```

This sends synthetic `DEADBEEF`, not a physical read. The broadcaster waits for
`auth_success`; failed auth is not evidence of a USB problem.

### Reader absent, busy or no cards read

First observe topology without opening hardware:

```bash
cd "$PROJECT_ROOT/web-next"
node --import tsx tools/ops/check_usb_port.ts
```

Inspect USB/TTY/kernel errors, cable, supply and adapter. CH340 enumeration proves
only the USB serial bridge exists. Check serial/I2C group access and module mode
switches. Power down before rewiring. Pi GPIO is 3.3 V logic, not 5 V tolerant;
UART TX/RX must be crossed with common ground. Native libnfc owns UART 115200
and I2C address 0x24/timing; do not change calibration to hide a wiring error.

Before direct probes, stop both installed reader services and any manual
broadcasters, then inspect ownership with `sudo lsof -- /dev/ttyUSB0 /dev/ttyUSB1`.
Do not kill unrelated owners. Run one appropriate diagnostic from `web-next`:

```bash
node --import tsx hardware/diagnose-nfc.ts
node --import tsx hardware/test-readers.ts
node --import tsx hardware/test-usb-ports.ts
```

The first offers a bounded interactive exact-device probe; the second checks
USB0/USB1 sequentially; the third compares physical ports. A probe that opens a
reader but sees no card establishes communication, not completed tap acceptance.
Present one card; ambiguous multiple targets fail rather than selecting an
arbitrary customer.

Supported documented transports are PN532 UART/I2C and libnfc-supported native
USB, not every NFC reader family. Configure exact `PN532_DEVICE`/`--device`
values, especially with two readers. Native autodiscovery is intrusive and both
unconfigured instances can select the same device. Unsupported explicit
selection fails with no fallback to another reader. See [NFC Setup](nfc-setup.md)
for primary libnfc sources and exact native connstrings.

### Taps reach the wrong checkout or do not select a customer

- Check `/admin/pos` is in Tap Card mode and the card is enrolled/active on the
  intended customer in `/admin/customers`.
- Check Settings reader selection and the broadcaster's `lane` and `reader_id`;
  use reader-1/USB0 and reader-2/USB1 consistently.
- Different browsers selecting the same lane both receive that lane's taps.
- Recheck TTY-to-physical-reader mapping after reboot/replug; USB enumeration
  numbers are not permanent physical port identities.
- A held card can be emitted again after the 1.5-second debounce interval.
  Do not interpret that alone as two physical readers sending the same event.

See [Dual Reader Setup](dual-reader-setup.md).

### Idle failure, unplug/replug or dev-server restart

Reader failures back off independently (1–30 seconds); network reconnects use
1–60 seconds. Disconnect cancels the native child and waits for release before
replacement. Old-generation results are discarded, not replayed after reconnect.
This recovery design is not a guarantee that bad power, cables or permissions
will repair themselves.

Inspect runtime autosuspend state at
`/sys/module/usbcore/parameters/autosuspend` and kernel events. The typed
`tools/ops/disable-usb-autosuspend.ts` workflow backs up boot configuration and
asks about reboot; do not reboot a checkout blindly or assume every idle failure
is autosuspend. See [Scripts](scripts.md) for operational workflows.

For installed USB-serial services, use coordinated recovery from `web-next`:

```bash
node --import tsx tools/ops/recover-nfc.ts USB0
```

This stops both installed owners, verifies release using `lsof`, follows the
selected TTY's **actual sysfs USB ancestry**, unbinds/rebinds that device, settles,
probes and then starts services. It does not select an ordinal `lsusb` device.
Failure leaves services stopped. The lower-level
`tools/ops/reset-usb-nfc.ts USB0` requires owners already stopped; it is not a
safe shortcut against an active service.

For development coordination, from `web-next`:

```bash
node --import tsx tools/ops/dev-with-nfc.ts
```

It stops installed reader owners, resets selected adapters, waits for the dev
server, then starts the primary and previously active readers. Ctrl+C stops the
web child **but leaves reader services running**; stop them explicitly before
direct probes. Do not run a second manual broadcaster alongside systemd.
Service templates must be rendered, use the package working directory, have
serial permissions and narrowly scoped noninteractive reset privileges.
Reader2 retains a five-second startup settle.

To observe real recovery rather than searching source text for a function:

```bash
node --import tsx tools/ops/verify-nfc-auto-recovery.ts --observe-seconds 60
```

This observes service policy, autosuspend/USB state and a fresh bounded journal
window. During the window physically unplug/replug and tap each active reader;
the tool requires a reader error followed by a fresh successful tap, with no
later reader error. It does not itself perform service mutations and does not
prove overnight stability or shutdown timing.

## Required deployment acceptance

Physical acceptance remains **unverified here**: test both deployed readers,
repeated taps, card removal, unavailable hardware, unplug/replug, network outage
and reconnect without stale taps, lane isolation and service stop in **less than
10 seconds**. `TimeoutStopSec=10` is not a measured graceful-stop result.
Simulation and authenticated network status cannot replace these checks.

For unresolved failures collect redacted errors, exact device/lane configuration
and timestamps. Keep secrets, session tokens, card UIDs and customer financial
data out of shared diagnostics. See [Security Guide](security-guide.md).
