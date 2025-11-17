# Student Council Payment System (SCPS)

A system for managing student snack bar payments using NFC cards. It includes Python CLI tools for quick operations and a modern web interface built with Next.js.

## What It Does

This system helps manage everything related to student snack bar purchases:

- **Students and Accounts**: Keep track of student accounts, NFC cards, and balances
- **Database**: Uses SQLite (`stuco.db`) to store students, cards, accounts, transactions, and overdraft information
- **Point of Sale**: CLI tools for processing payments via NFC card taps
- **Web Interface**: A full-featured dashboard built with Next.js 16, TypeScript, and Tailwind CSS
- **NFC Hardware**: Works with PN532 NFC readers connected to a Raspberry Pi
- **Platform**: Built and tested on Raspberry Pi 4 Model B running Raspberry Pi OS Lite (ARM64)

## CLI Tools

Three Python scripts handle quick operations:

- `pos.py` - Point-of-sale terminal for charging students via card taps
- `topup.py` - Add money to student accounts
- `enroll.py` - Register new students and link their NFC cards

## Quick Start

### 1. Prerequisites
Check out [docs/getting-started.md](docs/getting-started.md) for setting up Node.js, pnpm, and other build tools.

### 2. Set Up the Database
Make sure `stuco.db` exists, or create it:
```bash
python init_db.py
```

### 3. Configure Authentication
The web UI uses Better Auth. See [docs/authentication.md](docs/authentication.md) for details:
```bash
cd web-next
# Create .env.local with your config (check the docs)
sqlite3 ../stuco.db < migrations/better_auth_schema.sql
```

### 4. Start the Web Interface
For development:
```bash
cd web-next
pnpm install  # Installs and builds dependencies
pnpm dev
```

For production:
```bash
cd web-next
pnpm build  
pnpm start
```

Then open http://localhost:3000 and create your account.

### 5. Use the NFC Point of Sale
Charge students by tapping their cards:
```bash
python pos.py 6.5  # Charges ¥6.5 per tap
```

### 6. Run the NFC Broadcaster
This broadcasts NFC taps to the web UI in real-time:
```bash
python tap-broadcaster.py --simulate  # Test mode without hardware
```

## Documentation

Everything is documented in the [docs/](docs/) folder:

### Setup and Administration
- [Getting Started](docs/getting-started.md) - Installation and initial setup
- [Deployment Guide](docs/deployment.md) - Running in production with Docker, systemd, and SSL
- [Security Guide](docs/security-guide.md) - Keeping your system secure
- [Database Guide](docs/database.md) - Understanding the database schema and migrations
- [Scripts Reference](docs/scripts.md) - Documentation for utility scripts

### Using the System
- [User Guide](docs/user-guide.md) - How to use the system day-to-day
- [NFC Setup](docs/nfc-setup.md) - Setting up your card readers

### Development
- [Development Guide](docs/development.md) - System architecture and how to extend it
- [UI Components Guide](docs/ui-components.md) - Custom components and animations

### Help
- [Troubleshooting](docs/troubleshooting.md) - Solutions to common problems
- [Changelog](docs/changelog.md) - What's new in each version

## Supporting This Project

If you find this project helpful and would like to support its development, consider making a donation:

**Bitcoin (BTC):**
```
bc1pyv54eqxuanqgv3cm2yjl37xjxlavnh7fcfu9d3yg983uzp4qazcs5xgsz2
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
