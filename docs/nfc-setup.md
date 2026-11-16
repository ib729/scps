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
levels; never pull Pi I2C lines up to 5 V. See the [GPIO reference](#raspberry-pi-4-pinout).

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

Use the rendered `scps-reader.service` and
`scps-reader2.service`, not raw repository templates with unresolved
placeholders. Setup installs reader units but does not enable them before
configuration. See [Dual readers](#dual-readers) for exact mapping,
environment files, pre-start USB resets and stop/start ownership rules.

## Physical acceptance, still required

No physical hardware acceptance was performed for this documentation cutover.
On the deployment host, verify **both** readers, repeated taps and card removal,
unavailable reader, unplug/replug, network outage/reconnect with no stale tap,
lane isolation and service stop in **less than 10 seconds**. Record actual
observations; the service's `TimeoutStopSec=10` is a limit, not proof of graceful
shutdown. Simulation cannot replace these checks.

See [Troubleshooting](troubleshooting.md), [User Guide](user-guide.md) and
[Security Guide](security-guide.md) for operation and recovery.

## Dual readers

Two local readers send authenticated taps to the server. The details below
describe service, device and lane mapping.

### Assign devices explicitly

Never start two unconfigured broadcasters and assume they select different
readers. Stop all owners before discovery or direct probes.

| Service | Device | Lane | Reported reader ID |
|---|---|---|---|
| `scps-reader.service` | `pn532_uart:/dev/ttyUSB0` | `reader-1` | `reader-1` |
| `scps-reader2.service` | `pn532_uart:/dev/ttyUSB1` | `reader-2` | `reader-2` |

USB enumeration can change on reboot or replug. Record each physical adapter,
TTY and lane and recheck after changes. Identical adapters may lack unique
serials, so neither a socket nor a udev rule automatically ensures identity.

### Service setup and acceptance

Use the rendered units from [Deployment](deployment.md), not the raw templates.
Both units read the shared root `.env.broadcaster`; do not set a shared
`PN532_DEVICE` or `POS_LANE_ID` that overrides the individual mapping. Check
each unit's environment and its pre-start reset target when changing devices.
The first unit selects `tty:USB0:pn532`, lane `reader-1` and USB0 reset.
The second selects `tty:USB1:pn532`, lane `reader-2`, USB1 reset and a
five-second startup settle. Both restart after five seconds and have a
ten-second stop window. Configure serial access and narrowly authorized
noninteractive reset privileges before enabling either service.

From `web-next`, with `NEXTJS_URL` and `NFC_TAP_SECRET` exported, manual
instances can use exact devices:

```sh
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyUSB0 --lane reader-1
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyUSB1 --lane reader-2
```

USB0 and USB1 derive `reader_id` as `reader-1` and `reader-2`; `--lane`
controls routing separately. Other device paths use the lane as identity.
Never point both processes at the same hardware under different aliases.

Staff select Reader 1 or Reader 2 in Settings in each operator browser.
Selection subscribes to a lane; it is not an exclusive lock. Verify each
physical tap reaches the intended checkout and check log `lane` and `reader_id`.
Before direct probes stop both services and unmanaged owners, and inspect
`sudo lsof -- /dev/ttyUSB0 /dev/ttyUSB1`. Use the coordinated recovery
procedures in [Scripts](scripts.md#reader-lifecycle-and-diagnostics).
Network presence and simulated taps do not prove physical reader health.

## Raspberry Pi 4 pinout

Physical pin numbers are not BCM GPIO numbers. Locate pin 1 using the board
marking or square pad, not the rotation of a photograph.

```text
                 Raspberry Pi 4B 40-pin header
        3.3V        1  2        5V
 GPIO2 / SDA1       3  4        5V
 GPIO3 / SCL1       5  6        GND
 GPIO4              7  8        GPIO14 / TXD
 GND                9 10        GPIO15 / RXD
 GPIO17            11 12        GPIO18
 GPIO27            13 14        GND
 GPIO22            15 16        GPIO23
 3.3V              17 18        GPIO24
 GPIO10 / MOSI     19 20        GND
 GPIO9 / MISO      21 22        GPIO25
 GPIO11 / SCLK     23 24        GPIO8 / CE0
 GND               25 26        GPIO7 / CE1
 GPIO0 / ID_SD     27 28        GPIO1 / ID_SC
 GPIO5             29 30        GND
 GPIO6             31 32        GPIO12
 GPIO13            33 34        GND
 GPIO19            35 36        GPIO16
 GPIO26            37 38        GPIO20
 GND               39 40        GPIO21
```

Pins 27 and 28 are reserved for HAT identification, not ordinary SDA1/SCL1.
Verify the module's supply, regulator, pull-ups and logic levels separately;
Pi signals are 3.3 V and not 5 V tolerant. See the wiring and calibration
section above before connecting hardware.
