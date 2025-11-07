# Quick Start Guide

## Getting Started

1. **Run the Setup Script**

```bash
cd web-next
./setup.sh
```

This will:
- Install all dependencies
- Build better-sqlite3 native bindings
- Verify the setup

2. **Test Database Connection** (Optional)

```bash
node test-db.js
```

3. **Start Development Server**

```bash
pnpm dev
```

4. **Open in Browser**

Navigate to [http://localhost:3000](http://localhost:3000)

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

If you see this error, manually build better-sqlite3:

```bash
cd node_modules/.pnpm/better-sqlite3@12.4.1/node_modules/better-sqlite3
npm run build-release
cd ../../../../..
```

Or simply run the setup script again:

```bash
./setup.sh
```

### Other Issues

```bash
# Clear Next.js cache
rm -rf .next

# Verify database connection
node test-db.js

# Reinstall everything
rm -rf node_modules
./setup.sh
```

## Production Build

```bash
pnpm build
pnpm start
```

The app will run on port 3000 by default.

