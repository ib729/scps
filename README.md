# Student Council Payment System (SCPS) 

A system for managing student snack bar payments using NFC cards, with Python CLI tools and a modern Next.js web UI.

## Overview

- **Purpose**: Manage student accounts, NFC cards, transactions, and POS operations for a snack bar.
- **Database**: SQLite (`stuco.db`) with tables for students, cards, accounts, transactions, and overdraft tracking.
- **CLI Tools**:
  - `pos.py`: NFC-enabled point-of-sale for charging via card taps.
  - `topup.py`: Add funds to student accounts.
  - `enroll.py`: Enroll new students and cards.
- **Web UI**: Full-featured interface in `web-next/` using Next.js 16, TypeScript, and Shadcn UI.
- **NFC Integration**: PN532 reader connected to Raspberry Pi, broadcasting taps to web UI via `tap-broadcaster.py`.
- **Platform**: Raspberry Pi 4 Model B running Raspberry Pi OS (ARM64). This is the only tested and supported platform.

## Quick Start

1. **Prerequisites**: See [docs/getting-started.md](docs/getting-started.md) for platform-specific setup (Node.js, pnpm, build tools).
2. **Database**: Ensure `stuco.db` exists or run `python init_db.py`.
3. **Authentication Setup**: Configure Better Auth for the web UI (see [docs/authentication.md](docs/authentication.md)):
   ```
   cd web-next
   # Create .env.local with required variables (see docs/authentication.md)
   sqlite3 ../stuco.db < migrations/better_auth_schema.sql
   ```
4. **Web UI**:
   ```
   cd web-next
   pnpm install  # Auto-builds dependencies
   pnpm dev
   ```
   Open http://localhost:3000 and create an account.
5. **NFC POS** (CLI):
   ```
   python pos.py 6.5  # Charge ¥6.5 per tap
   ```
6. **NFC Broadcaster** (for web UI taps):
   ```
   python tap-broadcaster.py --simulate  # Test mode
   ```

## Full Documentation

Comprehensive guides are in the [docs/ directory](docs/):

### Setup & Administration
- [Getting Started](docs/getting-started.md): Installation and quick setup.
- [Deployment Guide](docs/deployment.md): Production deployment (Docker, systemd, SSL).
- [Security Guide](docs/security.md): Security best practices and hardening.
- [Database Guide](docs/database.md): Schema, migrations, and maintenance.
- [Scripts Reference](docs/scripts.md): Utility scripts documentation.

### User Guides
- [User Guide](docs/user-guide.md): How to use the system.
- [NFC Setup](docs/nfc-setup.md): Configuring card readers.

### Development
- [Development Guide](docs/development.md): Architecture and extending the system.
- [UI Components Guide](docs/ui-components.md): Custom components and animations.

### Reference
- [Troubleshooting](docs/troubleshooting.md): Common issues and solutions.
- [Changelog](docs/changelog.md): Release notes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
