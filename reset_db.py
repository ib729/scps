#!/usr/bin/env python3
"""
Database Reset Script for Production
Backs up existing database and creates a fresh one with the schema.
"""

import sqlite3
import os
import shutil
from datetime import datetime
from getpass import getpass
import hashlib

DB_FILE = "stuco.db"
DB_WAL = "stuco.db-wal"
DB_SHM = "stuco.db-shm"
SCHEMA_FILE = "schema.sql"
BACKUP_DIR = "db_backups"

def hash_password(password):
    """Simple password hashing (consider using bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()

def backup_database():
    """Backup existing database files if they exist"""
    if not os.path.exists(DB_FILE):
        print("No existing database to backup.")
        return None
    
    # Create backup directory if it doesn't exist
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    # Create timestamped backup
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"stuco_backup_{timestamp}.db")
    
    print(f"Backing up database to: {backup_path}")
    shutil.copy2(DB_FILE, backup_path)
    
    return backup_path

def remove_database_files():
    """Remove all database files (main DB, WAL, SHM)"""
    files_removed = []
    
    for db_file in [DB_FILE, DB_WAL, DB_SHM]:
        if os.path.exists(db_file):
            print(f"Removing: {db_file}")
            os.remove(db_file)
            files_removed.append(db_file)
    
    if not files_removed:
        print("No database files to remove.")
    
    return files_removed

def initialize_database():
    """Create fresh database with schema"""
    if not os.path.exists(SCHEMA_FILE):
        raise FileNotFoundError(f"Schema file not found: {SCHEMA_FILE}")
    
    print(f"Creating new database: {DB_FILE}")
    
    con = sqlite3.connect(DB_FILE)
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        con.executescript(f.read())
    
    con.commit()
    return con

def create_admin_user(con, name, email, password):
    """Create an admin user account"""
    password_hash = hash_password(password)
    
    try:
        con.execute("""
            INSERT INTO users (name, email, password_hash, avatar)
            VALUES (?, ?, ?, ?)
        """, (name, email, password_hash, None))
        con.commit()
        print(f"✓ Admin user created: {email}")
        return True
    except sqlite3.IntegrityError:
        print(f"✗ User with email {email} already exists")
        return False

def main():
    print("=" * 60)
    print("STUCO Database Reset Script")
    print("=" * 60)
    print()
    
    # Confirm action
    print("⚠️  WARNING: This will DELETE all existing data!")
    print("   A backup will be created in the 'db_backups' folder.")
    print()
    confirmation = input("Type 'RESET' to confirm: ")
    
    if confirmation != "RESET":
        print("Reset cancelled.")
        return
    
    print()
    print("-" * 60)
    print("Step 1: Backing up existing database")
    print("-" * 60)
    backup_path = backup_database()
    if backup_path:
        print(f"✓ Backup created: {backup_path}")
    print()
    
    print("-" * 60)
    print("Step 2: Removing old database files")
    print("-" * 60)
    remove_database_files()
    print()
    
    print("-" * 60)
    print("Step 3: Creating fresh database")
    print("-" * 60)
    con = initialize_database()
    print(f"✓ Database created: {os.path.abspath(DB_FILE)}")
    print()
    
    print("-" * 60)
    print("Step 4: Create admin user (optional)")
    print("-" * 60)
    create_user = input("Create an admin user? (y/n): ").lower().strip()
    
    if create_user == 'y':
        print()
        name = input("Admin name: ").strip()
        email = input("Admin email: ").strip()
        password = getpass("Admin password: ")
        password_confirm = getpass("Confirm password: ")
        
        if password != password_confirm:
            print("✗ Passwords don't match. Skipping user creation.")
        elif not name or not email or not password:
            print("✗ All fields are required. Skipping user creation.")
        else:
            create_admin_user(con, name, email, password)
    
    con.close()
    
    print()
    print("=" * 60)
    print("✓ Database reset complete!")
    print("=" * 60)
    print()
    print("Your database is now ready for production.")
    print(f"Backup location: {BACKUP_DIR}/")
    print()

if __name__ == "__main__":
    main()

