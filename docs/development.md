# Development Guide

This guide is for developers extending or maintaining the Stuco system. Covers architecture, tech stack, structure, and workflows.

## Tech Stack

### Backend/Database

- **Language**: Python 3.9+ (CLI tools).
- **Database**: SQLite 3 with WAL mode for concurrency.
- **ORM/Access**: Raw `sqlite3` (CLI), `better-sqlite3` (Node.js).
- **Dependencies**: nfcpy (NFC), requests (API calls).
- See `requirements.txt`.

### Web UI

- **Framework**: Next.js 16 (App Router).
- **Language**: TypeScript 5+.
- **Styling**: Tailwind CSS 4, Shadcn UI (neutral theme, no gradients).
- **Forms/Validation**: React Hook Form, Zod.
- **Database**: better-sqlite3 (native bindings auto-built).
- **Real-time**: Server-Sent Events (SSE) for NFC taps.
- **Notifications**: Sonner (toasts).
- **Animation**: Motion (Framer Motion), animate-ui.
- **3D/Graphics**: Three.js for background effects.
- **Charts**: Recharts for analytics visualization.
- **Theming**: next-themes for dark mode support.
- See `web-next/package.json`.

### NFC

- **Library**: nfcpy (Python) for PN532.
- **Protocol**: HTTP POST + SSE.
- **Hardware**: PN532 over UART/USB/I2C.

## Architecture

### Overall

```
CLI Tools (Python) ↔ stuco.db (SQLite) ↔ Web UI (Next.js)
                           │
                      NFC Reader ─ tap-broadcaster.py ─ API
```

- **Shared DB**: All components access the same SQLite file.
- **NFC Flow**: Hardware → Python broadcaster → Next.js API → SSE → UI.
- **Server Actions**: Mutations in web UI use Next.js actions (atomic, typed).

### Web UI Layers

1. **Database Layer** (`lib/`):
   - `db.ts`: Connection with foreign_keys ON.
   - `models.ts`: Zod schemas for entities (Student, Transaction, etc.).
   - `repositories/`: Typed CRUD (students.ts, cards.ts, etc.).
   - `currency.ts`: Decimal conversion (tenths).

2. **Server Actions** (`app/actions/`):
   - `students.ts`: CRUD for students.
   - `pos.ts`: Charge with overdraft logic.
   - `topup.ts`: Add/adjust funds.
   - All: Zod validation, error handling, revalidation.

3. **Pages** (`app/`):
   - `/dashboard`: Stats, recent tx.
   - `/students` / `[id]`: List/detail.
   - `/transactions`: History with filters.
   - `/pos`: Sales (Tap/Manual modes).
   - `/topup`: Funds (manual).

4. **Components**:
   - UI: Shadcn (button, table, dialog, drawer, sheet, etc.).
   - Custom: PosForm, TapAlert (toasts), Nav, WeeklyTopupChart.
   - Animation: FlipWords, EncryptedText.
   - Backgrounds: HoleBackground, Fireworks, GravityStars (animate-ui).
   - See [UI Components Guide](ui-components.md) for details.

5. **API Routes** (`app/api/nfc/`):
   - `/tap`: POST from broadcaster.
   - `/stream`: SSE for taps.

**Rendering**: Dynamic (`force-dynamic`) for DB pages.

## Project Structure

### Root

```
stuco/
├── stuco.db
├── schema.sql
├── init_db.py
├── pos.py          # CLI POS
├── topup.py        # CLI top-up
├── enroll.py       # CLI enroll
├── tap-broadcaster.py  # NFC broadcaster
├── requirements.txt
└── docs/
```

### Web UI (web-next/)

```
web-next/
├── app/
│   ├── actions/     # Server actions
│   ├── api/nfc/     # NFC endpoints
│   ├── dashboard/   # Page
│   ├── students/    # Pages + [id]
│   ├── pos/         # Page + form
│   ├── topup/       # Page + form
│   ├── transactions/ # Page
│   └── layout.tsx   # Root layout + Toaster
├── components/
│   ├── ui/          # Shadcn components
│   └── tap-alert.tsx # Global NFC toast
├── lib/
│   ├── db.ts
│   ├── models.ts
│   ├── currency.ts
│   └── repositories/ # DB access
├── public/          # Static assets
├── .env.local       # DATABASE_PATH, NFC_TAP_SECRET
├── next.config.js
├── package.json     # Scripts: dev, build, lint
└── tailwind.config.js
```

## Setup for Development

See [Getting Started](../getting-started.md).

**Web UI Specific**:

1. `cd web-next && pnpm install` (auto-builds better-sqlite3).
2. Set `.env.local`: `DATABASE_PATH=/absolute/path/to/stuco.db`.
3. `pnpm dev` (port 3000).
4. Edit: Hot reload.

**CLI**:

1. `.venv` activate, `pip install -r requirements.txt`.
2. `python pos.py --simulate`.

**NFC Testing**:

`python tap-broadcaster.py --simulate` + open POS.

## Building and Deployment

### Web UI

**Development**:

```bash
pnpm dev  # http://localhost:3000
```

**Production Build**:

```bash
pnpm build  # Optimizes, checks types
pnpm start  # Runs on 3000
```

- **Env**: Set `NODE_ENV=production`.
- **HTTPS**: Use reverse proxy (nginx) for SSL.
- **Raspberry Pi**: Run as service (systemd, PM2).

**Lint/Type Check**:

```bash
pnpm lint
pnpm build  # Includes TS check
```

### CLI/NFC

- Scripts run directly: `python pos.py`.
- Broadcaster: Systemd service (see NFC Setup).

## Extending the System

### Adding Features

1. **New DB Table**:
   - Update `schema.sql`, run init or migration.
   - Add Zod model in `models.ts`.
   - Create repository in `lib/repositories/`.
   - Add action in `app/actions/`.

2. **New Page**:
   - Create `app/new-feature/page.tsx`.
   - Add nav link in `components/nav.tsx`.
   - Use repositories/actions for data.

3. **NFC Enhancement**:
   - Extend `/api/nfc/tap` handler.
   - Update SSE in `/stream`.

### Testing

- **Manual**: Create student, tap, charge, top-up.
- **DB**: `sqlite3 stuco.db` queries.
- **UI**: Browser dev tools, test-db.js.
- **NFC**: Simulate taps, check logs.

**Edge Cases**:
- Overdraft limits.
- Unenrolled cards.
- Concurrent access (web + CLI).
- Decimal amounts.

### Best Practices

- **Type Safety**: Use Zod for all inputs, define schemas in `lib/models.ts`.
- **Validation**: Server-side always, client-side for UX.
- **Errors**: User-friendly messages with actionable suggestions.
- **Dynamic Rendering**: For DB pages (`export const dynamic = 'force-dynamic'`).
- **Revalidation**: After mutations (`revalidatePath`).
- **Currency**: Use helpers in `lib/currency.ts` for tenths conversion.
- **Components**: Prefer Shadcn UI components for consistency.
- **Styling**: Use Tailwind utilities, avoid inline styles.
- **Accessibility**: Use semantic HTML, ARIA labels, keyboard navigation.

### Coding Conventions

- **File Organization**: Group by feature (pages, actions, components).
- **Naming**: camelCase for functions, PascalCase for components.
- **Exports**: Named exports for utilities, default for pages/components.
- **Comments**: Explain "why", not "what" (code should be self-documenting).
- **Error Handling**: Always catch and handle errors gracefully.
- **Database**: Use repositories for all DB access, never raw queries in pages.

## Potential Enhancements

From implementation notes:
- Authentication (users table ready).
- Reports/Exports (CSV/PDF).
- Bulk operations.
- Analytics charts.
- Audit logs.
- Dark mode toggle.

See [Changelog](changelog.md) for recent changes.

## Additional Resources

- [UI Components Guide](ui-components.md) - Custom components and animations
- [Deployment Guide](deployment.md) - Production setup
- [Security Guide](security.md) - Security best practices
- [Scripts Reference](scripts.md) - Utility scripts documentation

**Last updated: November 11, 2025**
