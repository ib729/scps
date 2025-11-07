import argparse, sqlite3, binascii, time
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

DB = "stuco.db"
WEEK_TZ = "Asia/Shanghai"  # weekly overdraft window

def week_start_utc(now_utc: datetime) -> str:
    if ZoneInfo is None:
        weekday = now_utc.weekday()
        start = (now_utc - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start.strftime("%Y-%m-%d %H:%M:%S")
    local = now_utc.astimezone(ZoneInfo(WEEK_TZ))
    weekday = local.weekday()  # Monday=0
    start_local = (local - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc.strftime("%Y-%m-%d %H:%M:%S")

def overdraft_used_this_week(cur, sid: int, week_start: str) -> int:
    row = cur.execute("""SELECT used_fen FROM overdraft_weeks
                         WHERE student_id=? AND week_start_utc=?""",
                      (sid, week_start)).fetchone()
    return row[0] if row else 0

def add_overdraft_usage(cur, sid: int, week_start: str, delta_fen: int):
    cur.execute("""INSERT INTO overdraft_weeks(student_id, week_start_utc, used_fen)
                   VALUES (?,?,?)
                   ON CONFLICT(student_id, week_start_utc)
                   DO UPDATE SET used_fen = used_fen + excluded.used_fen""",
                (sid, week_start, delta_fen))

def charge_by_uid(uid_hex: str, price_fen: int, staff="pos"):
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    cur = con.cursor()

    card = cur.execute("""SELECT c.student_id, a.balance, a.max_overdraft_week_fen
                          FROM cards c JOIN accounts a ON a.student_id=c.student_id
                          WHERE c.card_uid=? AND c.status='active'""", (uid_hex,)).fetchone()
    if not card:
        con.close()
        return False, "Unknown/inactive card"

    sid, bal, max_ov = card
    now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)
    wk_start = week_start_utc(now_utc)

    cur.execute("BEGIN IMMEDIATE;")
    bal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    used_this_week = overdraft_used_this_week(cur, sid, wk_start)
    remaining_ov = max(0, max_ov - used_this_week)

    need_ov = max(0, price_fen - bal)
    if need_ov > remaining_ov:
        con.rollback(); con.close()
        return False, f"Declined: need {need_ov} fen overdraft, only {remaining_ov} fen left this week."

    cur.execute("UPDATE accounts SET balance = balance - ? WHERE student_id=?",
                (price_fen, sid))
    cur.execute("""INSERT INTO transactions
                   (student_id, card_uid, type, amount_fen, overdraft_component_fen, description, staff)
                   VALUES (?,?,?,?,?,?,?)""",
                (sid, uid_hex, 'DEBIT', -price_fen, need_ov, 'purchase', staff))
    if need_ov:
        add_overdraft_usage(cur, sid, wk_start, need_ov)

    con.commit()
    newbal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    con.close()
    return True, f"Charged {price_fen} fen (overdraft used {need_ov} fen). New balance: {newbal} fen."

def read_uid_from_pn532(device):
    import nfc
    uid_hex = {"val": None}
    def on_connect(tag):
        uid_hex["val"] = binascii.hexlify(tag.identifier).decode().upper()
        return False
    with nfc.ContactlessFrontend(device) as clf:
        print(f"Tap card on {device}…")
        clf.connect(rdwr={'on-connect': on_connect})
    return uid_hex["val"]

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("price_cny", type=float, help="price per tap in CNY")
    ap.add_argument("--device", default="tty:AMA0:pn532",
                    help="nfcpy device string (e.g., tty:AMA0:pn532, usb:USB0:pn532)")
    ap.add_argument("--simulate", action="store_true", help="type UIDs manually (no reader)")
    args = ap.parse_args()

    price_fen = int(round(args.price_cny * 100))
    print(f"POS ready. Price per tap: {price_fen} fen. Weekly overdraft quota: 2000 fen.")

    if args.simulate:
        print("Simulation mode. Type UID hex (or 'quit'):")
        while True:
            uid = input("> ").strip()
            if uid.lower() in ("q","quit","exit"): break
            ok, msg = charge_by_uid(uid.upper(), price_fen)
            print(("[OK] " if ok else "[NO] ") + msg)
    else:
        try:
            while True:
                uid = read_uid_from_pn532(args.device)
                ok, msg = charge_by_uid(uid, price_fen)
                print(("[OK] " if ok else "[NO] ") + msg)
                time.sleep(0.8)
        except KeyboardInterrupt:
            pass

