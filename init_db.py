import sqlite3, os

DB = "stuco.db"

con = sqlite3.connect(DB)
con.execute("PRAGMA journal_mode=WAL;")   # enable Write-Ahead Logging for smoother writes/reads
con.execute("PRAGMA foreign_keys=ON;")    # enforce FK relations
con.execute("PRAGMA busy_timeout=5000;")  # handle brief contention politely

with open("schema.sql","r",encoding="utf-8") as f:
    con.executescript(f.read())

con.commit()
con.close()
print("Database initialized at", os.path.abspath(DB))

