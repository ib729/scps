# Change Log

## 2026-11-15

### Payment review
- Keep the mounted administrator queue polling when empty; resolved history shows the newest decisions regardless of status, while pending claims retain priority.

### Toolchain
- Pin Node 26.13.1, pnpm 12.21.0 and current stable direct dependencies; use the installed `auth` CLI. Python reader dependencies require Python 3.11 or newer.
- TypeScript 7 checks the application; ESLint compiler-API consumers resolve isolated TypeScript 6.0.3. Workspace policy explicitly permits native builds and denies unused Prisma client generation and telemetry scripts.
- Remove unreachable TanStack tables; keep the live customer and transaction interfaces. Forward Next development upgrades so browser hydration works alongside NFC sockets.
- Run `cd web-next && pnpm test` for account/payment regressions and CLI self-checks. HTTP fixtures use temporary databases and test credentials, never an operator ledger.
- Resolve all configured relative SQLite paths against `web-next`, including installer initialization; preserve existing ledgers. Verify with `cd web-next && node --import tsx --test lib/database-path.test.ts` and root `python3 -m unittest discover -s tests -p test_setup_paths.py`.
- Backups now archive a validated SQLite snapshot, not independently copied WAL files. R2 restoration requires `--writers-stopped`, stages and validates the archive, saves old state, and calls `scps-cli import-db <source> --yes`. Migration failures retain a snapshot rather than copying files over an active ledger.
- Currency startup conversion now locks before reading the scale marker and commits all cent values and metadata together. Unknown markers, invalid amounts and overflow roll back. Historical ledger usage is not rewritten.
- Protected HTTP requests always check the database session, including old cache cookies. CLI password resets atomically revoke only that user's sessions; failed revocation rolls back the credential change.
- Every matching-lane NFC delivery rechecks the original signed session's current user, staff role and finite expiry. Revoked, expired or demoted sockets close 1008 without receiving the next identifier; duplicate authentication and malformed cookies are rejected.
- NFC readiness tracks authenticated remote broadcasters per lane, not local USB/systemd state. Protocol ping/pong removes stale connections; connected means network presence, not confirmed reader hardware health.
- POS checkout counts only newly borrowed cents under an immediate transaction. Weekly usage resets at Shanghai Monday 00:00; top-ups do not refund consumed allowance. Existing historical usage/week keys remain audit data and need operator reconciliation before live rollout.
- Reader send failures now reach the network reconnect loop. Socket closure cancels and awaits the previous reader; simulation owns one cancellable stdin pipe and exits on EOF/quit. Taps from a failed connection are not queued or replayed.
- Signup consumes one synchronous five-attempt/ten-minute budget per trusted client across all emails and outcomes. The custom server overwrites ingress identity; spoofed forwarding headers cannot reset the budget. Direct Next-only launch scripts are removed.
- Container builds use repository-root context, an isolated build database and no production secrets. The nonroot runtime ships the canonical resolver and SQLite snapshot/recovery tools. Added WebSocket declarations for strict test type checking; installer user commands retain the pinned pnpm path through sudo.

## 2026-11-06

### Student accounts and reviewed top-ups
- Student self-registration now creates pending logins; administrators link existing student balances and grant operator roles in `/admin/users`. The first administrator/recovery path remains `./scps-cli users`; automatic administrator promotion is removed.
- Added private `/student` balance, transaction and QR top-up status screens; staff financial actions, pages, transaction APIs and browser NFC subscriptions reject student sessions.
- `/wcp` is now authenticated administrator review with receipt confirmation. Claims never credit money; approval credits the base amount once, rejection gives no credit. Telegram is optional plain notification delivery, not payment authority.
- Payable reservations are allocated under an immediate transaction and unique pending-amount index. Startup refuses unreconciled active duplicates or unsupported identity schemas without silently changing financial identities or displayed amounts.
- Existing deployments must stop writers, verify a SQLite backup of the configured database, and validate initialization on a copy. Merchant QR assets and secrets remain deployment configuration.

### Changed
- Integrated the SourceHut `master` history into the GitHub `main` history using their matching April application snapshot, retaining destination-only agent tooling and the latest README removals.
- Moved NFC broadcaster, CSV import, and diagnostics to `hardware-pi/`; replaced legacy Python administration with `scps-cli` and `scps-remote-cli`.
- Updated setup/reset scripts and documentation for the removed Python entry points.

### Added
- Manual WeChat top-up requests at `/wcp`, with Telegram payment review. Configure the Telegram bot, chat, webhook secret, and reviewer allowlist before accepting payments. Supply your own QR image as a same-origin public path; external image hosts are blocked by CSP.
- Isolated CLI and payment ledger self-checks. From `web-next/`, run `node_modules/.bin/tsx app/cli/self-check.ts` and `node --import tsx --test lib/repositories/wechat-topup-requests.test.ts`.

### Fixed
- CLI credential creation/reset now matches Better Auth's provider and timestamp format; configuration loads before database resolution.
- CLI CSV import targets the active database; ledger input validation and updates preserve account/transaction consistency.
- Database import validates compatible backups and restores through SQLite without deleting open WAL/SHM files. Stop other writers before deliberate rollback.
- Payment dialogs follow refreshed request state and local expiry; saved payment claims can resend failed Telegram review notifications without paying again.

## 2025-11-18

### Added
- **Dual NFC Reader Support**:
  - Multiple NFC readers can operate simultaneously.
  - Auto-detection of USB devices (ttyUSB0, ttyUSB1, etc.).
  - Per-staff reader filtering via Settings dialog.
  - Persistent reader selection in browser localStorage.
  - Reader identification (reader-1, reader-2, etc.).
  - Lane-based WebSocket routing for isolated tap events.
  - See [Dual Reader Setup Guide](dual-reader-setup.md) for configuration.

- **Batch Student Import**:
  - CSV import script (`batch_import_students.py`) for bulk student enrollment.
  - Support for importing students with or without NFC card UIDs.
  - Template generation with `--template` flag.
  - Dry-run mode to preview imports before execution.
  - Automatic account creation for imported students.
  - Duplicate detection and validation.
  - See [Batch Import Guide](batch-import-students.md) for usage.

- **Enhanced Account Settings**:
  - Redesigned account settings dialog with tabs.
  - Profile management (name, email, avatar).
  - Security tab with password change functionality.
  - Password strength indicator.
  - NFC reader selection integrated into settings.

- **Database Reset Improvements**:
  - Fixed issue where Better Auth tables were deleted during database reset.
  - Enhanced `init_db.py` and `reset_db.py` scripts.
  - Added documentation for safe database reset procedures.
  - See [Database Reset Fix](database-reset-fix.md) for details.

### Changed
- **Multi-Reader Architecture**:
  - Updated WebSocket protocol to support lane-based filtering.
  - Enhanced `tap-broadcaster.py` with auto-detection logic.
  - Improved reader assignment algorithm for multiple USB devices.
  - Client-side filtering via React context (`NFCReaderContext`).

- **Code Quality**:
  - Removed unused components and dependencies.
  - Code cleanup and refactoring across codebase.
  - Improved error handling and logging.

- **Documentation**:
  - Added comprehensive dual-reader setup guide.
  - Added batch import documentation with examples.
  - Updated troubleshooting guide with new scenarios.
  - Enhanced authentication documentation.

### Fixed
- **Database**: Fixed Better Auth table deletion during database reset.
- **Visual**: Various UI alignment and rendering fixes.
- **Import Scripts**: Improved error handling and validation.

## 2025-11-12

### Added
- **Authentication System**:
  - Integrated Better Auth for secure user management.
  - Invite-only signup with session-based authentication.
  - Protected routes and API endpoints.
  - User management with role-based access control.
  - See [Authentication Guide](authentication.md) for setup details.

- **Node.js Backend with WebSocket**:
  - Replaced Python SSE with Node.js WebSocket server for real-time NFC communication.
  - Bidirectional communication for instant tap detection and feedback.
  - Custom `server.js` handles both Next.js app and WebSocket connections.
  - Improved reliability and connection handling.

- **Automated Cloud Backups**:
  - Database auto-backup system to Cloudflare R2.
  - Scheduled backups with retention policies.
  - Restore scripts for disaster recovery.
  - See [Scripts Reference](scripts.md) for backup configuration.

- **USB Reset Flow**:
  - Automated USB device reset for NFC reader recovery.
  - Handles reader disconnection/reconnection gracefully.
  - Reduces need for manual intervention.

- **SEO Enhancements**:
  - Added sitemap.ts for dynamic sitemap generation.
  - robots.txt for search engine crawling rules.
  - Enhanced metadata and Open Graph tags.
  - Improved page titles and descriptions.

- **Community Files**:
  - CODE_OF_CONDUCT.md for community guidelines.
  - CONTRIBUTING.md with contribution guidelines.
  - Moved SECURITY.md to project root for better visibility.

### Changed
- **Backend Architecture**:
  - Major migration from Python-based SSE to Node.js WebSocket.
  - Custom WebSocket protocol for NFC tap events.
  - Better error handling and connection recovery.
  - Improved tap-broadcaster.py with enhanced logging.

- **UI/UX Improvements**:
  - Refined POS page layout and workflow.
  - Enhanced students page with better visual hierarchy.
  - Improved table layouts and text wrapping.
  - Better responsive design for mobile devices.
  - Added loading states and skeleton screens.

- **Documentation Structure**:
  - Reorganized documentation with table of contents.
  - Enhanced cross-references between guides.
  - Added more troubleshooting scenarios.
  - Updated all setup instructions for new backend.

### Fixed
- **Dark Mode**: Fixed theme toggle persistence issues.
- **Session Handling**: Resolved cookie session errors.
- **Visual Bugs**: 
  - Fixed alignment issues across multiple pages.
  - Corrected text wrap behavior in data tables.
  - Resolved render logic issues on POS page.
- **WebSocket**: Improved connection stability and reconnection logic.
- **Overdraft**: Fixed overdraft limit edit functionality.

## 2025-11-09

### Added
- **Decimal Currency Support**:
  - Database: Monetary fields scaled to tenths (¥5.5 = 55).
  - Currency conversion now belongs exclusively to the atomic application startup scale check.
  - UI/CLI: Decimal inputs (step=0.1), formatting helpers.
  - Default overdraft: ¥20.0 (200 tenths).

- **Automated Setup**:
  - `package.json`: Postinstall rebuilds better-sqlite3.
  - `web-next-check-prereqs.sh`: Cross-platform prerequisite checker (moved to scripts/).
  - No more manual `web-next-setup.sh` needed (also moved to scripts/).

### Changed
- **POS Modes Simplified**:
  - Removed "Amount First" mode.
  - Now: "Tap Card" (NFC auto-select) vs "Manual" (dropdown).
  - Cleaner UX, no waiting states.

- **Global Tap Alerts**:
  - Custom alert → Shadcn Sonner toasts.
  - Taps on non-POS pages show "Card Detected! Go to POS" toast.
  - Click navigates with auto-select via URL param.

- **Top-up**: Explicitly manual; removed NFC code.

- **Documentation**: Consolidated into docs/ with guides.

### Fixed
- **Cascade Delete Migration**:
  - `migrate_cascade_delete.sql`: Added ON DELETE CASCADE to transactions/overdrafts.
  - Deleting students now cleans up related data.

## 2025-11-07

### Added
- **Web UI (Next.js)**:
  - Full CRUD for students, cards, accounts, transactions.
  - POS with overdraft enforcement.
  - Dashboard, transaction history.
  - NFC integration via WebSocket (real-time, bidirectional).

- **Tap Broadcaster**:
  - `tap-broadcaster.py`: Broadcasts UIDs to web UI.
  - Systemd service for production.

- **Enrollment Options**:
  - Unenrolled taps: Enroll & POS/Top-up/Only choices.
  - Auto-select in top-up after enroll.

- **Initial CLI Tools**: pos.py, topup.py, enroll.py with basic NFC.

## Documentation Updates

### 2025-11-09

- **Documentation Overhaul**:
  - Consolidated duplicate NFC documentation into single guide
  - Added [Deployment Guide](deployment.md) for production setup
  - Added [Security Guide](security-guide.md) for hardening recommendations
  - Added [UI Components Guide](ui-components.md) for custom components
  - Added [Scripts Reference](scripts.md) for utility scripts
  - Enhanced existing guides with missing information
  - Removed redundant web-ui.md
  - Updated all cross-references and navigation

For full history, see git log.

**Last updated: November 18, 2025**
