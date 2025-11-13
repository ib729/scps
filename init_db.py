import sqlite3, os

DB = "stuco.db"
SCHEMA_FILE = "migrations/schema.sql"
BETTER_AUTH_SCHEMA = "web-next/migrations/better_auth_schema.sql"

con = sqlite3.connect(DB)
con.execute("PRAGMA journal_mode=WAL;")   # enable Write-Ahead Logging for smoother writes/reads
con.execute("PRAGMA foreign_keys=ON;")    # enforce FK relations
con.execute("PRAGMA busy_timeout=5000;")  # handle brief contention politely

# Load main schema
with open(SCHEMA_FILE,"r",encoding="utf-8") as f:
    con.executescript(f.read())

# Load Better Auth schema
if os.path.exists(BETTER_AUTH_SCHEMA):
    with open(BETTER_AUTH_SCHEMA,"r",encoding="utf-8") as f:
        con.executescript(f.read())
    print("✓ Better Auth schema applied")
else:
    print("⚠ Better Auth schema not found, skipping")

con.commit()
con.close()
print("Database initialized at", os.path.abspath(DB))
print("✓ Main schema applied")

