# NFC Card Tap Integration

The Student Council Payment System uses a local reader host to send card UIDs to
the custom Node server at `/api/nfc/ws`. Staff use `/admin/pos`; enrolled cards
select a customer, then staff enter and confirm the charge. Top-ups use manual
customer selection at `/admin/topup`. Customer accounts use `/customer`, not the
operator NFC interface. The server/database may be remote; it needs no USB reader.

## Requirements and supported readers

- Node `>=26.13.1 <27`, pinned pnpm and the dependencies in `web-next`.
- Debian reader hosts need `libnfc-bin` (including `nfc-list` and
  `nfc-scan-device`), `usbutils`, `lsof` and `udev`.
- Documented hardware: PN532 UART, PN532 I2C and USB readers supported by the
  installed libnfc drivers. A CH340 USB-to-serial adapter is a UART transport,
  **not** a native USB NFC reader. Other reader families are not promised support.
- Application/runtime code is TypeScript; third-party native addon compilation
  may still require Python, but no reader runtime or virtual environment does.

Install the package dependencies from `web-next`:

```bash
cd "$PROJECT_ROOT/web-next"
pnpm install --frozen-lockfile
```

See [Deployment](deployment.md) for system installation and pinned tooling.
The remaining examples run from this same package directory.

## Wiring and native calibration

Disconnect power before changing wiring or the module's UART/I2C mode switches;
switch positions vary by board, so follow its markings/datasheet. Check the
module's supply voltage separately from its logic voltage. Raspberry Pi GPIO is
3.3 V logic and is not 5 V tolerant; do not feed a 5 V adapter TX signal into it.
Use a common ground, short reliable wires and a suitable power supply.

| PN532 UART | Raspberry Pi physical pin |
|---|---|
| RX | 8, GPIO14/TXD |
| TX | 10, GPIO15/RXD |
| GND | 6 (or another ground) |
| Supply | Board-specified compatible supply; verify before connecting |

For GPIO UART, enable serial hardware and disable the serial login console in
the Pi's interface configuration. Confirm the actual device node: it is not
identical across every Pi/OS configuration.

| PN532 I2C | Raspberry Pi physical pin |
|---|---|
| SDA | 3, GPIO2/SDA1 |
| SCL | 5, GPIO3/SCL1 |
| GND | 6 |
| Supply | Board-specified compatible supply |

Enable the I2C interface and verify `/dev/i2c-1` exists. Check pull-ups and logic
levels; never pull Pi I2C lines up to 5 V. See the
[GPIO reference](raspberry-pi-4-gpio-pinout.md).

The native [UART driver](https://github.com/nfc-tools/libnfc/blob/master/libnfc/drivers/pn532_uart.c)
owns PN532 initialization and its default **115200 baud** calibration.
The native [I2C driver](https://github.com/nfc-tools/libnfc/blob/master/libnfc/drivers/pn532_i2c.c)
owns address **0x24**, readiness and timing. Do not replace those with serial
fallbacks or ad hoc timing changes. A USB serial adapter must also use the
PN532's UART mode with crossed TX/RX.

Give the service account appropriate serial (`dialout`) or I2C (`i2c`) group
access, then establish a new login/service session. For native USB use appropriate
device permissions/udev rules. Do not make devices world-writable.

## Exact device selection

```bash
# GPIO UART
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyAMA0 --lane reader-1
# USB-to-UART PN532
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyUSB0 --lane reader-1
# I2C PN532
node --import tsx hardware/tap-broadcaster.ts --device pn532_i2c:/dev/i2c-1 --lane reader-1
```

Supply the URL and secret as described below. An exact native USB connstring
must come from the installed libnfc discovery output, not from a guessed USB
serial path.

Selection precedence is `--device`, `PN532_DEVICE`, sorted native discovery,
then the legacy AMA0 default if discovery reports no devices. Discovery runs
`nfc-scan-device -i`: **this is an intrusive scan**, including UART probing.
Stop reader owners before scanning; for multiple readers always configure exact
devices rather than letting both processes select the first discovered reader.

Legacy selectors such as `tty:USB0:pn532` and
`i2c:/dev/i2c-1:pn532` are normalized to the native strings above. A legacy
`usb:BUS:DEVICE` selector must resolve to exactly one supported native reader.
Missing, ambiguous or unsupported explicit selections fail; the application
does not silently substitute another reader.

Each read invokes `nfc-list -v` with the selected `LIBNFC_DEVICE`,
`LC_ALL=C` and a five-second child deadline. The
[nfc-list source](https://github.com/nfc-tools/libnfc/blob/master/utils/nfc-list.c)
defines its output contract. A healthy no-card result requires exactly one
opened reader and a completed scan. “No NFC device found”, invalid identifiers
and ambiguous multiple cards are errors, not healthy empty reads. Present one
card at a time. No invented `nfc-poll` device or timeout flags are needed.

## Server and authentication

The custom entrypoint is `web-next/server.ts`; package scripts already use it:

```bash
pnpm dev
# Production, after deployment configuration:
pnpm build
pnpm start
```

Configure a strong `NFC_TAP_SECRET` on both server and reader host. Keep secrets
in restricted environment files, out of version control, terminal recordings and
logs. On a remote deployment use HTTPS/WSS and a proxy that permits WebSocket
upgrades at `/api/nfc/ws`; do not expose the development server publicly.

The broadcaster reads `NEXTJS_URL` (default `http://localhost:3000`),
`NFC_TAP_SECRET`, `POS_LANE_ID` (default `default`) and `PN532_DEVICE`.
Its flags are `--url`, `--secret`, `--lane`, `--device`, `--simulate`, `--test`.
Prefer the environment for secrets rather than process-visible `--secret`.
Standalone hardware commands require these variables in their process environment.

The broadcaster first sends `{type:"auth", role:"broadcaster", secret, lane}`
and waits for `auth_success`. Taps contain `type:"tap"`, uppercase `card_uid`,
`lane`, `reader_id` and UTC `reader_ts`. Browsers require an authorized operator
session and lane selection; the shared secret is not a customer credential.

## Network-only and simulated tests

Against a disposable server/database, with the secret already configured:

```bash
node --import tsx hardware/tap-broadcaster.ts --test --lane reader-1
node --import tsx hardware/tap-broadcaster.ts --simulate --lane reader-1
```

`--test` sends `DEADBEEF` once and exits with success/failure. Simulation accepts
hex UIDs; `q`, `quit`, `exit` or EOF ends it. These can cause UI tap events:
do not use a live checkout to experiment.

The POS indicator and authenticated `/api/nfc/status?reader=reader-1` report
**authenticated broadcaster network presence**, not reader communication.
“Broadcaster connected; hardware health unknown” is deliberate. A successful
synthetic tap, existing TTY or active systemd unit does not prove hardware health.

## Runtime recovery and services

The reader loop spaces successful reads by 100 ms and debounces the same UID
for 1.5 seconds; a held card can therefore be emitted again after that interval.
Hardware failures back off independently from 1 to 30 seconds; network reconnects
back off from 1 to 60 seconds. Network disconnect cancels the current native
child, waits for descriptor release and discards stale results before a new
generation starts. Disconnected taps are not buffered or replayed. Cancellation
uses SIGTERM with bounded SIGKILL escalation if needed.

Use the rendered `tap-broadcaster.service` and
`tap-broadcaster-reader2.service`, not raw repository templates with unresolved
placeholders. Setup installs reader units but does not enable them before
configuration. See [Dual Reader Setup](dual-reader-setup.md) for exact mapping,
environment files, pre-start USB resets and stop/start ownership rules.

## Physical acceptance — still required

No physical hardware acceptance was performed for this documentation cutover.
On the deployment host, verify **both** readers, repeated taps and card removal,
unavailable reader, unplug/replug, network outage/reconnect with no stale tap,
lane isolation and service stop in **less than 10 seconds**. Record actual
observations; the service's `TimeoutStopSec=10` is a limit, not proof of graceful
shutdown. Simulation cannot replace these checks.

See [Troubleshooting](troubleshooting.md), [User Guide](user-guide.md) and
[Security Guide](security-guide.md) for operation and recovery.
