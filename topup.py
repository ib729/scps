import argparse, sqlite3

DB = "stuco.db"

def topup(uid_hex: str, amount: int, staff="admin"):
    if amount <= 0:
        print("Amount must be a positive integer CNY.")
        return

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    cur = con.cursor()

    row = cur.execute("SELECT student_id FROM cards WHERE card_uid=? AND status='active'", (uid_hex,)).fetchone()
    if not row:
        print("Card not found or inactive.")
        return
    sid = row[0]

    cur.execute("BEGIN IMMEDIATE;")  # atomic top-up + log
    cur.execute("UPDATE accounts SET balance = balance + ? WHERE student_id=?", (amount, sid))
    cur.execute("""INSERT INTO transactions(student_id, card_uid, type, amount, description, staff)
                   VALUES (?,?,?,?,?,?)""",
                (sid, uid_hex, 'TOPUP', amount, 'manual top-up', staff))
    tx_id = cur.lastrowid
    con.commit()
    newbal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    con.close()
    print(f"Topped up ¥{amount}. New balance: ¥{newbal}. TX ID: {tx_id}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("uid", help="Card UID hex")
    ap.add_argument("amount", type=int, help="Whole CNY (e.g., 20 = ¥20)")
    ap.add_argument("--staff", default="admin")
    args = ap.parse_args()
    topup(args.uid.upper(), args.amount, args.staff)

