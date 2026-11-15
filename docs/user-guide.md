# User Guide

The Student Council Payment System has an operator workspace and a separate customer portal. Open your deployment URL, or `http://localhost:3000` locally.

## Navigation and Access

- Staff/admin: `/admin` dashboard, `/admin/pos`, `/admin/topup`, `/admin/customers` and `/admin/transactions`.
- Administrators only: **Accounts** at `/admin/users` and **Payment review** at `/admin/payments`.
- Customers: `/customer`; new/unlinked registrations wait at `/customer/pending`.

Public registration never grants operator access or creates a financial balance. An administrator verifies the person and links the correct existing customer ledger. A teacher who only buys uses the customer role.

## Processing Sales

### Tap Card Mode

1. Open `/admin/pos` and select the intended reader in Settings.
2. Select **Tap Card** mode.
3. Ask the customer to tap a card; confirm the selected customer and balance.
4. Enter the purchase amount, description and staff information as appropriate.
5. Confirm the charge and wait for the success result/balance update.

A tap selects a card/customer; it is not itself a completed payment. If the card is unenrolled, the enrollment dialog offers enrollment with payment, enrollment with top-up, enrollment only, or cancellation. Check the person's identity before assigning the card.

### Manual Mode

Use manual selection when a reader is unavailable or a customer has forgotten their card. Search by name, verify the customer, enter the amount and confirm the charge. Do not treat an offline reader as a reason to bypass balance/overdraft checks.

Outside the POS page, a tap alert can take staff to `/admin/pos` with the detected card selected. Customer sessions do not subscribe to operator NFC events.

## Adding Funds and Corrections

At `/admin/topup`, select the correct customer, enter a positive amount, record the payment description/staff and confirm. Enrollment can preselect the new customer.

Use the balance-adjustment form for corrections: positive values add and negative values subtract. Record the reason and review the resulting balance before confirming. A ledger correction is not a refund to a merchant payment account.

## Managing Customers and Cards

At `/admin/customers`, search the ledger or create a new customer with a zero balance. Open a customer to edit their name, review transactions, configure weekly overdraft and manage cards.

- Register a UID only after verifying the intended owner.
- Multiple active cards can belong to one customer.
- Revoke a lost card before issuing a replacement.
- Records with financial history are archived rather than losing their history; only eligible unused records are deleted.
- Archived/account-less linked records are unavailable in the customer portal.

Do not reassign a login link by guessing from a name/email. The approval screen links one login to one financial customer; identity mistakes need an administrator and a verified backup.

## Balances and Weekly Overdraft

Amounts display in yuan with two decimals; the ledger stores integer cents. Customers have individual weekly overdraft limits, which may be zero.

Borrowing allowance uses the week beginning Monday 00:00 in `Asia/Shanghai`. Top-ups improve the balance but do not refund borrowing allowance already consumed during that week. If a charge exceeds available funds/allowance, top up first or use another accepted payment method.

Review history at `/admin/transactions` or on the customer detail page. Use the existing correction controls carefully and keep the reason/staff information; never repair balances by editing SQLite rows directly.

## Customer Portal and QR Top-ups

1. Register at `/signup`, then sign in.
2. Wait for administrator approval/linking at `/customer/pending`.
3. The linked portal shows only your balance, history and top-up requests.
4. Request a base top-up amount and pay the exact distinct payable amount displayed against the configured merchant QR.
5. Mark the request sent only after sending payment; keep the request ID/receipt.
6. Wait for an administrator to verify the actual receipt and approve.

For example, a ¥30.00 request may ask for ¥30.01 to distinguish it. Only ¥30.00 is credited after approval. A sent claim does not change the balance. Rejection gives no credit and does not refund the merchant payment.

Unclaimed reservations expire; do not pay after expiry. Claimed pending requests remain reserved until review. For late or disputed payments, contact the operator with the request ID instead of paying a reused amount.

## Administrator Account and Payment Review

In **Accounts**, verify registration identity and select the existing ledger before **Approve and link**. Grant staff/admin access only after separate confirmation. Staff cannot grant roles, approve payments or access these administration pages. The last administrator cannot be demoted.

In **Payment review**, investigate the request/receipt, then confirm actual receipt before approval. Claiming alone never credits. Approval credits the base amount once; rejection must not be used as a substitute for arranging a real-world refund.

The website queue/status is authoritative. Optional Telegram messages are alerts linking to the website, not approval buttons.

## Reader and System Status

**Connected** means an authenticated broadcaster is present on the selected lane. It does not prove PN532 communication, a good cable or a successful payment. Verify a real tap when opening a lane; use manual mode if hardware is unavailable.

Reader recovery and database backup controls are administrator-only and need correctly configured host permissions/tools. A failed operation is not a successful repair or backup. See [NFC Setup](nfc-setup.md) and [Troubleshooting](troubleshooting.md); do not repeatedly reset a device held by another process.

## Busy-period and Security Checks

- Keep the correct POS/reader selection open and confirm the customer before charging.
- Wait for the success result instead of resubmitting an uncertain charge.
- Keep an accepted manual/cash fallback for hardware/network outages.
- Revoke missing cards and log out of unattended operator sessions.
- Escalate identity/payment disputes to an administrator; keep internal notes private.

See [Authentication Guide](authentication.md) for account approval and [Database Guide](database.md) for operator backup/recovery procedures.

**Last updated: November 15, 2026**
