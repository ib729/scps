# Batch Import Examples

Run commands from `web-next`; the importer uses the configured canonical database.
Back up first, preview a small batch, and retain the source CSV for reconciliation.

```sh
node --import tsx tools/batch-import-customers.ts --template --with-uid customers.csv
node --import tsx tools/batch-import-customers.ts --dry-run customers.csv
node --import tsx tools/batch-import-customers.ts customers.csv
```

Names only:

```csv
name
Jane Smith
John Doe
```

Names with optional card UIDs, including a quoted comma:

```csv
name,uid
"Doe, Jane",04A1B2C3
John Doe,05D4E5F6
Alice Johnson,
```

The importer trims names and uppercases hexadecimal UIDs. Duplicate names are
skipped by default; reimporting a name can attach an unowned card. Use
`--no-skip-duplicates` to report duplicate names as errors. Each valid row commits
atomically; other rows continue after an error, but the overall exit status fails.
Dry runs perform no schema or data writes.

Controlled direct SQL import:

```sql
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
INSERT INTO customers(name) VALUES ('Jane Smith'),('John Doe');
INSERT INTO accounts(customer_id,balance,max_overdraft_week)
SELECT id,0,0 FROM customers WHERE id NOT IN (SELECT customer_id FROM accounts);
COMMIT;
```

Verification against the actual configured database:

```sql
SELECT COUNT(*) FROM customers;
SELECT * FROM customers ORDER BY id DESC LIMIT 10;
SELECT c.name,k.card_uid FROM customers c
LEFT JOIN cards k ON k.customer_id=c.id ORDER BY c.name;
```

- [Full documentation](batch-import-customers.md)
- [Script reference](scripts.md#batch-import-customersts)
