import argparse, sqlite3

DB = "stuco.db"

def topup(uid_hex: str, amount_fen: int, staff="admin"):
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    cur = con.cursor()

    row = cur.execute("SELECT student_id FROM cards WHERE card_uid=? AND status='active'", (uid_hex,)).fetchone()
    if not row:
        print("Card not found or inactive.")
        return
    sid = row[0]

    cur.execute("BEGIN IMMEDIATE;")  # atomic
    cur.execute("UPDATE accounts SET balance = balance + ? WHERE student_id=?",
                (amount_fen, sid))
    cur.execute("""INSERT INTO transactions(student_id, card_uid, type, amount_fen, description, staff)
                   VALUES (?,?,?,?,?,?)""",
                (sid, uid_hex, 'TOPUP', amount_fen, 'manual top-up', staff))
    con.commit()
    newbal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    con.close()
    print(f"Topped up {amount_fen} fen. New balance: {newbal} fen.")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("uid", help="Card UID hex")
    ap.add_argument("amount_cny", type=float, help="Amount in CNY")
    ap.add_argument("--staff", default="admin")
    args = ap.parse_args()
    topup(args.uid.upper(), int(round(args.amount_cny*100)), args.staff)

