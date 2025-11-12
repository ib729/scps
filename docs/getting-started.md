# Getting Started

This guide covers installing prerequisites, setting up the database, installing dependencies, and running the system on macOS, Linux, or Raspberry Pi OS.

## Prerequisites

### All Platforms

- **Python 3.9+**: For CLI tools.
  - Check: `python --version`
  - Install: Use your package manager (e.g., `brew install python` on macOS, `sudo apt install python3` on Debian).

- **Node.js 20+**: For the web UI.
  - Check: `node --version`
  - macOS: `brew install node`
  - Debian/Pi: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

- **pnpm**: Package manager for Node.js.
  - Check: `pnpm --version`
  - Install: `npm install -g pnpm` or `curl -fsSL https://get.pnpm.io/install.sh | sh -`

- **Git**: For cloning the repository.
  - Check: `git --version`

### macOS Specific

**Xcode Command Line Tools** (for compiling native modules like better-sqlite3):

- Check: `xcode-select -p`
- Install: `xcode-select --install`

### Debian/Raspberry Pi OS Specific

**Build Essentials** (for compiling native modules):

```bash
sudo apt update
sudo apt install -y build-essential python3 pkg-config
```

For Raspberry Pi OS Lite (headless):

```bash
sudo apt install -y git vim curl wget
```

### Raspberry Pi Notes

- **Recommended**: Raspberry Pi 4B with 8GB RAM.
- **Minimum**: Pi Zero 2 W (slower compilation).
- **OS**: Raspberry Pi OS (64-bit, Bookworm or later).
- **Swap**: Increase to 2GB if compiling on low-RAM models:
  ```bash
  sudo dphys-swapfile swapoff
  sudo nano /etc/dphys-swapfile  # Set CONF_SWAPSIZE=2048
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon
  ```

### Automatic Prerequisite Check (Web UI)

In the `web-next/` directory:

```bash
./check-prereqs.sh
```

This verifies all tools and provides installation instructions if missing.

**When to use which script:**
- `check-prereqs.sh` - Run first to verify build tools are installed (gcc, make, python3, etc.)
- `pnpm install` - Standard setup (recommended, includes postinstall for better-sqlite3)
- `setup.sh` - Legacy manual setup if postinstall fails

## Database Setup

1. **Initialize the Database**:

   ```bash
   python init_db.py
   ```

   This creates `stuco.db` with the schema from `migrations/schema.sql` (students, cards, accounts, transactions, overdraft_weeks).

2. **Verify**:

   ```bash
   sqlite3 stuco.db ".tables"
   ```

   Should show all tables.

3. **Optional: Run Migrations** (if needed):

   ```bash
   ./scripts/run_migration.sh migrate_cascade_delete.sql
   ./scripts/run_migration.sh migrate_decimal_currency.sql
   ```

   See [Database Guide](database.md) for details. Migration files are in `migrations/` directory.

## Web UI Setup

### Automated Setup (Recommended)

1. **Navigate to Web UI**:

   ```bash
   cd web-next
   ```

2. **Check Prerequisites** (optional):

   ```bash
   ./check-prereqs.sh
   ```

3. **Install Dependencies**:

   ```bash
   pnpm install
   ```

   - Automatically runs postinstall to rebuild `better-sqlite3` native bindings.
   - Handles platform-specific compilation (macOS ARM64, Linux ARM64, etc.).

4. **Configure Environment**:

   Create or update `.env.local`:

   ```
   DATABASE_PATH=/path/to/stuco.db  # Absolute path to your database
   NFC_TAP_SECRET=your-secret-key   # For NFC authentication (optional for dev)
   ```

5. **Setup Authentication**:

   Configure Better Auth for secure access:

   ```bash
   # Generate secret
   openssl rand -base64 32
   
   # Add to .env.local
   echo "BETTER_AUTH_SECRET=<generated_secret>" >> .env.local
   ```

   Run database migration:

   ```bash
   sqlite3 ../stuco.db < migrations/better_auth_schema.sql
   ```

   For detailed authentication setup, see [Authentication Guide](authentication.md).

6. **Test Database Connection** (optional):

   ```bash
   node test-db.js
   ```

   Should output database stats and confirm connection.

7. **Start Development Server**:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) - you'll be redirected to login.
   
   Create your first account at `/signup` (default code: `12345678`).

### Legacy Manual Setup

If automated setup fails:

```bash
./setup.sh  # Runs pnpm install + manual better-sqlite3 build
pnpm dev
```

### Docker Setup (Alternative)

For containerized deployment:

```bash
cd web-next
docker build -t stuco-web .
docker run -p 3000:3000 \
  -e DATABASE_PATH=/app/stuco.db \
  -e NFC_TAP_SECRET=your-secret \
  -v /path/to/stuco.db:/app/stuco.db \
  stuco-web
```

See [Deployment Guide](deployment.md) for production setup.

## CLI Tools Setup

1. **Python Environment**:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt  # Installs nfcpy, requests, etc.
   ```

2. **Test CLI**:

   ```bash
   # Enroll a student
   python enroll.py

   # Top-up (simulate)
   python topup.py "Student Name" 10.0

   # POS (simulate)
   python pos.py 6.5 --simulate
   ```

## NFC Setup Quick Start

For full NFC integration (card taps in web UI):

1. **Install NFC Dependencies** (Raspberry Pi):

   ```bash
   sudo apt install libnfc-bin libnfc-dev
   pip install nfcpy  # For TTY/USB PN532
   ```

2. **Connect PN532 Reader**:

   - UART: Connect to GPIO pins, device: `tty:AMA0:pn532`
   - USB: Plug in, device: `usb:001:003:pn532` (check with `lsusb`)

3. **Test Broadcaster**:

   ```bash
   python tap-broadcaster.py --simulate  # Type UIDs manually
   ```

   For hardware:

   ```bash
   python tap-broadcaster.py --device tty:AMA0:pn532
   ```

4. **Run as Service** (see [NFC Setup](nfc-setup.md)).

## Common Tasks

### Adding a Student (Web UI)

1. Go to Students page.
2. Click "Add Student".
3. Enter name.
4. Click "Create Student" (auto-creates account with ¥0 balance).

### Processing a Sale (Web UI - POS)

1. Go to POS page.
2. Select "Tap Card" mode.
3. Student taps card (auto-selects).
4. Enter amount (e.g., 6.5 for ¥6.5).
5. Add description and staff name.
6. Click "Charge".

**Manual Mode**: Select student from dropdown if no card.

### Top-up (Web UI)

1. Go to Top-up page.
2. Select student.
3. Enter amount (e.g., 20.0).
4. Add description.
5. Click "Add".

### CLI POS

```bash
python pos.py 6.5 --device tty:AMA0:pn532  # Real hardware
```

Weekly overdraft: ¥20.0 (resets Monday 00:00 Asia/Shanghai).

## Verification

After setup:

1. **Web UI**: http://localhost:3000/dashboard shows stats.
2. **Database**: `sqlite3 stuco.db "SELECT * FROM students;"`
3. **NFC**: Tap a card, see broadcast in terminal.
4. **better-sqlite3**: `node -e "require('better-sqlite3')(':memory:'); console.log('OK');"`

## Troubleshooting

### better-sqlite3 Errors ("bindings file not found")

1. Run `./check-prereqs.sh` in web-next/.
2. Reinstall: `rm -rf node_modules && pnpm install`.
3. Approve builds: `pnpm approve-builds better-sqlite3`.
4. Manual: `./setup.sh`.

### Raspberry Pi Compilation Slow/Out of Memory

- Increase swap (see prerequisites).
- Pre-build on faster machine and copy `node_modules/better-sqlite3`.

### NFC Not Detecting Cards

- Check connection: `ls /dev/ttyAMA0` (UART) or `lsusb` (USB).
- Test: `nfc-list` (libnfc) or simulation mode.
- Permissions: `sudo usermod -aG dialout $USER` (logout/login).

### Database Locked

- Close other connections (CLI, sqlite3).
- Use WAL mode: Enabled in schema.

For more, see [Troubleshooting](troubleshooting.md).

## Next Steps

- Enroll students and cards.
- Test POS with sample transactions.
- Set up NFC service for production.
- Backup `stuco.db` regularly.

Enjoy managing your snack bar!

**Last updated: November 12, 2025**
