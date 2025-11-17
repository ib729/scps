# Change Log

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
  - Migration: `migrate_decimal_currency.sql` multiplies existing values by 10.
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
