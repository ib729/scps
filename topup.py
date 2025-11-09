import argparse, sqlite3

DB = "stuco.db"

def topup(uid_hex: str, amount: float, staff="admin"):
    if amount <= 0:
        print("Amount must be a positive number.")
        return
    
    # Convert to tenths (e.g., 5.5 -> 55)
    amount_tenths = round(amount * 10)

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
    cur.execute("UPDATE accounts SET balance = balance + ? WHERE student_id=?", (amount_tenths, sid))
    cur.execute("""INSERT INTO transactions(student_id, card_uid, type, amount, description, staff)
                   VALUES (?,?,?,?,?,?)""",
                (sid, uid_hex, 'TOPUP', amount_tenths, 'manual top-up', staff))
    tx_id = cur.lastrowid
    con.commit()
    newbal_tenths = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    newbal = newbal_tenths / 10.0
    con.close()
    print(f"Topped up ¥{amount:.1f}. New balance: ¥{newbal:.1f}. TX ID: {tx_id}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("uid", help="Card UID hex")
    ap.add_argument("amount", type=float, help="Amount in CNY (e.g., 20.5 = ¥20.5)")
    ap.add_argument("--staff", default="admin")
    args = ap.parse_args()
    topup(args.uid.upper(), args.amount, args.staff)

