# Quick Start Guide

## Getting Started

### Automated Setup (Recommended)

1. **Check Prerequisites** (macOS/Linux)

```bash
cd web-next
./check-prereqs.sh
```

Ensure you have Xcode CLT (macOS) or build-essential (Linux).

2. **Install Dependencies** (auto-builds better-sqlite3)

```bash
pnpm install
```

The postinstall script automatically rebuilds better-sqlite3 for your platform.

3. **Test Database Connection** (Optional)

```bash
node test-db.js
```

4. **Start Development Server**

```bash
pnpm dev
```

5. **Open in Browser**

Navigate to [http://localhost:3000](http://localhost:3000)

### Legacy Setup (Old Method)

If you prefer the old manual approach:

```bash
./setup.sh
```

This runs `pnpm install` + manual better-sqlite3 build. The new automated method is preferred.

## Common Tasks

### Adding a New Student

1. Go to Students page
2. Click "Add Student" button
3. Enter student name
4. Click "Create Student"

### Processing a Sale (POS)

1. Go to POS page
2. Select student from dropdown
3. Enter amount
4. Add optional description and staff name
5. Click "Charge" button

### Top-up a Student Account

1. Go to Top-up page
2. Select student
3. Enter amount to add
4. Add optional description
5. Click "Add" button

### View Student Details

1. Go to Students page
2. Click on student name or "View" button
3. See full details, cards, and transaction history

### Manage Cards

1. Go to student detail page
2. Click "Add Card" in Cards section
3. Enter card UID
4. Cards can be activated/revoked or deleted

## Key Features

- **Dashboard**: Quick overview of system stats
- **Students**: Full CRUD for student management
- **Transactions**: Complete transaction history with filters
- **POS**: Point of sale with overdraft support
- **Top-up**: Add funds or make manual adjustments
- **Cards**: Manage student RFID/NFC cards

## Default Settings

- New students start with ¥0 balance
- Default overdraft limit: ¥20/week
- All transactions are tracked with timestamps
- Balances update automatically with transactions

## Tips

- Use the search bar to quickly find students
- Filter transactions by type (TOPUP, DEBIT, ADJUST)
- Check dashboard for low balance warnings
- Transactions can be deleted if needed (balance adjusts automatically)
- Use manual adjustment for corrections with detailed reasons

## Troubleshooting

### "Could not locate the bindings file" Error

The `postinstall` script should prevent this. If it still occurs:

1. **Check prerequisites**: `./check-prereqs.sh`
2. **Approve build scripts**: `pnpm approve-builds better-sqlite3`
3. **Rebuild**: `pnpm rebuild better-sqlite3`
4. **Last resort**: Run `./setup.sh` (legacy method)

See `PREREQUISITES.md` for platform-specific troubleshooting.

### Other Issues

```bash
# Clear Next.js cache
rm -rf .next

# Verify database connection
node test-db.js

# Reinstall everything
rm -rf node_modules
pnpm install
```

## Production Build

```bash
pnpm build
pnpm start
```

The app will run on port 3000 by default.

