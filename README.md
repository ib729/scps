# Student Council Payment System (SCPS)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Raspberry%20Pi%204-C51A4A?logo=raspberrypi)](https://www.raspberrypi.com/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ib729/scps)
[![Donate Bitcoin](https://img.shields.io/badge/Donate-Bitcoin-orange?logo=bitcoin&logoColor=white)](#supporting-this-project)

A complete NFC-based payment system for managing student snack bar purchases. Tap contactless cards for instant payments with real-time dashboard monitoring.

---

## Features

- **NFC Card Payments** - Fast, cashless transactions with contactless cards
- **Student Account Management** - Track balances, cards, and transaction history
- **Modern Web Dashboard** - Built with Next.js, TypeScript, and Tailwind CSS
- **CLI Tools** - Quick command-line utilities for POS, top-ups, and enrollment
- **Real-time Updates** - Live tap notifications in the web interface
- **Dual Reader Support** - Run multiple NFC readers simultaneously

---

## Platform

Built for **Raspberry Pi 4 Model B** running **Raspberry Pi OS (64-bit)**

Tested on:
- Raspberry Pi 4 Model B (8GB RAM recommended)
- Raspberry Pi OS (Bookworm or later)
- Debian-based Linux distributions
- Arch Linux

---

## Quick Start

### 1. Initialize the Database

```bash
python init_db.py
```

### 2. Install Web Dependencies

```bash
cd web-next
pnpm install
```

### 3. Run the Web Interface

**Development mode:**
```bash
pnpm dev
```

**Production mode:**
```bash
pnpm build
pnpm start
```

Open http://localhost:3000 and create your admin account.

### 4. Next Steps

- **Set up authentication** - See [docs/authentication.md](docs/authentication.md)
- **Configure NFC readers** - See [docs/nfc-setup.md](docs/nfc-setup.md)
- **Deploy to production** - See [docs/deployment.md](docs/deployment.md)

---

## CLI Tools

Quick operations from the command line:

- `pos.py` - Process payments via NFC card taps
- `topup.py` - Add money to student accounts
- `enroll.py` - Register new students and link NFC cards
- `tap-broadcaster.py` - Broadcast NFC taps to the web interface in real-time

**Example:**
```bash
python pos.py 6.5  # Charge ¥6.5 per tap
```

---

## Documentation

### Getting Started
- [Getting Started](docs/getting-started.md) - Installation and prerequisites
- [Deployment Guide](docs/deployment.md) - Production setup with Docker, systemd, and SSL
- [Security Guide](docs/security-guide.md) - Best practices for securing your system

### Configuration
- [Authentication](docs/authentication.md) - Set up Better Auth for the web interface
- [NFC Setup](docs/nfc-setup.md) - Configure PN532 card readers
- [Database Guide](docs/database.md) - Schema details and migrations

### Usage
- [User Guide](docs/user-guide.md) - Day-to-day operations
- [Scripts Reference](docs/scripts.md) - Utility scripts and tools

### Development
- [Development Guide](docs/development.md) - Architecture and extending the system
- [UI Components Guide](docs/ui-components.md) - Custom components and animations
- [Testing Guide](docs/testing.md) - Running tests

### Support
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [Changelog](docs/changelog.md) - Version history and updates

---

## Supporting This Project

If you find this project helpful and would like to support its development, consider making a donation:

**Bitcoin (BTC):**
```
bc1pyv54eqxuanqgv3cm2yjl37xjxlavnh7fcfu9d3yg983uzp4qazcs5xgsz2
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
