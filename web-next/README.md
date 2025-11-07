# Stuco Snack Bar Web UI

A modern web interface for managing the Student Council Snack Bar system built with Next.js, TypeScript, and Shadcn UI.

## Features

- **Dashboard**: Overview of students, balances, and recent transactions
- **Student Management**: Create, update, and delete student accounts
- **Transaction History**: View and manage all transactions
- **Point of Sale (POS)**: Process purchases with **NFC card tap support** and overdraft enforcement
- **Top-up**: Add funds to student accounts (manual selection only)
- **Card Management**: Register and manage student cards
- **Account Settings**: Configure overdraft limits and balances
- **Real-time NFC Integration**: Tap card → auto-select student workflow

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **Shadcn UI** (Neutral theme, no purple/blue gradients)
- **better-sqlite3** for database access
- **Zod** for validation
- **React Hook Form** for form handling

## Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- SQLite database at `/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db`

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Build better-sqlite3 native bindings:

```bash
cd node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
npm run build-release
cd ../../../../..
```

3. Configure environment variables:

Create or update `.env.local`:

```bash
DATABASE_PATH=/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db
NFC_TAP_SECRET=your-secret-here-change-this
```

**Important**: Set a strong secret for NFC tap authentication if deploying to production.

4. Run the development server:

```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Build for Production

```bash
pnpm build
pnpm start
```

## Project Structure

```
web-next/
├── app/
│   ├── actions/          # Server actions for CRUD operations
│   │   ├── students.ts
│   │   ├── cards.ts
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── pos.ts
│   │   └── topup.ts
│   ├── dashboard/        # Dashboard page
│   ├── students/         # Student management pages
│   │   └── [id]/        # Individual student detail page
│   ├── transactions/     # Transactions page
│   ├── pos/             # Point of Sale page
│   ├── topup/           # Top-up page
│   └── layout.tsx       # Root layout with navigation
├── components/
│   ├── ui/              # Shadcn UI components
│   └── nav.tsx          # Navigation component
├── lib/
│   ├── db.ts            # Database connection
│   ├── models.ts        # Zod schemas and TypeScript types
│   └── repositories/    # Database access layer
│       ├── students.ts
│       ├── cards.ts
│       ├── accounts.ts
│       ├── transactions.ts
│       └── overdraft.ts
└── README.md
```

## Database Schema

The application connects to the existing SQLite database with the following tables:

- **students**: Student records
- **cards**: RFID/NFC cards linked to students
- **accounts**: Student account balances and overdraft limits
- **transactions**: All financial transactions (TOPUP, DEBIT, ADJUST)
- **overdraft_weeks**: Weekly overdraft tracking

## Features in Detail

### Dashboard
- Total students count
- Total system balance
- Students in overdraft
- Recent transactions
- Quick actions
- Low balance warnings

### Student Management
- List all students with search
- Create new students (auto-creates account)
- View student details
- Update student information
- Delete students (cascades to related data)
- Manage student cards
- View transaction history per student

### Transactions
- View all transactions
- Filter by type (TOPUP, DEBIT, ADJUST)
- Search by student name
- Delete transactions (adjusts balance accordingly)

### POS (Point of Sale)
- **Tap Card mode**: Student taps card → staff enters amount → charge (uses NFC)
- **Manual mode**: Staff selects student from dropdown → enters amount → charge
- Real-time card detection via Server-Sent Events (SSE) in tap mode
- View current balance and overdraft limit
- Enter purchase amount and description
- Automatic overdraft calculation
- Overdraft limit enforcement
- Staff tracking

### Top-up
- Add funds to student accounts
- Manual balance adjustments (positive or negative)
- Reason tracking for adjustments
- Staff tracking

### Card Management
- Register new cards for students
- View card status (active/revoked)
- Revoke or reactivate cards
- Delete cards

## Design Principles

- **Clean & Minimal**: Professional interface with neutral color palette
- **No Purple/Blue Gradients**: Follows requirement for neutral aesthetics
- **Responsive**: Works on desktop and tablet devices
- **Accessible**: Uses semantic HTML and ARIA labels
- **Type-Safe**: Full TypeScript coverage with Zod validation

## Development

### Linting

```bash
pnpm lint
```

### Type Checking

```bash
pnpm build
```

## Troubleshooting

### Database Connection Issues

Ensure the `DATABASE_PATH` in `.env.local` points to the correct SQLite database file.

### better-sqlite3 Build Errors

If you encounter "Could not locate the bindings file" error, manually build better-sqlite3:

```bash
cd node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
npm run build-release
cd ../../../../..
```

**Note**: pnpm's security settings may block build scripts. The manual build above ensures the native bindings are compiled for your platform.

### Port Already in Use

If port 3000 is taken, specify a different port:

```bash
pnpm dev -- -p 3001
```

## NFC Card Tap Integration

The web UI supports real-time NFC card tap detection for **POS workflows only**. Top-ups use manual student selection.

### Architecture

1. **Tap Broadcaster** (Python): Runs on the Raspberry Pi, reads NFC card taps from the PN532 reader
2. **Next.js API** (`/api/nfc/tap`): Receives tap events via HTTP POST
3. **SSE Stream** (`/api/nfc/stream`): Broadcasts tap events to connected browser clients
4. **POS UI**: Listens for tap events in "Tap Card" mode and auto-selects students
5. **Global Alert**: Shows a "Go to POS" prompt when cards are tapped on other pages

### Setup NFC Tap Broadcaster

1. Install dependencies on the Raspberry Pi:

```bash
cd /path/to/stuco
source .venv/bin/activate
pip install -r requirements.txt
```

2. Configure environment variables:

```bash
export NEXTJS_URL=http://localhost:3000
export NFC_TAP_SECRET=your-secret-here
export POS_LANE_ID=default
```

3. Test the broadcaster:

```bash
# Simulate mode (no hardware required)
python tap-broadcaster.py --simulate

# Hardware mode
python tap-broadcaster.py --device tty:AMA0:pn532

# Single test tap
python tap-broadcaster.py --test
```

### Running as a System Service (Raspberry Pi)

1. Copy the service file:

```bash
sudo cp tap-broadcaster.service /etc/systemd/system/
```

2. Edit the service file with your paths and secrets:

```bash
sudo nano /etc/systemd/system/tap-broadcaster.service
```

3. Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable tap-broadcaster
sudo systemctl start tap-broadcaster
```

4. Check status:

```bash
sudo systemctl status tap-broadcaster
journalctl -u tap-broadcaster -f
```

### API Endpoints

#### POST /api/nfc/tap
Receives card tap events from the broadcaster.

**Request:**
```json
{
  "card_uid": "DEADBEEF",
  "lane": "default",
  "reader_ts": "2025-01-01T12:00:00Z",
  "secret": "your-secret-here"
}
```

**Response:**
```json
{
  "success": true,
  "listeners": 2
}
```

#### GET /api/nfc/stream
Server-Sent Events stream for real-time tap notifications.

**Query params:**
- `lane` (optional): Filter events by POS lane ID

**Events:**
```
data: {"type":"connected","lane":"default"}
data: {"card_uid":"DEADBEEF","lane":"default","timestamp":"..."}
data: {"type":"keepalive"}
```

### Workflows

#### Tap Card Mode (POS only)
1. Student taps card on reader
2. Browser receives tap event via SSE
3. UI auto-selects the student
4. Staff enters amount and confirms
5. Transaction created with card UID logged

#### Manual Mode (POS)
1. Staff selects student from dropdown
2. Staff enters amount and confirms
3. Transaction created (no card UID)

#### Top-up (Manual Only)
1. Staff selects student from dropdown
2. Staff enters amount and confirms
3. No NFC tap support for top-ups

### Security

- **Authentication**: Shared secret (`NFC_TAP_SECRET`) validates tap broadcasts
- **HTTPS**: Use HTTPS in production to encrypt tap events
- **Rate limiting**: Consider adding rate limits to `/api/nfc/tap` endpoint
- **Lane isolation**: Multiple POS stations can use different lane IDs

### Troubleshooting

**"Disconnected from reader" in browser:**
- Check that `pnpm dev` is running
- Verify the SSE endpoint is accessible: `curl http://localhost:3000/api/nfc/stream`

**Tap events not reaching browser:**
- Check tap-broadcaster is running: `systemctl status tap-broadcaster`
- Test broadcaster: `python tap-broadcaster.py --test`
- Check Next.js logs for POST requests to `/api/nfc/tap`

**Card not recognized:**
- Ensure the card is enrolled in the database (see students → add card)
- Check card status is "active" not "revoked"

## Contributing

This is an internal project for the Student Council Snack Bar management system.

## License

Refer to the main project license at `/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/LICENSE`
