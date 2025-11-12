# User Guide

This guide is for staff using the Stuco web interface to manage the snack bar. URL: http://localhost:3000 (or production URL).

## Navigation

- 🏠 **Dashboard**: System overview, stats, recent transactions.
- 💳 **POS**: Process sales (tap card or manual).
- 💰 **Top-up**: Add funds or adjust balances (manual only).
- 👥 **Students**: Manage student accounts and cards.
- 📊 **Transactions**: View full history.

## Processing Sales (POS)

The POS supports two modes for flexibility.

### Tap Card Mode (Recommended)

1. Go to POS page.
2. Ensure **"Tap Card"** button is selected (green).
3. Student taps their card on the reader.
4. Student auto-selects, balance shows.
5. Enter purchase amount (e.g., 6.5 for ¥6.5).
6. (Optional) Add description (e.g., "Chips") and your name.
7. Click **"Charge ¥X"**.
8. Success: Transaction complete, balance updated.

**If card unenrolled**: Dialog opens. Enter name, choose:
- **Enroll & Process Payment**: Enrolls and charges immediately.
- **Enroll & Top-up**: Enrolls and goes to top-up.
- **Enroll Only**: Enrolls, returns to POS.
- **Cancel**.

**Time**: ~10 seconds.

### Manual Mode

Use if reader offline or student forgot card:

1. Click **"Manual"** button (turns green).
2. Select student from dropdown (search by name).
3. Enter amount and description.
4. Click **"Charge ¥X"**.

NFC taps still work but show a toast alert (see below).

## Adding Funds (Top-up)

Top-ups are manual only (no NFC).

1. Go to Top-up page.
2. Select student from dropdown.
3. Enter amount (e.g., 20.0 for ¥20).
4. (Optional) Description (e.g., "Cash") and your name.
5. Click **"Add ¥X"**.

For adjustments (e.g., refunds): Enter negative amount with reason.

**Auto-selection**: If coming from enrollment, student pre-selected.

## Managing Students

### View/Add Students

1. Go to Students page.
2. Search or scroll to find.
3. Balance indicators:
   - 🟢 Positive (green).
   - 🟡 Low (orange, < ¥5).
   - 🔴 Overdraft (red).

4. **Add New**: Click "Add Student", enter name, create (¥0 balance).

### Student Details

Click student name:

- **Edit Info**: Update name.
- **Account Settings**: Adjust overdraft limit (default ¥20/week).
- **Cards**: Add/revoke/delete cards.
  - Add: Enter UID (tap or type), set active.
- **Transactions**: Full history for this student.

**Delete Student**: Cascades to delete cards, transactions, account.

## Handling Unenrolled Cards

When an unenrolled card is tapped:

### On POS Page

- Dialog: "Card not registered".
- Enter student name.
- Options:
  - **Enroll & Process Payment**: Enroll + charge.
  - **Enroll & Top-up**: Enroll + add funds.
  - **Enroll Only**: Enroll, stay on POS.
  - **Cancel**.

### On Other Pages

- Toast alert (top-right): "Card Detected! Go to POS".
- Click "Go to POS": Navigates to POS, auto-selects student.
- If unenrolled: Follows POS unenrolled flow.
- Auto-dismisses after 10s.

## Balances and Overdrafts

- **Balance**: Current funds (¥X.X).
- **Overdraft**: Up to ¥20/week (resets Monday 00:00 local time).
- **Decline**: If over limit, "Overdraft exceeded".
  - Solution: Top-up first or cash payment.

View history on Transactions page or per student.

## Card Management

- **Register Card**: Students → [Name] → Add Card → Enter UID.
- **Status**: Active (usable) / Revoked (disabled).
- **Multiple Cards**: Students can have several; all active work.

**Lost Card**: Revoke in details, issue new.

## Transaction History

- **All Transactions**: Filter by type (TOPUP/DEBIT/ADJUST), search student.
- **Delete**: Reverses balance impact.
- **Staff Tracking**: Who processed each.

## Tips for Busy Times

1. **Keep POS Open**: Auto-reconnects to reader.
2. **Tap Card Mode**: Fastest for card users.
3. **Manual Fallback**: For issues.
4. **Check Balance First**: Avoid declines.
5. **Cash Backup**: For NFC failures.
6. **Tap Alerts**: Guide to POS if tapped elsewhere.
7. **Search**: Quick student lookup.

**Shortcuts**:
- Tab: Next field.
- Enter: Submit (amount focused).
- Esc: Cancel dialogs.

## Status Indicators

- 🟢 **Connected to card reader**: Ready for taps (POS Tap Card mode).
- 🔵 **Card Detected!** toast: Tap happened, go to POS.
- 🔴 **Disconnected**: Use manual; check broadcaster.

## Security

- Log out if leaving unattended.
- Report suspicious activity.
- Don't edit database manually.

## Getting Help

- **IT**: For hardware/setup.
- **Supervisor**: Policy questions.
- **Logs**: Browser console for web errors.

**Version**: 1.1 (NFC + Decimal Support)  
**Last updated: November 12, 2025**
