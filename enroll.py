import argparse, sqlite3, binascii
from contextlib import contextmanager

DB = "stuco.db"

@contextmanager
def db():
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    try:
        yield con
        con.commit()
    finally:
        con.close()

def read_uid_from_pn532(device):
    import nfc  # pip install nfcpy
    uid_hex = {"val": None}
    def on_connect(tag):
        uid_hex["val"] = binascii.hexlify(tag.identifier).decode().upper()
        return False
    with nfc.ContactlessFrontend(device) as clf:
        print(f"Tap NEW card on {device}…")
        clf.connect(rdwr={'on-connect': on_connect})
    return uid_hex["val"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=False, help="Student name")
    ap.add_argument("--device", default="tty:AMA0:pn532",
                    help="nfcpy device (e.g., tty:AMA0:pn532 or usb:USB0:pn532)")
    ap.add_argument("--simulate", help="Provide UID hex manually (no reader)")
    args = ap.parse_args()

    name = args.name or input("Student name: ").strip()
    uid = args.simulate or read_uid_from_pn532(args.device)
    print("UID:", uid)

    with db() as con:
        cur = con.cursor()
        cur.execute("INSERT OR IGNORE INTO students(name) VALUES (?)", (name,))
        sid = cur.execute("SELECT id FROM students WHERE name=?", (name,)).fetchone()[0]
        cur.execute("INSERT OR IGNORE INTO accounts(student_id) VALUES (?)", (sid,))
        cur.execute("INSERT OR REPLACE INTO cards(card_uid, student_id, status) VALUES (?,?, 'active')",
                    (uid, sid))
    print(f"Enrolled {name} → {uid}")

if __name__ == "__main__":
    main()

