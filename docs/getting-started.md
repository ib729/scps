# Getting Started

This guide covers installing prerequisites, setting up the database, installing dependencies, and running the system on a Linux Cloud VPS (Debian/Ubuntu) or standalone local platforms.

## Prerequisites

### Host Server (Linux Cloud VPS)

We recommend deploying the Next.js server and SQLite database on a standard Linux Cloud VPS (such as Debian 12 or Ubuntu 24.04).

- **Node.js 22+**: For the web interface and TypeScript CLI.
  - Check: `node --version`
  - Install (NodeSource): `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`
- **pnpm 10+**: Package manager for Node.js.
  - Check: `pnpm --version`
  - Install: `npm install -g pnpm`
- **Build Essentials**: Required to compile native SQLite database bindings.
  - Install: `sudo apt update && sudo apt install -y build-essential python3 pkg-config git curl`

### Client NFC Node (Raspberry Pi)

For localized card reader nodes located at physical POS registers:
- **Raspberry Pi OS (64-bit)**
- **Python 3.9+**: To run the WebSocket serial tap broadcaster client.
- **NFCPN532 Reader Hardware** (UART or USB configuration).

### Alternative: Standalone Raspberry Pi Full-Stack Hosting
If you wish to host the *entire* system (Next.js server, database, and reader daemon) locally on a single Raspberry Pi:
- **Swap Size:** Increase the default system swap size to at least 2GB to prevent compiling processes from running out of memory:
  ```bash
  sudo dphys-swapfile swapoff
  sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon
  ```

---

## Database Setup

Initialize your database schema and register your first administrator account cleanly using the built-in TypeScript CLI.

### 1. Initialize Schema & User Accounts

Run the interactive admin command launcher located in the root directory:

```bash
./scps-cli users
```

This initializes the SQLite database file `stuco.db` with the core relational tables (`students`, `accounts`, `transactions`), creates the necessary indexes, and walks you through registering your primary administrator account safely with cryptographically secure hashing.

### 2. Verify Tables

Verify that the tables were created successfully using the SQLite shell:

```bash
sqlite3 stuco.db ".tables"
```

The output should show all core tables as well as the Better Auth system tables (`user`, `session`, `account`, `verification`).

### 3. Optional: Run Database Migrations

If you are upgrading an existing system, migrations are located in the `migrations/` folder and can be applied using the migration script:

```bash
./scripts/run_migration.sh migrate_cascade_delete.sql
```

See [Database Guide](database.md) for more details.

## Web UI Setup

### Local Development (Mac/Linux)

For normal development on your Mac:

1. Install dependencies:

   ```bash
   ./scripts/web-next-setup.sh
   ```

2. Create `web-next/.env.local` from the sample:

   ```bash
   cp web-next/.env.local.example web-next/.env.local
   ```

3. Start the app:

   ```bash
   cd web-next
   pnpm dev
   ```

This local flow stays separate from the VPS. You develop on your Mac, push to GitHub, then deploy on the VPS with `./scripts/deploy-vps.sh`.

### Automated Setup (Debian VPS Recommended)

For a Debian web server or VPS:

```bash
./scripts/setup-debian.sh
```

This script:
- installs system packages and Node.js 20 if needed
- creates the root Python venv
- installs `pnpm` dependencies in `web-next`
- creates `web-next/.env.local` from the sample if missing
- builds the production app
- installs and starts `stuco-web.service`

After the script finishes:

1. Edit `web-next/.env.local`
2. Restart the web service:

   ```bash
   sudo systemctl restart stuco-web
   ```

3. Configure encrypted R2 backups:

   ```bash
   ./scripts/setup-r2-crypt.sh
   ```
### Manual / Existing Setup

1. **Navigate to Web UI**:

   ```bash
   cd web-next
   ```

2. **Check Prerequisites** (optional):

   ```bash
   ../scripts/web-next-check-prereqs.sh
   ```

3. **Install Dependencies**:

   ```bash
   pnpm install
   ```

   - Automatically runs postinstall to rebuild `better-sqlite3` native bindings.
   - Handles platform-specific compilation for ARM64 and x86_64 Linux.

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
   
   Create your first account at `/signup` with the 8 digit code.

### Legacy Manual Setup

If automated setup fails:

```bash
../scripts/web-next-setup.sh  # Runs pnpm install + manual better-sqlite3 build
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

We provide a unified TypeScript CLI to handle server administration tasks.

### Local CLI Execution (on the VPS)
No Python environment or local database configuration is needed to run the CLI on the server, as it integrates directly with the Next.js runtime.

1.  Make sure the script is executable:
    ```bash
    chmod +x scps-cli
    ```
2.  Boot the interactive administration console:
    ```bash
    ./scps-cli
    ```

### Remote Secure CLI Execution (from your Local Machine)
To manage the remote production VPS database securely from your local developer machine without SSHing manually:
1.  Configure your remote VPS parameters in your local `web-next/.env.local` file (see [Deployment Guide](deployment.md#remote-management) for options).
2.  Launch the secure terminal tunnel:
    ```bash
    ./scps-remote-cli
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

### CLI Ledger adjustments (Top-up / Debit)

```bash
./scps-cli ledger
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

1. Run `./scripts/web-next-check-prereqs.sh`.
2. Reinstall: `cd web-next && rm -rf node_modules && pnpm install`.
3. Approve builds: `cd web-next && pnpm approve-builds better-sqlite3`.
4. Manual: `./scripts/web-next-setup.sh`.

### Raspberry Pi Compilation Slow/Out of Memory

- Increase swap (see prerequisites).
- Pre-build on another Linux machine and copy `node_modules/better-sqlite3`.

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

**Last updated: November 22, 2025**
