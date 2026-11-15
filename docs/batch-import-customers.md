# Batch Import Customers

Back up the configured ledger before importing. Customer names must be unique;
financial accounts start at zero cents. Importing a customer does not create or
approve a website login: administrators link registrations in `/admin/users`.

## CSV format

Use UTF-8 with a `name` header and an optional `uid` header:

```csv
name,uid
"Doe, Jane",AB12CD34
John Doe,DEADBEEF
Alice Johnson,
```

Leave the UID empty for customers without cards. UIDs are uppercase hexadecimal;
obtain them by tapping the reader on `/admin/pos`. Never assign one card to two
customers. Reimporting a duplicate name can attach a new, unowned card.

## CSV import

The existing importer honors `DATABASE_PATH`. Use its explicit path until the
TypeScript tooling cutover; never run a different script against the current schema.

```sh
# From the repository root; use the actual configured database path.
export DATABASE_PATH=/absolute/path/to/stuco.db
python3 hardware-pi/batch_import_students.py --template customers.csv
python3 hardware-pi/batch_import_students.py --template --with-uid customers-with-cards.csv
python3 hardware-pi/batch_import_students.py --dry-run customers.csv
python3 hardware-pi/batch_import_students.py customers.csv
python3 hardware-pi/batch_import_students.py --no-skip-duplicates customers.csv
```

Check the exit status and row errors. A dry run must not change the ledger.
Default duplicate handling skips names already present; `--no-skip-duplicates`
makes duplicates errors. Keep the source CSV for reconciliation and audit.

## Direct SQL import

For controlled one-time imports, stop competing writers and use a transaction:

```sql
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO customers(name) VALUES ('John Doe'),('Jane Smith');
INSERT INTO accounts(customer_id,balance,max_overdraft_week)
SELECT id,0,0 FROM customers
WHERE id NOT IN (SELECT customer_id FROM accounts);
COMMIT;
```

Apply this to the configured database, not a cwd-dependent `stuco.db`:

```sh
sqlite3 /absolute/path/to/stuco.db < import-customers.sql
```

Do not use `INSERT OR REPLACE`: it can delete an existing customer and change
ownership. Prefer the importer for UID validation and card-conflict handling.

## Verify

```sql
SELECT COUNT(*) FROM customers;
SELECT * FROM customers ORDER BY id DESC LIMIT 10;
SELECT c.* FROM customers c
LEFT JOIN accounts a ON a.customer_id=c.id
WHERE a.customer_id IS NULL;
SELECT c.name,k.card_uid FROM customers c
JOIN cards k ON k.customer_id=c.id ORDER BY c.name;
```

Missing accounts should be investigated before linking registrations. Duplicate
names, invalid hexadecimal UIDs, conflicting card owners and malformed CSV rows
need correction in the source file. Export Excel/Sheets data as UTF-8 CSV, retain
quoted names, preview with `--dry-run`, then try a small batch first.
