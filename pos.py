import argparse, sqlite3, binascii, time
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None  # Python <3.9: fallback uses UTC-week approximation

DB = "stuco.db"
WEEK_TZ = "Asia/Shanghai"  # stable UTC+8, no DST

def week_start_utc(now_utc: datetime) -> str:
    """Return Monday 00:00 of the current week in Asia/Shanghai, converted to UTC (naive string)."""
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
    row = cur.execute("""SELECT used FROM overdraft_weeks
                         WHERE student_id=? AND week_start_utc=?""",
                      (sid, week_start)).fetchone()
    return row[0] if row else 0

def add_overdraft_usage(cur, sid: int, week_start: str, delta: int):
    # UPSERT accumulation of weekly overpay
    cur.execute("""INSERT INTO overdraft_weeks(student_id, week_start_utc, used)
                   VALUES (?,?,?)
                   ON CONFLICT(student_id, week_start_utc)
                   DO UPDATE SET used = used + excluded.used""",
                (sid, week_start, delta))

def charge_by_uid(uid_hex: str, price: float, staff="pos"):
    if price <= 0:
        return False, "Price must be a positive number."
    
    # Convert to tenths (e.g., 5.5 -> 55)
    price_tenths = round(price * 10)

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    cur = con.cursor()

    card = cur.execute("""SELECT c.student_id, a.balance, a.max_overdraft_week
                          FROM cards c JOIN accounts a ON a.student_id=c.student_id
                          WHERE c.card_uid=? AND c.status='active'""", (uid_hex,)).fetchone()
    if not card:
        con.close()
        return False, "Unknown/inactive card"

    sid, bal_tenths, max_ov_tenths = card
    now_utc = datetime.now(timezone.utc) 
    wk_start = week_start_utc(now_utc)

    cur.execute("BEGIN IMMEDIATE;")
    bal_tenths = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    used_this_week_tenths = overdraft_used_this_week(cur, sid, wk_start)
    remaining_ov_tenths = max(0, max_ov_tenths - used_this_week_tenths)

    need_ov_tenths = max(0, price_tenths - bal_tenths)
    if need_ov_tenths > remaining_ov_tenths:
        con.rollback(); con.close()
        need_ov_display = need_ov_tenths / 10.0
        remaining_ov_display = remaining_ov_tenths / 10.0
        return False, f"Declined: need ¥{need_ov_display:.1f} overpay, only ¥{remaining_ov_display:.1f} left this week."

    # Apply debit
    cur.execute("UPDATE accounts SET balance = balance - ? WHERE student_id=?", (price_tenths, sid))
    cur.execute("""INSERT INTO transactions
                   (student_id, card_uid, type, amount, overdraft_component, description, staff)
                   VALUES (?,?,?,?,?,?,?)""",
                (sid, uid_hex, 'DEBIT', -price_tenths, need_ov_tenths, 'purchase', staff))
    tx_id = cur.lastrowid
    if need_ov_tenths:
        add_overdraft_usage(cur, sid, wk_start, need_ov_tenths)

    con.commit()
    newbal_tenths = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    newbal = newbal_tenths / 10.0
    need_ov = need_ov_tenths / 10.0
    con.close()
    return True, f"Charged ¥{price:.1f} (overpay used ¥{need_ov:.1f}). New balance: ¥{newbal:.1f}. TX ID: {tx_id}"

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
    ap.add_argument("price", type=float, help="price per tap in CNY (e.g., 6.5)")
    ap.add_argument("--device", default="tty:AMA0:pn532",
                    help="nfcpy device string (e.g., tty:AMA0:pn532, usb:USB0:pn532)")
    ap.add_argument("--simulate", action="store_true", help="type UIDs manually (no reader)")
    args = ap.parse_args()

    print(f"POS ready. Price per tap: ¥{args.price:.1f}. Weekly overpay quota: ¥20.0 (resets Monday 00:00 Asia/Shanghai).")

    if args.simulate:
        print("Simulation mode. Type UID hex (or 'quit'):")
        while True:
            uid = input("> ").strip()
            if uid.lower() in ("q","quit","exit"): break
            ok, msg = charge_by_uid(uid.upper(), args.price)
            print(("[OK] " if ok else "[NO] ") + msg)
    else:
        try:
            while True:
                uid = read_uid_from_pn532(args.device)
                ok, msg = charge_by_uid(uid, args.price)
                print(("[OK] " if ok else "[NO] ") + msg)
                time.sleep(0.8)
        except KeyboardInterrupt:
            pass

