# Staff Quick Reference - Stuco POS System

## Quick Start

**URL:** http://localhost:3000

**Pages:**
- 🏠 Dashboard - Overview
- 💳 POS - Process sales
- 💰 Top-up - Add funds
- 👥 Students - Manage accounts
- 📊 Transactions - View history

## Processing a Sale (Tap Card Mode)

1. **Ensure "Tap Card" mode** is selected (not "Manual")
2. **Student taps card** on reader
3. **Student auto-selects** ✓
4. **Enter amount:** Type the purchase price (e.g., 6 for ¥6)
5. **(Optional) Add description:** "Snacks", "Drinks", etc.
6. **Click "Charge ¥X"**
7. **Done!** Transaction complete

⏱️ **Time:** ~10 seconds

## Processing a Sale (Manual)

If the card reader isn't working or student doesn't have their card:

1. **Click "Manual" mode** at the top
2. **Click dropdown** to select student
3. **Find student** by name
4. **Enter amount** and description
5. **Click "Charge ¥X"**

## Top-up (Add Funds)

1. **Select student** from dropdown
2. **Enter amount:** How much they're adding
3. **(Optional) Description:** "Cash payment", "Bank transfer"
4. **(Optional) Your name:** For tracking
5. **Click "Add ¥X"**

**Note:** Top-ups do not support card tapping - use manual selection only.

## Understanding Balances

| Balance | Meaning |
|---------|---------|
| ¥50 | Positive balance (green) |
| ¥5 | Low balance (orange warning) |
| -¥10 | Overdraft (red) |

**Overdraft Limit:** ¥20 per week (Monday-Sunday)

## What If...

### Card reader shows "Disconnected"
- Check the green "NFC Connected" badge is showing
- If not, contact IT support
- Use manual student selection in the meantime

### Student's card isn't recognized
- **First time:** Ask them to register at Students page → Add Card
- **Previously worked:** Check card status in Students → [Name]
- **Workaround:** Select student manually from dropdown

### Transaction declined
- **"Overdraft limit exceeded":** Student has used their ¥20/week overdraft
- **Option 1:** Ask them to top-up first
- **Option 2:** They can pay cash, you process top-up + sale separately

### Balance looks wrong
- Check Transactions page for recent history
- Contact supervisor for manual adjustment if needed
- Manual adjustments tracked under "ADJUST" type

## Two POS Workflow Modes

### Tap Card (Default)
- Student taps → you enter amount
- **Best for:** Regular sales with card-carrying students
- **How:** Ensure "Tap Card" button is selected

### Manual
- You select student → enter amount → charge
- **Best for:** Student forgot card, reader offline
- **How:** Click "Manual" button at top

## Status Indicators

| Indicator | Meaning |
|-----------|---------|
| 🟢 "Connected to card reader" | System ready for taps (Tap Card mode) |
| 🔵 "Card Detected!" popup | Card tapped on non-POS page - go to POS |
| 🔴 "Disconnected from reader" | Reader offline, use manual mode |

## Common Tasks

### Check a student's balance
1. Go to Students page
2. Search or scroll to find them
3. Balance shown next to name

### View transaction history
- **All transactions:** Transactions page
- **One student:** Students → [Name] → scroll down

### Adjust a balance (supervisor only)
1. Go to Top-up page
2. Select student
3. Scroll to "Manual Balance Adjustment"
4. Enter amount (negative to subtract)
5. **Required:** Enter reason
6. Click "Apply Adjustment"

### Register a new student
1. Go to Students page
2. Click "Create Student"
3. Enter name
4. **Optional:** Add card immediately (tap or type UID)

## Tips for Busy Times

1. **Keep POS page open** all day (auto-reconnects)
2. **Use "Tap Card" mode** for faster service
3. **Switch to "Manual" mode** if reader issues occur
4. **Check balance before charging** to avoid awkward declines
5. **Have cash backup** if card reader fails
6. **Watch for tap alerts** on other pages - they'll guide you to POS

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Move to next field |
| Enter | Submit form (when amount field focused) |
| Esc | Cancel (in dialogs) |

## When to Contact IT

- Card reader not connecting for >5 minutes
- Database errors or "500 Internal Server Error"
- Balances not updating after transactions
- Multiple students reporting wrong balances

## Emergency Procedures

### Card reader fails completely
1. Switch to manual student selection
2. Continue normal operations
3. Transactions still log correctly
4. Contact IT when quiet

### Power outage / system restart
1. Wait for systems to restart (~2 minutes)
2. Refresh browser page
3. Verify "Connected to card reader" appears
4. Resume normal operations
5. All data is saved (SQLite auto-recovery)

### Internet down (local only)
- **Good news:** Everything runs locally!
- System continues to work on local network
- No internet required

## Security

- ✅ Log out when leaving POS unattended
- ✅ Don't share your staff credentials
- ✅ Report suspicious transactions
- ❌ Don't manually edit the database
- ❌ Don't share card UIDs publicly

## Contact

- **IT Support:** [Your IT contact]
- **Supervisor:** [Supervisor name]
- **System Admin:** [Admin name]

---

**Version:** 1.0 (NFC Integration)  
**Last Updated:** 2025-11-07  
**System:** Stuco Snack Bar POS

