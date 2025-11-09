# Stuco Web UI

The modern Next.js interface for the Stuco Snack Bar system. For full setup and details, see the [root README](../README.md) and [docs/development.md](../docs/development.md).

## Quick Overview

- **Features**: Dashboard, student management, POS (NFC taps/manual), top-up, transactions, card handling.
- **Tech**: Next.js 16, TypeScript, Tailwind, Shadcn UI, better-sqlite3.
- **NFC**: Real-time taps for POS (see [NFC Setup](../docs/nfc-setup.md)).

## Setup

Follow [Getting Started](../docs/getting-started.md) in root docs.

1. `pnpm install` (auto-builds deps).
2. Set `.env.local`:
   ```
   DATABASE_PATH=/path/to/stuco.db  # Absolute path
   NFC_TAP_SECRET=your-secret
   ```
3. `pnpm dev` → http://localhost:3000.

## Build

`pnpm build && pnpm start` for production.

## Structure

See [Development Guide](../docs/development.md) for layers (actions, repositories, pages).

This is early development; changes ongoing. See [Change Log](../docs/changelog.md).
