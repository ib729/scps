# Stuco Snack Bar Web UI

A modern web interface for managing the Student Council Snack Bar system built with Next.js, TypeScript, and Shadcn UI.

## Features

- **Dashboard**: Overview of students, balances, and recent transactions
- **Student Management**: Create, update, and delete student accounts
- **Transaction History**: View and manage all transactions
- **Point of Sale (POS)**: Process purchases and debit accounts with overdraft support
- **Top-up**: Add funds to student accounts
- **Card Management**: Register and manage student cards
- **Account Settings**: Configure overdraft limits and balances

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

The `.env.local` file should already be set up with:

```
DATABASE_PATH=/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/stuco.db
```

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
- Select student
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

## Contributing

This is an internal project for the Student Council Snack Bar management system.

## License

Refer to the main project license at `/Users/ivanbelousov/Documents/5 - Code /Projects/stuco/LICENSE`
