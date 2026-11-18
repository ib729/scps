# Change Log

Historical commands and names describe their releases, not current instructions.
Use the current guides for operations.

## 2026-11-18

### Settings
- Show School details and Database Management first, followed by POS Default Mode, NFC Reader Selection, and Reset NFC Hardware.
- Give Account Settings the same responsive width and height limit as Settings.
- Replace animated icons with static Lucide icons and give Accounts a distinct user settings icon.
- Remove the visible header and close icon from Account Settings. Click outside or press Escape to dismiss.
- Add an opt-in administrator update button with isolated builds, restart checks, and code rollback.
- Organize Settings into responsive panels, hide the redundant title, and keep preference actions visible while scrolling.
- Put account creation above registrations and refresh the Account popup’s Profile and Security tabs.
- Remove the extra password length hint from Account Settings without changing validation.
- Enable the web updater through systemd setup and check for updates every 30 days without installing them.
- Reuse the previous systemd setup choice and leave a running managed deployment alone on reruns.
- Stage regular files for setup configuration validation, comparison, and installation so privileged tools do not have to reopen subprocess stdin.
- Use a lower-memory production build on small hosts and memory-capped updater services.
- Bound web shutdown so stalled requests cannot block an update restart.

### Point of sale and customers
- Fit POS purchase controls on short screens with a compact layout and scrollable dialogs.
- Remove the total count footer from the customer table.
- Show every transaction field without horizontal scrolling. Use labeled rows when the table does not fit.
- Match the Manual POS input sizes, remove the sample text, and let Tab accept the highlighted customer and focus Amount.
- Compact the Top-up form and remove the extra headings and copy from Top-up and Accounts.
- Give Top-up fields more room and match the Payment Method control to the other inputs.
- Simplify Add Customer to a name field and Cancel and Create buttons.
- Remove Bitcoin from the Top-up payment dropdown without changing existing transactions.
- Center Delete under Actions in Customers and put Edit notes beside the transaction ID.
- Widen Top-up without changing its field proportions, and remove the placeholder text.
- Expand the Top-up frame to fill the workspace while retaining the existing control sizes.
- Apply the full-workspace frame to POS and Transactions without making their controls taller.
- Give Customers the same workspace frame as POS, Transactions, and Top-up, and tighten the margins around all four.
- Remove the redundant heading from Manual POS.
- Keep the Customers table header the same color as its frame, including on hover.
- Use a pencil icon for Edit notes in Transactions.
- Give Accounts the same full-height workspace frame as POS and Transactions.

## 2026-11-15

### Repository cleanup
- Remove local AI skill artifacts and consolidate the guides. The lock only
  pinned a shadcn AI skill and was not an application dependency.

### Payment review
- Keep the mounted administrator queue polling when empty; resolved history shows the newest decisions regardless of status, while pending claims retain priority.

### Typed web runtime
- Run the custom server, CLI and shared SQLite/NFC modules with `node --import tsx`; the web bundle and server share one tap broadcaster.
- Keep configured relative database paths rooted at `web-next`, independent of the launch directory.
- Close HTTP/NFC sockets and Next resources on SIGTERM/SIGINT so the custom server stops cleanly as a container's PID 1.

### Customer domain
- Rename financial tables, owned payloads and roles to customer terminology; retain money, IDs, card ownership, payment states and login identities.
- Require the stopped-writer customer migration command with a verified pre-upgrade backup; startup refuses legacy/mixed schemas and no longer converts ledger currency.

### Route namespaces
- Share operator pages under `/admin` while retaining administrator-only account/payment decisions; customer-owned pages live under `/customer`.
- Permanently redirect legacy page URLs with detail suffixes/query values preserved; never redirect POST server actions.

### Typed database tools
- Replace Python CSV, snapshot/extraction and legacy-conversion tools with package-local TypeScript; use complete CSV/tar parsers and verified SQLite online snapshots.
- Reject unsafe/truncated archives and unknown currency scales; normalize pre-cutover cent-based backups in private restore staging without replacing live files.
- CSV imports commit valid rows atomically, report failures with nonzero status, and keep dry runs/template generation nonmutating.
- Normalize missing legacy POS-mode preferences in private conversion staging, preserving the reader selection, timestamps and existing manual mode.

### Typed NFC tools
- Replace the Python reader and diagnostic programs with TypeScript and native libnfc; preserve authenticated sends, reader/lane identity, debounce and independent reader/network recovery.
- Bound each reader child to five seconds, await close before replacement, and discard cancelled-generation UIDs. Physical PN532/native USB acceptance is still required on deployed hardware.

### Typed operational workflows
- Render reader environment-file paths without quotes so systemd recognizes the absolute path.
- Verify a staged pnpm bootstrap before promotion, preserve existing ledger paths, and default fresh ledgers to `scps.db`.
- Validate the renamed systemd units and retire only same-repository legacy services without overrides. Maintenance and reader recovery check legacy owners during cutover.
- Render valid systemd working directories and disable Next.js telemetry during automated builds.
- Remove the optional Docker build and container deployment instructions. Native deployment remains available.
- Rename the Debian and Ubuntu bootstrap to `scripts/setup.sh`.
- Detect Debian and Ubuntu, offer optional systemd services, and use port 38173 for new automated installations without changing existing environments.
- Move all operational scripts into `web-next/tools/ops`; keep only the two root CLI launchers and Debian toolchain bootstrap in shell. Remove Python runtime requirements; native-addon compilation may still need Python.
- Preserve backup publication/restore, deployment argument quoting and stopped-reader ownership; reset the selected TTY's real USB ancestor and retain the existing reader timing.
- Require a verified stopped local web service before destructive reset/restore, preserve existing crypt configuration on failed replacement, and keep configured NFC secrets out of CLI help.
- Settings backup download and reader repair now invoke the typed tools from the package directory; administrator/origin gates and subprocess failures remain enforced without granting arbitrary Node sudo.

### Documentation cutover
- Remove the root security-reporting, code-of-conduct and contributing policy files; retain practical authentication, security, deployment, NFC and recovery guides.
- Update current examples to customer routes/schema and typed tools, distinguish native-build Python from runtime, and document stopped-writer upgrades and paired application/database rollback.

### Toolchain
- Pin Node 26.13.1, pnpm 12.21.0 and current stable direct dependencies; use the installed `auth` CLI. Python >=3.11 is only a third-party native-addon build prerequisite, not an application/reader runtime.
- TypeScript 7 checks the application; ESLint compiler-API consumers resolve isolated TypeScript 6.0.3. Workspace policy explicitly permits native builds and denies unused Prisma client generation and telemetry scripts.
- Remove unreachable TanStack tables; keep the live customer and transaction interfaces. Forward Next development upgrades so browser hydration works alongside NFC sockets.
- Run `cd web-next && pnpm test` for account/payment regressions and CLI self-checks. HTTP fixtures use temporary databases and test credentials, never an operator ledger.
- Resolve all configured relative SQLite paths against `web-next`, including installer initialization; preserve existing ledgers. Focused path/setup checks live in `lib/database-path.test.ts` and `tools/ops/setup-host.test.ts`.
- Backups archive a validated SQLite snapshot, not independently copied WAL files. R2 restoration requires stopped writers and a verified inactive local web service, validates private staging, saves old state and uses the shared SQLite restore implementation. Migration failures retain a snapshot instead of copying over an active ledger.
- Currency conversion is explicit. Startup refuses non-cent ledgers; the legacy converter rejects unknown scales, invalid amounts and overflow without rewriting historical borrowing usage.
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
  - See [Dual readers](nfc-setup.md#dual-readers) for current configuration.

- **Batch Student Import**:
  - CSV import script (`batch_import_students.py`) for bulk student enrollment.
  - Support for importing students with or without NFC card UIDs.
  - Template generation with `--template` flag.
  - Dry-run mode to preview imports before execution.
  - Automatic account creation for imported students.
  - Duplicate detection and validation.
  - See [Customer import](scripts.md#customer-import-snapshots-and-schema-cutover) for current usage.

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
  - See [Database reset](database.md#sql-migrations-and-destructive-reset) for current procedures.

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
  - Added UI component guidance, now in [Development](development.md#ui-components)
  - Added [Scripts Reference](scripts.md) for utility scripts
  - Enhanced existing guides with missing information
  - Removed redundant web-ui.md
  - Updated all cross-references and navigation

For full history, see git log.

