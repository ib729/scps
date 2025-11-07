# Stuco Snack Bar Management System

A closed-loop, reloadable card system for school snack bars with NFC card support and web-based management.

## What It Is

- **Closed-loop card system**: Cards hold only an ID; all balances live in SQLite on a Raspberry Pi
- **PN532 NFC reader**: 13.56 MHz ISO/IEC 14443 cards for secure, contactless payments
- **Web UI**: Modern Next.js interface for POS, top-ups, student management, and reports
- **Python scripts**: CLI tools for enrollment, top-ups, and sales (can run alongside web UI)

## Components

### 1. Database (`stuco.db`)
- SQLite with WAL mode for concurrent access
- Tables: students, cards, accounts, transactions, overdraft_weeks
- Shared by both Python scripts and web UI

### 2. Python Scripts
- `enroll.py`: Register new students and link cards
- `topup.py`: Add funds to student accounts
- `pos.py`: Process purchases via CLI (legacy, web UI recommended)
- `tap-broadcaster.py`: **NEW** - Broadcast NFC taps to web UI in real-time
- `init_db.py`: Initialize database schema

### 3. Web UI (`web-next/`)
- **Next.js 16** with TypeScript and Shadcn UI
- **Real-time NFC integration** via Server-Sent Events
- Dashboard, POS, top-up, student management, transaction history
- Tap card → auto-select student workflow
- See `web-next/README.md` for details

## Quick Start

### For Development (macOS/Linux)

```bash
# 1. Check web UI prerequisites (optional)
cd web-next
./check-prereqs.sh

# 2. Initialize database
cd ..
python init_db.py

# 3. Enroll a student
python enroll.py

# 4. Install web UI dependencies (auto-builds better-sqlite3)
cd web-next
pnpm install

# 5. Start web UI
pnpm dev

# 6. Test NFC tap broadcaster (simulation)
cd ..
python tap-broadcaster.py --simulate
```

Open http://localhost:3000 and start managing your snack bar!

### For Production (Raspberry Pi)

**Prerequisites (Raspberry Pi OS - Debian Trixie/Bookworm ARM64):**

```bash
# Install build tools
sudo apt update
sudo apt install -y build-essential python3 pkg-config git

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm
```

**Then follow the same steps as development setup above.**

See `NFC-SETUP.md` for complete setup instructions including systemd service configuration.

## Features

- ✅ Card-based payments with overdraft support (¥20/week default)
- ✅ Real-time tap detection and student auto-selection (POS only)
- ✅ Dual POS workflow: tap card or manual selection
- ✅ Transaction history and balance tracking
- ✅ Multi-card support per student (active/revoked status)
- ✅ Manual balance adjustments with audit trail
- ✅ Staff attribution for all transactions
- ✅ UTC timestamps with Asia/Shanghai display
- ✅ WAL mode for concurrent web + CLI access

## Hardware

- **Raspberry Pi 4B** (or Zero/Zero 2 W)
- **PN532 NFC reader** (UART or USB-serial)
- **13.56 MHz ISO 14443-A cards** with fixed UID

### Security Notes

- **Current setup**: Fixed UID cards (budget-friendly, good for school use)
- **Avoid**: 125 kHz ID cards and MIFARE Classic (cloning risk)
- **Upgrade path**: MIFARE DESFire EV2/EV3 for AES auth and EAL5+ security

## Tech Stack

- **Backend**: Python 3.9+ with nfcpy, Flask (legacy web), requests
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, Shadcn UI
- **Database**: SQLite with WAL mode
- **NFC**: PN532 reader via nfcpy (13.56 MHz)
- **Real-time**: Server-Sent Events (SSE) for tap broadcasting

## Documentation

- `README.md` (this file): Project overview
- `web-next/README.md`: Web UI setup and features
- `NFC-SETUP.md`: NFC tap integration quick start guide
- `schema.sql`: Database schema reference
- `web-next/DATABASE_CONNECTION.md`: Database architecture notes
- `web-next/IMPLEMENTATION_SUMMARY.md`: Web UI implementation details

## File Structure

```
stuco/
├── stuco.db              # SQLite database (shared)
├── schema.sql            # Database schema
├── init_db.py            # Initialize database
├── enroll.py             # Enroll students and cards
├── topup.py              # Add funds to accounts
├── pos.py                # CLI POS (legacy)
├── tap-broadcaster.py    # NFC tap broadcaster (NEW)
├── tap-broadcaster.service  # Systemd service file
├── requirements.txt      # Python dependencies
├── NFC-SETUP.md          # NFC setup guide
├── web/                  # Legacy Flask web UI
└── web-next/             # Modern Next.js web UI
    ├── app/              # Next.js pages and API routes
    ├── components/       # React components
    ├── lib/              # Database and business logic
    └── README.md         # Web UI documentation
```

## Usage Examples

### Enroll a Student
```bash
python enroll.py
# Follow prompts to enter name and scan card
```

### Top-up via Web UI
1. Open http://localhost:3000/topup
2. Select student from dropdown
3. Enter amount and confirm

### Process a Sale (Tap-First)
1. Open http://localhost:3000/pos
2. Student taps card → auto-selects
3. Staff enters amount (e.g., ¥6)
4. Click "Charge ¥6"

### View Transactions
- Dashboard: Recent transactions
- Students → [Name]: Per-student history
- Transactions page: All transactions with filters

## Development

```bash
# Python environment
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Web UI (see web-next/README.md)
cd web-next

# Check prerequisites (optional)
./check-prereqs.sh

# Install and auto-build
pnpm install

# Start development
pnpm dev
```

**Note:** `pnpm install` now automatically rebuilds better-sqlite3 via the postinstall hook.

## License

See `LICENSE` file.

## Credits

Built for the Student Council Snack Bar management system.
