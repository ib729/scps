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

Quoted multiline name (one CSV record, not two customers):

```csv
name,uid
"Alice
Johnson",ABCD
```

The full CSV parser handles commas, escaped quotes and multiline fields. The importer
trims names and uppercases UIDs, which must be 4–20 hexadecimal characters when present.
Duplicate names are skipped by default; reimporting a name can attach an unowned
active card. Use `--no-skip-duplicates` to report duplicate names as errors.
Each valid row commits atomically; validation/insert errors allow later rows to
continue but fail the overall exit status. Broken CSV quoting fails parsing before
import. Dry runs require an existing ledger and perform no schema or data writes,
including when checking within-file conflicts. Template generation needs no database
and replaces its requested output file.

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
- [Script reference](scripts.md#customer-import-snapshots-and-schema-cutover)
