# Raspberry Pi 4 GPIO Pinout

Physical pin numbers below refer to the 40-pin header, not BCM GPIO numbers or
software numbering. Locate physical pin 1 using the board marking/square pad;
do not infer orientation solely from how a photograph is rotated.

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

## PN532 wiring and safety

- Power down before connecting wires or changing the PN532 UART/I2C mode
  switches. Their positions depend on the module; follow its datasheet/labels.
- Pi GPIO signals are **3.3 V and not 5 V tolerant**. A module accepting 5 V on
  its supply input does not establish that its signal pins are safe for the Pi.
  Verify supply, regulator, pull-ups and adapter logic levels separately.
- UART: Pi physical pin 8 (TX) goes to PN532 RX; pin 10 (RX) goes to PN532 TX.
  Connect common GND, for example physical pin 6. Enable the serial hardware,
  disable the serial login console and confirm the actual UART device node.
- I2C: physical pin 3 is SDA1 and pin 5 is SCL1. Use common GND, enable I2C and
  verify the selected bus. Do not pull I2C signals up to 5 V.
- Select the board-specified compatible supply, use short reliable wiring and
  avoid confusing physical pins with BCM numbers. Pins 27/28 are reserved for
  HAT identification and are not the ordinary SDA1/SCL1 connection.

The native libnfc [PN532 UART driver](https://github.com/nfc-tools/libnfc/blob/master/libnfc/drivers/pn532_uart.c)
owns default **115200 baud** initialization; the
[PN532 I2C driver](https://github.com/nfc-tools/libnfc/blob/master/libnfc/drivers/pn532_i2c.c)
owns **0x24** addressing/readiness timing. Do not substitute a serial fallback
for an I2C reader or override calibration to compensate for wiring errors.

For exact Node/tsx commands and device configuration see [NFC Setup](nfc-setup.md).
See [Dual Reader Setup](dual-reader-setup.md) for service/lane mapping.
Authenticated network presence is not reader health: both-reader physical tap,
unplug/replug, network recovery and service stop under 10 seconds still require
deployment acceptance and remain unverified here.
