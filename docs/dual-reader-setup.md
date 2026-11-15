# Dual NFC Reader Setup Guide

Two local readers send authenticated WebSocket taps to the Student Council
Payment System server. Staff choose their reader in Settings and use
`/admin/pos`; customers use `/customer`. The remote server needs no NFC hardware.
See [NFC Setup](nfc-setup.md) for wiring, voltage, mode switches and native
libnfc requirements.

## Assign devices explicitly

Never start two unconfigured broadcasters and assume they choose different
readers. Native discovery uses intrusive `nfc-scan-device -i` probing and sorted
selection, not an interprocess “first free reader” allocator. Stop all reader
owners before discovery or direct probes. Unsupported explicit devices fail;
there is no arbitrary reader fallback.

For two PN532 boards on USB-to-UART adapters, establish this mapping:

| Service | Device | Lane | Reported reader ID |
|---|---|---|---|
| `tap-broadcaster.service` | `pn532_uart:/dev/ttyUSB0` | `reader-1` | `reader-1` |
| `tap-broadcaster-reader2.service` | `pn532_uart:/dev/ttyUSB1` | `reader-2` | `reader-2` |

From `web-next`, in separate terminals with `NEXTJS_URL` and `NFC_TAP_SECRET`
already exported:

```bash
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyUSB0 --lane reader-1
node --import tsx hardware/tap-broadcaster.ts --device pn532_uart:/dev/ttyUSB1 --lane reader-2
```

USB0/USB1 derive `reader_id` as reader-1/reader-2; `--lane` still controls the
authentication/routing lane. Keep these paired. Other device paths use the lane
as reader identity. GPIO UART (`pn532_uart:/dev/ttyAMA0`), I2C
(`pn532_i2c:/dev/i2c-1`) and libnfc-supported native USB can be configured with
distinct exact devices and lanes too. Do not point both processes at the same
hardware under different aliases.

USB enumeration can change after reboot/replug. Record the physical adapter,
TTY and lane mapping and recheck it after changes. Persistent udev names can
help, but must be configured for the actual adapter identity; identical cheap
adapters may lack unique serials. A fixed physical socket alone is no guarantee
of a stable ttyUSB number.

## Install and configure services

Use [Deployment](deployment.md)'s setup procedure. It renders the repository's
`systemd/tap-broadcaster.service` and `systemd/tap-broadcaster-reader2.service`
with run user, repository root, Node executable and PATH placeholders.
**Do not copy the unrendered templates directly into systemd.**

Both units run from the package working directory:

```ini
ExecStart=/absolute/path/to/node --import tsx hardware/tap-broadcaster.ts
```

The rendered units load the repository-root `.env.broadcaster`. Restrict its
permissions to the service account/administrators; keep it out of Git:

```dotenv
NEXTJS_URL=https://your-server.example
NFC_TAP_SECRET=replace-with-the-server-shared-secret
```

The template's per-unit settings are:

| Setting | First unit | Second unit |
|---|---|---|
| `POS_LANE_ID` | `reader-1` | `reader-2` |
| `PN532_DEVICE` | `tty:USB0:pn532` | `tty:USB1:pn532` |
| USB pre-start reset selector | `USB0` | `USB1` |
| Extra pre-start settle | none | 5 seconds |
| Restart | `always`, after 5 seconds | `always`, after 5 seconds |
| Stop window | 10 seconds | 10 seconds |

The legacy TTY strings normalize to the native UART strings above. If changing
the selected device, also review the unit's `ExecStartPre` reset target; a GPIO,
I2C or native USB reader must not retain an unrelated USB-serial reset command.
The USB reset invokes `tools/ops/reset-usb-nfc.ts` through Node/tsx.
Serial access and narrowly authorized noninteractive reset privileges must be
configured before enabling services; do not grant unrestricted passwordless sudo.

Setup installs but does not enable the reader units. Once configured on the
reader host:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tap-broadcaster tap-broadcaster-reader2
sudo systemctl start tap-broadcaster tap-broadcaster-reader2
systemctl status tap-broadcaster tap-broadcaster-reader2
journalctl -u tap-broadcaster -u tap-broadcaster-reader2 -f
```

## Staff selection and isolation

1. Sign in as staff/admin and open `/admin/pos`.
2. In the avatar menu's Settings, choose Reader 1 or Reader 2 and save.
3. In a separate browser/device, select the other reader.
4. Tap each physical reader and verify only its matching checkout selects the
   enrolled customer. Check the broadcaster log's `lane` and `reader_id`.

The browser stores selection as `nfc_reader_lane` and subscribes to that lane.
Selecting the same lane in two browsers intentionally subscribes both; reader
selection is not an exclusive cashier lock. A connected indicator establishes
authenticated network presence only, not PN532 health.

For filtering experiments on a disposable server, run from `web-next`:

```bash
node --import tsx hardware/tap-broadcaster.ts --simulate --lane reader-1
# Separate terminal:
node --import tsx hardware/tap-broadcaster.ts --simulate --lane reader-2
```

These are synthetic events, not hardware tests.

## Diagnosis and safe recovery

Start with USB topology/TTY observations, which do not open readers:

```bash
cd "$PROJECT_ROOT/web-next"
node --import tsx tools/ops/check_usb_port.ts
```

Before direct probes, stop **both** installed broadcaster services and release
any manually started readers. Inspect ownership with
`sudo lsof -- /dev/ttyUSB0 /dev/ttyUSB1`; do not kill unrelated processes or race
a running service.
Then choose an appropriate diagnostic:

```bash
node --import tsx hardware/diagnose-nfc.ts
node --import tsx hardware/test-readers.ts
node --import tsx hardware/test-usb-ports.ts
```

The interactive general diagnostic accepts an exact reader selection;
`test-readers.ts` probes USB0 and USB1 sequentially with bounded native reads.
The port comparison prompts for physical moves. Opening a reader without a
card proves communication only, not that a physical tap was read.

For installed services needing coordinated USB-serial recovery:

```bash
node --import tsx tools/ops/recover-nfc.ts USB0
```

It stops both installed owners, verifies inactive/failed state and checks
unmanaged ownership with `lsof`, resets the selected TTY's actual sysfs USB
ancestor, settles, probes, then starts the installed services. Failures leave
them stopped for inspection. It never chooses the “first lsusb device”.
The lower-level `tools/ops/reset-usb-nfc.ts USB0` only resets hardware: it does
not stop owners for you. Do not use it against a running reader.

After ownership-safe recovery, verify a real tap on each lane. Active services,
USB enumeration, authentication and simulation are not hardware-health proof.

## Required physical acceptance

Both-reader acceptance remains **unverified here**. On actual deployment hardware
test repeated taps, card removal, unplug/replug, absent readers, network outage
and reconnect without replaying old taps, lane isolation, reboot mapping and
service shutdown in **less than 10 seconds**. The second reader's five-second
startup settle is not a shutdown allowance. Inspect fresh logs and record
outcomes instead of assuming restart policy guarantees recovery.

See [Troubleshooting](troubleshooting.md) and [GPIO Reference](raspberry-pi-4-gpio-pinout.md).
