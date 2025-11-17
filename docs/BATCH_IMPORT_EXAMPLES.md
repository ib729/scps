# Batch Import Examples

Quick reference for importing students into the database.

## Quick Start

```bash
# Generate a template with UID column
python batch_import_students.py --template --with-uid students.csv

# Edit the CSV file with your students
# Then preview the import
python batch_import_students.py --dry-run students.csv

# If it looks good, import for real
python batch_import_students.py students.csv
```

## Method 1: SQL (Simplest for Small Lists)

```sql
-- File: import.sql
INSERT INTO students (name) VALUES 
  ('Ivan Belousov'),
  ('John Doe'),
  ('Jane Smith');

-- Create accounts for all students without one
INSERT INTO accounts (student_id, balance, max_overdraft_week)
SELECT id, 0, 0 FROM students 
WHERE id NOT IN (SELECT student_id FROM accounts);
```

```bash
sqlite3 stuco.db < import.sql
```

## Method 2: CSV with Names Only

**students.csv:**
```csv
name
Ivan Belousov
John Doe
Jane Smith
```

```bash
python batch_import_students.py students.csv
```

## Method 3: CSV with Names and Card UIDs (Recommended)

**students_with_cards.csv:**
```csv
name,uid
Ivan Belousov,0E39E996
John Doe,DEADBEEF
Jane Smith,AB12CD34
Alice Johnson,
Bob Wilson,
```

```bash
python batch_import_students.py students_with_cards.csv
```

## Real-World Example

Let's say you're starting a new school year:

1. **Export from your school's system** (Excel, Google Sheets, etc.)
2. **Format as CSV:**

```csv
name,uid
Student One,04A1B2C3
Student Two,05D4E5F6
Student Three,
```

3. **Preview the import:**

```bash
python batch_import_students.py --dry-run new_students.csv
```

Output:
```
UID column detected - will import cards with students
Found 3 students in CSV file

=== DRY RUN MODE - No changes will be made ===

[DRY RUN] Would import: Student One → 04A1B2C3
[DRY RUN] Would import: Student Two → 05D4E5F6
[DRY RUN] Would import: Student Three

============================================================
Import Summary:
  Would import: 3
  Would create: 2
  Skipped (duplicates): 0
  Validation errors: 0
  Import errors: 0
============================================================
```

4. **Import for real:**

```bash
python batch_import_students.py new_students.csv
```

## Tips

- **Always use --dry-run first** to preview changes
- **UIDs are optional** - leave empty for students without cards yet
- **UIDs are case-insensitive** - will be converted to uppercase
- **Duplicates are skipped** by default (use --no-skip-duplicates to fail instead)
- **You can add cards later** by re-importing with just those rows
- **Backup first** if you're nervous: `cp stuco.db stuco.db.backup`

## Verification

After importing, verify:

```bash
# Count students
sqlite3 stuco.db "SELECT COUNT(*) FROM students;"

# List recent imports
sqlite3 stuco.db "SELECT * FROM students ORDER BY id DESC LIMIT 10;"

# Check students with cards
sqlite3 stuco.db "SELECT s.name, c.card_uid FROM students s 
  LEFT JOIN cards c ON s.id = c.student_id 
  ORDER BY s.name;"
```

## See Also

- [Full Documentation](batch-import-students.md)
- [Scripts Reference](scripts.md#batch_import_studentspy)
