# Student Council Payment System (SCPS)

A complete NFC-based payment system for managing snack bar customer purchases. Tap contactless cards for payments with real-time dashboard monitoring.

---

## Features

- **NFC Card Payments** - Fast, cashless transactions with contactless cards
- **Customer Account Management** - Track balances, cards, and transaction history
- **Modern Web Dashboard** - Built with Next.js, TypeScript, and Tailwind CSS
- **CLI Tools** - Manage accounts, ledger adjustments, CSV imports, database restore and diagnostics
- **Real-time Updates** - Live tap notifications in the web interface
- **Dual Reader Support** - Run multiple NFC readers simultaneously

---

## Platform Architecture

The Student Council Payment System is split into a central server and client tap nodes:

For example, a Linux VPS can run the server and SQLite database, while a
Raspberry Pi runs the reader service and sends taps over WebSockets.

---

## Quick Start

Requires Node.js >=26.13.1 <27, pnpm 12.21.0 and `sqlite3`. Native-addon compilation may need a C/C++ toolchain and Python >=3.11; application and reader logic do not run Python. Reader hosts also need native libnfc tools.

For a fresh installation only. Keep existing environment files and ledgers;
follow [Getting Started](docs/getting-started.md) for full prerequisites.

### 1. Install Dependencies and Configure the Environment

```bash
cd web-next
pnpm install --frozen-lockfile
cp .env.local.example .env.local
cd ..
```

Edit `web-next/.env.local`: set `DATABASE_PATH` to the absolute path of your database and generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.

### 2. Initialize a New Database and Create an Admin User

For a new installation only (use the same database path configured above):

```bash
sqlite3 /absolute/path/to/stuco.db < migrations/schema.sql
sqlite3 /absolute/path/to/stuco.db < web-next/migrations/better_auth_schema.sql
./scps-cli users
```

Existing installations must keep their ledger and environment files and follow the stopped-writer [migration and rollback procedure](docs/database.md) before upgrading. Startup refuses legacy/mixed schemas and non-cent ledgers rather than converting them automatically.

### 3. Run the Web Interface

```bash
cd web-next
```

**Development mode:**
```bash
pnpm dev
```

**Production mode:**
```bash
pnpm build
pnpm start
```

Open http://localhost:3000. Staff/admin use `/admin`; buyers use `/customer` and remain pending until an administrator links their ledger account. Account grants and payment decisions remain administrator-only.

### 4. Next Steps

- **Set up authentication** - See [docs/authentication.md](docs/authentication.md)
- **Configure NFC readers** - See [docs/nfc-setup.md](docs/nfc-setup.md)
- **Deploy to production** - See [docs/deployment.md](docs/deployment.md)

---

## Administrative CLI Tools

Manage your production stack securely using our unified TypeScript CLI launchers located at the root of the repository:

### Local Execution (on the Server/VPS)
Run the CLI directly on the server to manage accounts, balances, and imports interactively:
```bash
./scps-cli
```

### Remote Secure Control (from your Local Machine)
If your database is hosted on a remote production VPS, run the secure SSH-tunnel launcher to control the remote database interactively from your local terminal:
```bash
./scps-remote-cli
```

Reader and diagnostic programs live in `web-next/hardware/`; CSV, SQLite and migration tools in `web-next/tools/`; operational workflows in `web-next/tools/ops/`. Run typed entrypoints from `web-next` with `node --import tsx`. Only the two root CLI launchers and `scripts/setup.sh` remain in shell.

---

## Documentation

### Getting Started
- [Getting Started](docs/getting-started.md) - Installation and prerequisites
- [Deployment Guide](docs/deployment.md) - Production Nginx reverse proxy, SSL, and systemd
- [Security Guide](docs/security-guide.md) - Best practices for securing your system

### Configuration
- [Authentication](docs/authentication.md) - Set up Better Auth for the web interface
- [NFC Setup](docs/nfc-setup.md) - Configure PN532 card readers on client nodes
- [Dual readers](docs/nfc-setup.md#dual-readers) and [Raspberry Pi pinout](docs/nfc-setup.md#raspberry-pi-4-pinout)
- [Database Guide](docs/database.md) - Schema details and migrations

### Usage
- [User Guide](docs/user-guide.md) - Day-to-day operations
- [Scripts Reference](docs/scripts.md) - Administrative CLI reference and utilities
- [Customer import](docs/scripts.md#customer-import-snapshots-and-schema-cutover)

### Development
- [Development Guide](docs/development.md) - Architecture and extending the system
- [UI components](docs/development.md#ui-components)
- [Testing Guide](docs/testing.md) - Running tests

### Support
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [Changelog](docs/changelog.md) - Version history and updates

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
