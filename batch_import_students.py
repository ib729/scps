#!/usr/bin/env python3
"""
Batch import students from CSV file.

CSV format:
    name,uid
    John Doe,DEADBEEF
    Jane Smith,0E39E996
    Alice Johnson,

Or without UIDs:
    name
    John Doe
    Jane Smith
"""

import csv
import sqlite3
import sys
import argparse
from pathlib import Path

DB = "stuco.db"

def batch_import_students(csv_file, skip_duplicates=True, dry_run=False):
    """
    Import students from a CSV file with columns: name, uid (optional)
    
    Args:
        csv_file: Path to CSV file
        skip_duplicates: If True, skip existing students. If False, fail on duplicates.
        dry_run: If True, don't actually import, just show what would be done.
    
    CSV Format:
        name,uid
        John Doe,DEADBEEF
        Jane Smith,0E39E996
        Alice Johnson,
        
    Or without UIDs:
        name
        John Doe
        Jane Smith
    """
    if not Path(csv_file).exists():
        print(f"Error: File '{csv_file}' not found")
        return False
    
    # Read and validate CSV first
    students_to_import = []
    errors = []
    has_uid_column = False
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            if 'name' not in reader.fieldnames:
                print("Error: CSV must have a 'name' column")
                print(f"Found columns: {', '.join(reader.fieldnames)}")
                return False
            
            # Check if UID column exists
            has_uid_column = 'uid' in reader.fieldnames
            if has_uid_column:
                print("UID column detected - will import cards with students")
            
            for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
                name = row.get('name', '').strip()
                uid = row.get('uid', '').strip().upper() if has_uid_column else None
                
                if not name:
                    errors.append(f"Row {row_num}: Missing or empty name")
                    continue
                
                # Validate UID if provided
                if uid:
                    # Basic hex validation (allow alphanumeric for hex UIDs)
                    if not all(c in '0123456789ABCDEF' for c in uid):
                        errors.append(f"Row {row_num} ({name}): Invalid UID format '{uid}' (must be hex)")
                        continue
                    if len(uid) < 4 or len(uid) > 20:
                        errors.append(f"Row {row_num} ({name}): UID length invalid '{uid}' (expected 4-20 chars)")
                        continue
                
                students_to_import.append((row_num, name, uid))
    
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
    cards_created = 0
    import_errors = []
    
    try:
        for row_num, name, uid in students_to_import:
            try:
                # Check if student already exists
                existing = cur.execute("SELECT id FROM students WHERE name=?", (name,)).fetchone()
                if existing:
                    if skip_duplicates:
                        student_id = existing[0]
                        
                        # If UID provided, try to add card for existing student
                        if uid and not dry_run:
                            try:
                                # Check if UID already exists
                                existing_card = cur.execute(
                                    "SELECT student_id FROM cards WHERE card_uid=?", 
                                    (uid,)
                                ).fetchone()
                                
                                if existing_card:
                                    if existing_card[0] == student_id:
                                        print(f"⊘ Skipping duplicate student with existing card: {name} (ID: {student_id})")
                                    else:
                                        print(f"⚠ Skipping {name}: Card {uid} already assigned to student ID {existing_card[0]}")
                                else:
                                    # Add card to existing student
                                    cur.execute(
                                        "INSERT INTO cards(card_uid, student_id, status) VALUES (?, ?, 'active')",
                                        (uid, student_id)
                                    )
                                    cards_created += 1
                                    print(f"⊕ Added card to existing student: {name} (ID: {student_id}) → {uid}")
                            except Exception as card_error:
                                print(f"⚠ Could not add card for {name}: {card_error}")
                        else:
                            print(f"⊘ Skipping duplicate: {name} (ID: {student_id})")
                        
                        skipped += 1
                        continue
                    else:
                        import_errors.append(f"Row {row_num} ({name}): Student already exists")
                        continue
                
                # Check if UID is already in use
                if uid:
                    existing_card = cur.execute(
                        "SELECT student_id FROM cards WHERE card_uid=?", 
                        (uid,)
                    ).fetchone()
                    if existing_card:
                        import_errors.append(
                            f"Row {row_num} ({name}): Card UID {uid} already assigned to student ID {existing_card[0]}"
                        )
                        continue
                
                if dry_run:
                    uid_info = f" → {uid}" if uid else ""
                    print(f"[DRY RUN] Would import: {name}{uid_info}")
                    imported += 1
                    if uid:
                        cards_created += 1
                else:
                    # Insert student and create account
                    cur.execute("INSERT INTO students(name) VALUES (?)", (name,))
                    student_id = cur.lastrowid
                    cur.execute(
                        "INSERT INTO accounts(student_id, balance, max_overdraft_week) VALUES (?, 0, 0)", 
                        (student_id,)
                    )
                    
                    # If UID provided, create card entry
                    if uid:
                        cur.execute(
                            "INSERT INTO cards(card_uid, student_id, status) VALUES (?, ?, 'active')",
                            (uid, student_id)
                        )
                        cards_created += 1
                        print(f"✓ Imported: {name} (ID: {student_id}) → {uid}")
                    else:
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
    if has_uid_column:
        print(f"  {'Would create' if dry_run else 'Cards created'}: {cards_created}")
    print(f"  Skipped (duplicates): {skipped}")
    print(f"  Validation errors: {len(errors)}")
    print(f"  Import errors: {len(import_errors)}")
    
    if import_errors:
        print("\nImport Errors:")
        for error in import_errors:
            print(f"  - {error}")
    
    print(f"{'='*60}")
    
    return len(import_errors) == 0


def generate_template(output_file, include_uid=False):
    """Generate a template CSV file"""
    with open(output_file, 'w', encoding='utf-8') as f:
        if include_uid:
            f.write("name,uid\n")
            f.write("John Doe,DEADBEEF\n")
            f.write("Jane Smith,0E39E996\n")
            f.write("Alice Johnson,\n")
        else:
            f.write("name\n")
            f.write("John Doe\n")
            f.write("Jane Smith\n")
            f.write("Alice Johnson\n")
    
    uid_note = " (with UID column)" if include_uid else ""
    print(f"Template CSV created{uid_note}: {output_file}")
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
  
  # Import students with NFC card UIDs
  python batch_import_students.py students_with_cards.csv
  
  # Generate a template CSV file
  python batch_import_students.py --template students.csv
  
  # Generate template with UID column
  python batch_import_students.py --template --with-uid students_with_cards.csv
  
  # Preview import without making changes
  python batch_import_students.py --dry-run students.csv
  
  # Fail on duplicate names instead of skipping
  python batch_import_students.py --no-skip-duplicates students.csv

CSV Format:
  Basic format (name only):
    name
    John Doe
    Jane Smith
  
  With NFC card UIDs:
    name,uid
    John Doe,DEADBEEF
    Jane Smith,0E39E996
    Alice Johnson,
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
        '--with-uid',
        action='store_true',
        help='Include UID column in template (use with --template)'
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
        generate_template(args.csv_file, include_uid=args.with_uid)
        return
    
    success = batch_import_students(
        args.csv_file,
        skip_duplicates=not args.no_skip_duplicates,
        dry_run=args.dry_run
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

