# Student Council Payment System (SCPS)

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

## Platform Architecture

The Student Council Payment System is split into a central server and client tap nodes:

*   **Primary Server:** Hosted on a standard **Linux Cloud VPS (Debian 12 / Ubuntu 22.04+)**. This runs the central Next.js server, hosts the SQLite database, and handles authentication.
*   **IoT NFC Client Node:** Hosted on a **Raspberry Pi 4 Model B** running **Raspberry Pi OS (64-bit)**. This acts as the physical tap reader node, running a background service to stream card scans over WebSockets to the server.

---

## Quick Start

Requires Node.js 22, pnpm 10+, and `sqlite3`.

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

Existing installations should keep their database and environment files.

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

Open http://localhost:3000 to log in to the dashboard.

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

NFC broadcaster, CSV import, and hardware diagnostics live in `hardware-pi/`. The old Python POS, enrollment, top-up, and database-management entry points have been replaced by the web interface and administrative CLI.

---

## Documentation

### Getting Started
- [Getting Started](docs/getting-started.md) - Installation and prerequisites
- [Deployment Guide](docs/deployment.md) - Production Nginx reverse proxy, SSL, and systemd
- [Security Guide](docs/security-guide.md) - Best practices for securing your system

### Configuration
- [Authentication](docs/authentication.md) - Set up Better Auth for the web interface
- [NFC Setup](docs/nfc-setup.md) - Configure PN532 card readers on client nodes
- [Database Guide](docs/database.md) - Schema details and migrations

### Usage
- [User Guide](docs/user-guide.md) - Day-to-day operations
- [Scripts Reference](docs/scripts.md) - Administrative CLI reference and utilities

### Development
- [Development Guide](docs/development.md) - Architecture and extending the system
- [UI Components Guide](docs/ui-components.md) - Custom components and animations
- [Testing Guide](docs/testing.md) - Running tests

### Support
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [Changelog](docs/changelog.md) - Version history and updates

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
