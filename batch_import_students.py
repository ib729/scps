#!/usr/bin/env python3
"""
Batch import students from CSV file.

CSV format:
    name
    John Doe
    Jane Smith
    Alice Johnson
"""

import csv
import sqlite3
import sys
import argparse
from pathlib import Path

DB = "stuco.db"

def batch_import_students(csv_file, skip_duplicates=True, dry_run=False):
    """
    Import students from a CSV file with columns: name
    
    Args:
        csv_file: Path to CSV file
        skip_duplicates: If True, skip existing students. If False, fail on duplicates.
        dry_run: If True, don't actually import, just show what would be done.
    """
    if not Path(csv_file).exists():
        print(f"Error: File '{csv_file}' not found")
        return False
    
    # Read and validate CSV first
    students_to_import = []
    errors = []
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            if 'name' not in reader.fieldnames:
                print("Error: CSV must have a 'name' column")
                print(f"Found columns: {', '.join(reader.fieldnames)}")
                return False
            
            for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
                name = row.get('name', '').strip()
                
                if not name:
                    errors.append(f"Row {row_num}: Missing or empty name")
                    continue
                
                students_to_import.append((row_num, name))
    
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return False
    
    if not students_to_import:
        print("No valid students found in CSV file")
        return False
    
    print(f"Found {len(students_to_import)} students in CSV file")
    if errors:
        print(f"Validation errors: {len(errors)}")
        for error in errors:
            print(f"  - {error}")
        print()
    
    if dry_run:
        print("\n=== DRY RUN MODE - No changes will be made ===\n")
    
    # Connect to database and import
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    cur = con.cursor()
    
    imported = 0
    skipped = 0
    import_errors = []
    
    try:
        for row_num, name in students_to_import:
            try:
                # Check if student already exists
                existing = cur.execute("SELECT id FROM students WHERE name=?", (name,)).fetchone()
                if existing:
                    if skip_duplicates:
                        print(f"⊘ Skipping duplicate: {name} (ID: {existing[0]})")
                        skipped += 1
                        continue
                    else:
                        import_errors.append(f"Row {row_num} ({name}): Student already exists")
                        continue
                
                if dry_run:
                    print(f"[DRY RUN] Would import: {name}")
                    imported += 1
                else:
                    # Insert student and create account in a transaction
                    cur.execute("INSERT INTO students(name) VALUES (?)", (name,))
                    student_id = cur.lastrowid
                    cur.execute(
                        "INSERT INTO accounts(student_id, balance, max_overdraft_week) VALUES (?, 0, 0)", 
                        (student_id,)
                    )
                    print(f"✓ Imported: {name} (ID: {student_id})")
                    imported += 1
                
            except Exception as e:
                import_errors.append(f"Row {row_num} ({name}): {str(e)}")
        
        if not dry_run:
            con.commit()
            print("\nChanges committed to database")
        
    except Exception as e:
        con.rollback()
        print(f"\nDatabase error: {e}")
        print("Changes rolled back")
        return False
    finally:
        con.close()
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"Import Summary:")
    print(f"  {'Would import' if dry_run else 'Imported'}: {imported}")
    print(f"  Skipped (duplicates): {skipped}")
    print(f"  Validation errors: {len(errors)}")
    print(f"  Import errors: {len(import_errors)}")
    
    if import_errors:
        print("\nImport Errors:")
        for error in import_errors:
            print(f"  - {error}")
    
    print(f"{'='*60}")
    
    return len(import_errors) == 0


def generate_template(output_file):
    """Generate a template CSV file"""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("name\n")
        f.write("John Doe\n")
        f.write("Jane Smith\n")
        f.write("Alice Johnson\n")
    print(f"Template CSV created: {output_file}")
    print("Edit this file and add your student names, then run:")
    print(f"  python batch_import_students.py {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Batch import students from CSV file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Import students from CSV
  python batch_import_students.py students.csv
  
  # Generate a template CSV file
  python batch_import_students.py --template students.csv
  
  # Preview import without making changes
  python batch_import_students.py --dry-run students.csv
  
  # Fail on duplicate names instead of skipping
  python batch_import_students.py --no-skip-duplicates students.csv

CSV Format:
  The CSV file must have a 'name' column:
  
  name
  John Doe
  Jane Smith
  Alice Johnson
"""
    )
    
    parser.add_argument(
        'csv_file',
        help='Path to CSV file with student names'
    )
    parser.add_argument(
        '--template',
        action='store_true',
        help='Generate a template CSV file instead of importing'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview import without making changes'
    )
    parser.add_argument(
        '--no-skip-duplicates',
        action='store_true',
        help='Fail on duplicate names instead of skipping them'
    )
    
    args = parser.parse_args()
    
    if args.template:
        generate_template(args.csv_file)
        return
    
    success = batch_import_students(
        args.csv_file,
        skip_duplicates=not args.no_skip_duplicates,
        dry_run=args.dry_run
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

