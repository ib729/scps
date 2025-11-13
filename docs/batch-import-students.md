# Batch Import Students

This guide covers multiple methods for batch importing students into the database.

## Method 1: Direct SQL Import (Simplest)

Best for: One-time imports or when you're comfortable with SQL.

### Step 1: Create SQL file

```bash
cat > import_students.sql << 'EOF'
-- Insert students
INSERT INTO students (name) VALUES 
  ('John Doe'),
  ('Jane Smith'),
  ('Alice Johnson'),
  ('Bob Wilson');

-- Create accounts for all students that don't have one
INSERT INTO accounts (student_id, balance, max_overdraft_week)
SELECT id, 0, 0 
FROM students 
WHERE id NOT IN (SELECT student_id FROM accounts);
EOF
```

### Step 2: Import into database

```bash
sqlite3 stuco.db < import_students.sql
```

### Tips for SQL Method

- Use `INSERT OR IGNORE` to skip duplicates:
  ```sql
  INSERT OR IGNORE INTO students (name) VALUES ('John Doe');
  ```
  
- Always create accounts after importing students (the second INSERT statement)

- You can verify imports with:
  ```bash
  sqlite3 stuco.db "SELECT * FROM students ORDER BY id DESC LIMIT 10;"
  ```

## Method 2: CSV Import with Python Script (Recommended)

Best for: Regular imports, CSV files from other systems, need validation and error reporting.

### Step 1: Create or use a CSV file

**Basic format (names only):**
```csv
name
John Doe
Jane Smith
Alice Johnson
```

**With NFC card UIDs (recommended):**
```csv
name,uid
Ivan Belousov,0E39E996
John Doe,DEADBEEF
Jane Smith,AB12CD34
Alice Johnson,
Bob Wilson,
```

Note: You can leave the UID column empty for students who don't have cards yet.

**Generate a template:**

```bash
# Basic template (names only)
python batch_import_students.py --template students.csv

# Template with UID column
python batch_import_students.py --template --with-uid students_with_cards.csv
```

### Step 2: Preview the import (dry run)

```bash
python batch_import_students.py --dry-run students.csv
```

This shows what would be imported without making changes.

### Step 3: Import the students

```bash
python batch_import_students.py students.csv
```

### Script Options

```bash
# Basic import (skips duplicates)
python batch_import_students.py students.csv

# Import students with NFC card UIDs
python batch_import_students.py students_with_cards.csv

# Preview without importing
python batch_import_students.py --dry-run students.csv

# Fail on duplicates instead of skipping
python batch_import_students.py --no-skip-duplicates students.csv

# Generate template file (names only)
python batch_import_students.py --template students.csv

# Generate template with UID column
python batch_import_students.py --template --with-uid students_with_cards.csv

# Help and examples
python batch_import_students.py --help
```

### Features

- ✓ Validates CSV format before importing
- ✓ Optional NFC card UID import (associate cards with students)
- ✓ Skips duplicate students (or fails if you prefer)
- ✓ Creates student accounts automatically
- ✓ Can add cards to existing students
- ✓ Validates UID format (hexadecimal)
- ✓ Prevents duplicate card assignments
- ✓ Detailed error reporting
- ✓ Dry-run mode to preview changes
- ✓ Transaction safety (all-or-nothing)
- ✓ UTF-8 support for international names

### Example Output

**Basic import (names only):**
```
Found 5 students in CSV file

✓ Imported: John Doe (ID: 42)
✓ Imported: Jane Smith (ID: 43)
⊘ Skipping duplicate: Alice Johnson (ID: 12)
✓ Imported: Bob Wilson (ID: 44)
✓ Imported: Charlie Brown (ID: 45)

Changes committed to database

============================================================
Import Summary:
  Imported: 4
  Skipped (duplicates): 1
  Validation errors: 0
  Import errors: 0
============================================================
```

**With NFC card UIDs:**
```
UID column detected - will import cards with students
Found 5 students in CSV file

✓ Imported: Ivan Belousov (ID: 42) → 0E39E996
✓ Imported: John Doe (ID: 43) → DEADBEEF
⊘ Skipping duplicate: Alice Johnson (ID: 12)
⊕ Added card to existing student: Bob Wilson (ID: 15) → AB12CD34
✓ Imported: Charlie Brown (ID: 44)

Changes committed to database

============================================================
Import Summary:
  Imported: 4
  Cards created: 3
  Skipped (duplicates): 1
  Validation errors: 0
  Import errors: 0
============================================================
```

## Getting NFC Card UIDs

If you're importing students with cards, you need to know their UIDs. Here's how to get them:

### Method 1: Using enroll.py in Simulation Mode

```bash
# Read a card and display its UID
python enroll.py --simulate
# Then tap the card on the reader
```

The UID will be displayed (e.g., `0E39E996`).

### Method 2: Check Existing Cards in Database

```bash
sqlite3 stuco.db "SELECT s.name, c.card_uid FROM students s 
  JOIN cards c ON s.id = c.student_id 
  ORDER BY s.name;"
```

### Method 3: Use NFC Reader Tool

If you have an NFC reader, use the test script:

```bash
python -c "
import nfc
def on_connect(tag):
    print('UID:', tag.identifier.hex().upper())
    return False
clf = nfc.ContactlessFrontend('tty:AMA0:pn532')
clf.connect(rdwr={'on-connect': on_connect})
"
```

### Creating Your CSV with UIDs

Once you have the UIDs, create your CSV:

```csv
name,uid
Ivan Belousov,0E39E996
John Doe,DEADBEEF
Jane Smith,AB12CD34
```

**Tips:**
- UIDs are case-insensitive (will be converted to uppercase)
- UIDs must be hexadecimal (0-9, A-F)
- Leave UID empty if student doesn't have a card yet
- You can add cards later by re-importing with just those rows

## Method 3: Export from Another System and Convert

If you have student data in another format (Excel, Google Sheets, etc.):

### From Excel/Google Sheets

1. Export as CSV
2. Ensure there's a column named `name`
3. Use Method 2 (Python script) above

### From Another Database

```bash
# Example: Export from another SQLite database
sqlite3 other.db "SELECT name FROM students;" > names.txt

# Convert to CSV
echo "name" > students.csv
cat names.txt >> students.csv

# Import
python batch_import_students.py students.csv
```

## Verifying Imports

After importing, verify your students:

```bash
# Count students
sqlite3 stuco.db "SELECT COUNT(*) FROM students;"

# List recent imports
sqlite3 stuco.db "SELECT * FROM students ORDER BY id DESC LIMIT 10;"

# Check students without accounts (should be empty)
sqlite3 stuco.db "SELECT s.* FROM students s 
  LEFT JOIN accounts a ON s.id = a.student_id 
  WHERE a.student_id IS NULL;"
```

## Troubleshooting

### Duplicate Names

By default, the Python script skips duplicates. To see which names are duplicates:

```bash
sqlite3 stuco.db "SELECT name, COUNT(*) FROM students GROUP BY name HAVING COUNT(*) > 1;"
```

### Students Without Accounts

If some students don't have accounts, create them:

```bash
sqlite3 stuco.db "INSERT INTO accounts (student_id, balance, max_overdraft_week)
  SELECT id, 0, 0 FROM students 
  WHERE id NOT IN (SELECT student_id FROM accounts);"
```

### CSV Encoding Issues

If you see weird characters, the CSV might not be UTF-8:

```bash
# Convert to UTF-8
iconv -f ISO-8859-1 -t UTF-8 students_bad.csv > students.csv
```

## Best Practices

1. **Always backup first**: The system automatically backs up, but be safe:
   ```bash
   cp stuco.db stuco.db.backup
   ```

2. **Use dry-run first**: Preview imports before committing:
   ```bash
   python batch_import_students.py --dry-run students.csv
   ```

3. **Validate your CSV**: Check for:
   - Empty names
   - Special characters
   - Correct encoding (UTF-8)

4. **Test with small batch first**: Import 5-10 students first to ensure everything works.

5. **Keep CSV files**: Store your import files for reference and audit purposes.

