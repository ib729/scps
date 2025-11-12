```  
     2| +-----+-----+---------+------+---+---Pi 4B---+---+------+---------+-----+-----+
     3| | BCM | wPi |   Name  | Mode | V | Physical  | V | Mode | Name    | wPi | BCM |
     4| +-----+-----+---------+------+---+----++----+---+------+---------+-----+-----+
     5| |     |     | 3v3 PWR |      |   |  1 || 2  |   |      | 5v PWR  |     |     |
     6| |  2  |  8  | SDA1    | ALT0 |   |  3 || 4  |   |      | 5v PWR  |     |     |
     7| |  3  |  9  | SCL1    | ALT0 |   |  5 || 6  |   |      | GND     |     |     |
     8| |  4  |  7  | GPIO 4  | IN   |   |  7 || 8  |   | ALT0 | TXD0    | 15  | 14  |
     9| |     |     | GND     |      |   |  9 || 10 |   | ALT0 | RXD0    | 16  | 15  |
    10| | 17  |  0  | GPIO17  | IN   |   | 11 || 12 |   | ALT0 | GPIO18  | 1   | 18  |
    11| | 27  |  2  | GPIO27  | IN   |   | 13 || 14 |   |      | GND     |     |     |
    12| | 22  |  3  | GPIO22  | IN   |   | 15 || 16 |   | IN   | GPIO23  | 4   | 23  |
    13| |     |     | 3v3 PWR |      |   | 17 || 18 |   | IN   | GPIO24  | 5   | 24  |
    14| | 10  | 12  | MOSI    | ALT0 |   | 19 || 20 |   |      | GND     |     |     |
    15| |  9  | 13  | MISO    | ALT0 |   | 21 || 22 |   | IN   | GPIO25  | 6   | 25  |
    16| | 11  | 14  | SCLK    | ALT0 |   | 23 || 24 |   | ALT0 | CE0     | 10  | 8   |
    17| |     |     | GND     |      |   | 25 || 26 |   | ALT0 | CE1     | 11  | 7   |
    18| |  0  | 30  | SDA0    | ALT0 |   | 27 || 28 |   | ALT0 | SCL0    | 31  | 1   |
    19| |  5  | 21  | GPIO5   | IN   |   | 29 || 30 |   |      | GND     |     |     |
    20| |  6  | 22  | GPIO6   | IN   |   | 31 || 32 |   | ALT0 | GPIO12  | 26  | 12  |
    21| | 13  | 23  | GPIO13  | ALT0 |   | 33 || 34 |   |      | GND     |     |     |
    22| | 19  | 24  | GPIO19  | ALT0 |   | 35 || 36 |   | IN   | GPIO16  | 27  | 16  |
    23| | 26  | 25  | GPIO26  | IN   |   | 37 || 38 |   | ALT0 | GPIO20  | 28  | 20  |
    24| |     |     | GND     |      |   | 39 || 40 |   | ALT0 | GPIO21  | 29  | 21  |
    25| +-----+-----+---------+------+---+----++----+---+------+---------+-----+-----+
    26| | BCM | wPi |   Name  | Mode | V | Physical  | V | Mode | Name    | wPi | BCM |
    27| +-----+-----+---------+------+---+---Pi 4B---+---+------+---------+-----+-----+
    28|
    29|---
    30|
    31|## Orientation
    32|
    33|- Place your Raspberry Pi **with the GPIO header on the right**
    34|- HDMI port(s) on the **left side**
    35|
    36|---
    37|
    38|## Legend
    39|
    40|| Symbol | Meaning |
    41||:-------|:---------|
    42|| 🟢 **GPIO** | General Purpose Input/Output |
    43|| 🟣 **SPI** | Serial Peripheral Interface |
    44|| 🔵 **I²C** | Inter-Integrated Circuit |
    45|| 🟠 **UART** | Universal Asynchronous Receiver/Transmitter |
    46|| ⚪ **PCM** | Pulse Code Modulation |
    47|| ⚫ **Ground** | Electrical Ground |
    48|| 🔴 **5V** | 5 Volt Power Supply |
    49|| 🟡 **3.3V** | 3.3 Volt Power Supply |
    50|
    51|---
    52|
    53|## Notes
    54|
    55|- The **40-pin header** is standard across Raspberry Pi **A+, B+, Zero, and later** models.
    56|- Pins are numbered **1–40** (odd on the left, even on the right).
    57|- Always check your **power pins (5V, 3.3V, GND)** before connecting external hardware to avoid damage.
    58|
    59|**Last updated: November 11, 2025**
