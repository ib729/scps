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
- **Runtime**: React 19.2.0.
- **Styling**: Tailwind CSS 4, Radix UI components (via Shadcn).
- **Forms/Validation**: React Hook Form, Zod.
- **Authentication**: Better Auth with email/password support.
- **Database**: better-sqlite3 (native bindings auto-built).
- **Real-time**: WebSocket + Server-Sent Events (SSE) for NFC taps.
- **Custom Server**: Node.js HTTP server with WebSocket support (server.js).
- **Notifications**: Sonner (toasts).
- **Animation**: Motion (Framer Motion), animate-ui.
- **3D/Graphics**: Three.js for background effects.
- **Charts**: Recharts for analytics visualization.
- **Theming**: next-themes for dark mode support (already implemented).
- **Icons**: Lucide React.
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
                      NFC Reader ─ tap-broadcaster.py ─ WebSocket/API ─ UI
```

- **Shared DB**: All components access the same SQLite file.
- **NFC Flow**: Hardware → Python broadcaster → Next.js WebSocket/API → Real-time UI updates.
- **Authentication**: Better Auth with session-based authentication (protected routes).
- **Server Actions**: Mutations in web UI use Next.js actions (atomic, typed).
- **Custom Server**: server.js handles WebSocket connections alongside Next.js.

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
   - `/` (root): Redirects to /dashboard or /login based on auth.
   - `/login`, `/signup`: Authentication pages.
   - `/dashboard`: Stats, recent transactions, charts.
   - `/students` / `[id]`: List/detail with cards and transaction history.
   - `/transactions`: Full transaction history with filters.
   - `/pos`: Point of sale (Tap/Manual modes).
   - `/topup`: Add funds (manual entry).

4. **Components**:
   - UI: Radix UI via Shadcn (button, table, dialog, drawer, sheet, sidebar, etc.).
   - Layout: AppSidebar, PageHeader, ThemeProvider.
   - Custom: PosForm, TopupForm, TapAlert (toasts), WeeklyTopupChart.
   - Animation: FlipWords, EncryptedText.
   - Backgrounds: HoleBackground, Fireworks, GravityStars (animate-ui).
   - See [UI Components Guide](ui-components.md) for details.

5. **API Routes** (`app/api/`):
   - `/auth/[...all]`: Better Auth authentication endpoints.
   - `/nfc/tap`: POST endpoint for NFC tap events from broadcaster.
   - **WebSocket**: Handled by custom server.js for real-time NFC events.

**Rendering**: Dynamic (`force-dynamic`) for DB pages.

## Project Structure

### Root

```
stuco/
├── stuco.db                # SQLite database
├── init_db.py              # Database initialization
├── pos.py                  # CLI POS
├── topup.py                # CLI top-up
├── enroll.py               # CLI enroll
├── tap-broadcaster.py      # NFC broadcaster (WebSocket client)
├── requirements.txt        # Python dependencies
├── migrations/
│   └── schema.sql          # Main database schema
└── docs/                   # Documentation
```

### Web UI (web-next/)

```
web-next/
├── app/
│   ├── (app)/           # Protected routes with layout
│   │   ├── dashboard/
│   │   ├── students/    # + [id] detail pages
│   │   ├── pos/
│   │   ├── topup/
│   │   ├── transactions/
│   │   └── layout.tsx   # Auth-protected layout with sidebar
│   ├── (auth)/          # Public auth routes
│   │   ├── login/
│   │   └── signup/
│   ├── actions/         # Server actions
│   ├── api/
│   │   ├── auth/        # Better Auth endpoints
│   │   └── nfc/         # NFC endpoints
│   ├── layout.tsx       # Root layout with ThemeProvider
│   ├── page.tsx         # Home (redirects)
│   └── sitemap.ts       # SEO sitemap
├── components/
│   ├── ui/              # Radix UI components (via Shadcn)
│   ├── animate-ui/      # Custom animations
│   ├── app-sidebar.tsx  # Navigation sidebar
│   ├── page-header.tsx
│   ├── tap-alert.tsx    # Global NFC toast
│   └── theme-provider.tsx
├── lib/
│   ├── auth.ts          # Better Auth config
│   ├── auth-client.ts   # Client-side auth
│   ├── db.ts            # Database connection
│   ├── models.ts        # Zod schemas
│   ├── currency.ts      # Currency helpers
│   ├── use-nfc-websocket.ts
│   └── repositories/    # Typed DB access
├── public/
│   └── robots.txt       # SEO configuration
├── Dockerfile           # Production container
├── server.js            # Custom Node server with WebSocket
├── next.config.ts       # Next.js configuration
└── package.json         # Dependencies and scripts
```

## Setup for Development

See [Getting Started](../getting-started.md).

**Web UI Specific**:

1. `cd web-next && pnpm install` (auto-builds better-sqlite3).
2. Create `.env.local` with required variables:
   ```bash
   DATABASE_PATH=/absolute/path/to/stuco.db
   BETTER_AUTH_SECRET=your-secret-key-here
   BETTER_AUTH_URL=http://localhost:3000
   NEXT_PUBLIC_APP_URL=https://scps.ivanbelousov.com
   NFC_TAP_SECRET=your-nfc-secret-here
   ```
3. Run auth migrations: `sqlite3 ../stuco.db < migrations/better_auth_schema.sql`
4. `pnpm dev` (starts custom server on port 3000 with WebSocket support).
5. Edit: Hot reload enabled.

**CLI**:

1. `.venv` activate, `pip install -r requirements.txt`.
2. `python pos.py --simulate`.

**NFC Testing**:

`python tap-broadcaster.py --simulate` + open POS.

## Building and Deployment

### Web UI

**Development**:

```bash
pnpm dev  # Runs custom server.js with WebSocket on http://localhost:3000
```

**Production Build**:

```bash
pnpm build   # Optimizes, checks types, creates standalone output
pnpm start   # Runs production server with WebSocket on port 3000
```

**Docker**:

```bash
docker build -t stuco-web .
docker run -p 3000:3000 -v /path/to/stuco.db:/app/stuco.db stuco-web
```

- **Env**: Set `NODE_ENV=production`.
- **HTTPS**: Use Cloudflare Tunnel or reverse proxy (nginx) for SSL.
- **Raspberry Pi**: Run as systemd service or via Docker.

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
   - Update `migrations/schema.sql`, run init or migration.
   - Add Zod model in `models.ts`.
   - Create repository in `lib/repositories/`.
   - Add action in `app/actions/`.

2. **New Page**:
   - Create `app/new-feature/page.tsx`.
   - Add nav link in `components/nav.tsx`.
   - Use repositories/actions for data.

3. **NFC Enhancement**:
   - Extend `/api/nfc/tap` handler.
   - Update WebSocket handlers in `server.js`.
   - Modify client WebSocket hook in `lib/use-nfc-websocket.ts`.

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

## Implemented Features

- ✅ Authentication with Better Auth (email/password, session management)
- ✅ Dark mode support (system/light/dark themes)
- ✅ Analytics charts (weekly top-up visualization)
- ✅ Real-time NFC updates via WebSocket
- ✅ Responsive UI with sidebar navigation
- ✅ SEO optimization (robots.txt, sitemap, metadata)

## Potential Enhancements

- Microsoft OAuth integration (configured but not enabled)
- Reports/Exports (CSV/PDF)
- Bulk operations (import students, bulk top-ups)
- Advanced analytics dashboards
- Audit logs and activity tracking
- Student accounts & self-served top-ups


See [Changelog](changelog.md) for recent changes.

## Additional Resources

- [UI Components Guide](ui-components.md) - Custom components and animations
- [Deployment Guide](deployment.md) - Production setup
- [Security Guide](security.md) - Security best practices
- [Scripts Reference](scripts.md) - Utility scripts documentation

**Last updated: November 12, 2025**
