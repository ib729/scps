import sqlite3, os

DB = "stuco.db"

con = sqlite3.connect(DB)
con.execute("PRAGMA journal_mode=WAL;")   # enables WAL
con.execute("PRAGMA foreign_keys=ON;")
con.execute("PRAGMA busy_timeout=5000;")

with open("schema.sql","r",encoding="utf-8") as f:
    con.executescript(f.read())

con.commit()
con.close()
print("Database initialized at", os.path.abspath(DB))

