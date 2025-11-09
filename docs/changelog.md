# Change Log

A log of notable changes during early development. No official releases yet.

## 2025-11-09

### Added
- **Decimal Currency Support**:
  - Database: Monetary fields scaled to tenths (¥5.5 = 55).
  - Migration: `migrate_decimal_currency.sql` multiplies existing values by 10.
  - UI/CLI: Decimal inputs (step=0.1), formatting helpers.
  - Default overdraft: ¥20.0 (200 tenths).

- **Automated Setup**:
  - `package.json`: Postinstall rebuilds better-sqlite3.
  - `check-prereqs.sh`: Cross-platform prerequisite checker.
  - No more manual `./setup.sh` needed.

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
  - NFC integration via SSE.

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
  - Added [Security Guide](security.md) for hardening recommendations
  - Added [UI Components Guide](ui-components.md) for custom components
  - Added [Scripts Reference](scripts.md) for utility scripts
  - Enhanced existing guides with missing information
  - Removed redundant web-ui.md
  - Updated all cross-references and navigation

For full history, see git log.

**Updated**: November 2025
