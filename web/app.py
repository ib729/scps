from pathlib import Path
import os, sqlite3
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify

APP_TZ = ZoneInfo("Asia/Shanghai")  # display + weekly windows
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = str(BASE.parent / "stuco.db") 

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("STUCO_SECRET", "change-me")  # set a real secret in env
app.config["DATABASE"] = DB_PATH

# ---------- DB helpers ----------
def db():
    con = sqlite3.connect(app.config["DATABASE"])
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON;")
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA busy_timeout=5000;")
    return con

def week_start_utc(now_utc: datetime) -> str:
    """Return Monday 00:00 Asia/Shanghai, converted to UTC (YYYY-mm-dd HH:MM:SS)."""
    local = now_utc.astimezone(APP_TZ)
    weekday = local.weekday()              # Monday=0
    start_local = (local - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc.strftime("%Y-%m-%d %H:%M:%S")

# ---------- Business logic ----------
def overdraft_used_this_week(cur, sid: int, week_start: str) -> int:
    row = cur.execute("""SELECT used FROM overdraft_weeks
                         WHERE student_id=? AND week_start_utc=?""", (sid, week_start)).fetchone()
    return row[0] if row else 0

def add_overdraft_usage(cur, sid: int, week_start: str, delta: int):
    cur.execute("""INSERT INTO overdraft_weeks(student_id, week_start_utc, used)
                   VALUES (?,?,?)
                   ON CONFLICT(student_id, week_start_utc)
                   DO UPDATE SET used = used + excluded.used""",
                (sid, week_start, delta))

def charge_by_uid(uid_hex: str, price: int, staff="webpos"):
    con = db(); cur = con.cursor()
    card = cur.execute("""SELECT c.student_id, a.balance, a.max_overdraft_week
                          FROM cards c JOIN accounts a ON a.student_id=c.student_id
                          WHERE c.card_uid=? AND c.status='active'""", (uid_hex,)).fetchone()
    if not card:
        con.close(); return False, "Unknown/inactive card"

    sid, bal, max_ov = card
    now_utc = datetime.now(timezone.utc)
    wk_start = week_start_utc(now_utc)

    cur.execute("BEGIN IMMEDIATE;")
    bal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    used_this_week = overdraft_used_this_week(cur, sid, wk_start)
    remaining_ov = max(0, max_ov - used_this_week)

    need_ov = max(0, price - bal)
    if need_ov > remaining_ov:
        con.rollback(); con.close()
        return False, f"Declined: need ¥{need_ov} overpay, only ¥{remaining_ov} left this week."

    cur.execute("UPDATE accounts SET balance = balance - ? WHERE student_id=?", (price, sid))
    cur.execute("""INSERT INTO transactions
                   (student_id, card_uid, type, amount, overdraft_component, description, staff)
                   VALUES (?,?,?,?,?,?,?)""",
                (sid, uid_hex, 'DEBIT', -price, need_ov, 'purchase', staff))
    if need_ov:
        add_overdraft_usage(cur, sid, wk_start, need_ov)

    con.commit()
    newbal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    con.close()
    return True, f"Charged ¥{price} (overpay used ¥{need_ov}). New balance: ¥{newbal}."

def topup_by_uid(uid_hex: str, amount: int, staff="web"):
    con = db(); cur = con.cursor()
    row = cur.execute("SELECT student_id FROM cards WHERE card_uid=? AND status='active'",
                      (uid_hex,)).fetchone()
    if not row:
        con.close(); return False, "Card not found or inactive."
    sid = row[0]
    cur.execute("BEGIN IMMEDIATE;")
    cur.execute("UPDATE accounts SET balance = balance + ? WHERE student_id=?", (amount, sid))
    cur.execute("""INSERT INTO transactions(student_id, card_uid, type, amount, description, staff)
                   VALUES (?,?,?,?,?,?)""",
                (sid, uid_hex, 'TOPUP', amount, 'manual top-up', staff))
    con.commit()
    newbal = cur.execute("SELECT balance FROM accounts WHERE student_id=?", (sid,)).fetchone()[0]
    con.close()
    return True, f"Topped up ¥{amount}. New balance: ¥{newbal}."

# ---------- Jinja filters ----------
def fmt_ts_zh(dt_str: str):
    """Render 'YYYY-mm-dd HH:MM:SS' (UTC) as Asia/Shanghai local string."""
    if not dt_str: return ""
    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    return dt.astimezone(APP_TZ).strftime("%Y-%m-%d %H:%M")
app.jinja_env.filters["fmt_ts"] = fmt_ts_zh

# ---------- Routes ----------
@app.route("/")
def dashboard():
    con = db(); cur = con.cursor()
    # Last 20 transactions (display local time in template)
    tx = cur.execute("""SELECT t.*, s.name
                        FROM transactions t
                        JOIN students s ON s.id=t.student_id
                        ORDER BY t.id DESC LIMIT 20""").fetchall()
    # Simple total for today (Shanghai local day)
    today_start_local = datetime.now(APP_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_local.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    totals = cur.execute("""SELECT
                              SUM(CASE WHEN type='TOPUP' THEN amount ELSE 0 END) AS topups,
                              SUM(CASE WHEN type='DEBIT' THEN -amount ELSE 0 END) AS sales
                            FROM transactions
                            WHERE created_at >= ?""", (today_start_utc,)).fetchone()
    con.close()
    return render_template("dashboard.html", tx=tx, totals=totals)

@app.route("/pos", methods=["GET","POST"])
def pos():
    message = None
    if request.method == "POST":
        uid = request.form.get("uid","").strip().upper()
        try:
            price = int(request.form.get("price","0"))
        except ValueError:
            price = 0
        if not uid or price <= 0:
            flash("Enter UID and a positive price.", "danger")
        else:
            ok, msg = charge_by_uid(uid, price, staff="webpos")
            flash(msg, "success" if ok else "danger")
            message = msg
    return render_template("pos.html")

@app.route("/topup", methods=["GET","POST"])
def topup():
    if request.method == "POST":
        uid = request.form.get("uid","").strip().upper()
        try:
            amount = int(request.form.get("amount","0"))
        except ValueError:
            amount = 0
        if not uid or amount <= 0:
            flash("Enter UID and a positive amount.", "danger")
        else:
            ok, msg = topup_by_uid(uid, amount, staff="web")
            flash(msg, "success" if ok else "danger")
    return render_template("topup.html")

@app.route("/enroll", methods=["GET","POST"])
def enroll():
    if request.method == "POST":
        name = request.form.get("name","").strip()
        uid  = request.form.get("uid","").strip().upper()
        if not name or not uid:
            flash("Name and UID required.", "danger")
        else:
            con = db(); cur = con.cursor()
            cur.execute("INSERT OR IGNORE INTO students(name) VALUES (?)", (name,))
            sid = cur.execute("SELECT id FROM students WHERE name=?", (name,)).fetchone()[0]
            cur.execute("INSERT OR IGNORE INTO accounts(student_id) VALUES (?)", (sid,))
            cur.execute("INSERT OR REPLACE INTO cards(card_uid, student_id, status) VALUES (?,?, 'active')",
                        (uid, sid))
            con.commit(); con.close()
            flash(f"Enrolled {name} → {uid}", "success")
            return redirect(url_for("students"))
    return render_template("enroll.html")

@app.route("/students")
def students():
    q = request.args.get("q","").strip()
    con = db(); cur = con.cursor()
    if q:
        rows = cur.execute("""SELECT s.id, s.name, a.balance,
                                     (SELECT card_uid FROM cards WHERE student_id=s.id AND status='active') AS uid
                              FROM students s JOIN accounts a ON a.student_id=s.id
                              WHERE s.name LIKE ? ORDER BY s.name""", (f"%{q}%",)).fetchall()
    else:
        rows = cur.execute("""SELECT s.id, s.name, a.balance,
                                     (SELECT card_uid FROM cards WHERE student_id=s.id AND status='active') AS uid
                              FROM students s JOIN accounts a ON a.student_id=s.id
                              ORDER BY s.name LIMIT 100""").fetchall()
    con.close()
    return render_template("students.html", rows=rows, q=q)

@app.route("/student/<int:sid>")
def student_detail(sid):
    con = db(); cur = con.cursor()
    stu = cur.execute("""SELECT s.id, s.name, a.balance, a.max_overdraft_week,
                                (SELECT card_uid FROM cards WHERE student_id=s.id AND status='active') AS uid
                         FROM students s JOIN accounts a ON a.student_id=s.id
                         WHERE s.id=?""", (sid,)).fetchone()
    tx = cur.execute("""SELECT type, amount, overdraft_component, created_at
                        FROM transactions WHERE student_id=?
                        ORDER BY id DESC LIMIT 50""", (sid,)).fetchall()
    con.close()
    return render_template("student.html", stu=stu, tx=tx)

@app.route("/transactions")
def transactions():
    try:
        limit = max(1, min(500, int(request.args.get("limit","100"))))
    except ValueError:
        limit = 100
    con = db(); cur = con.cursor()
    tx = cur.execute("""SELECT t.*, s.name
                        FROM transactions t JOIN students s ON s.id=t.student_id
                        ORDER BY t.id DESC LIMIT ?""", (limit,)).fetchall()
    con.close()
    return render_template("transactions.html", tx=tx, limit=limit)

# --- optional API endpoints you can call from scripts or a PN532 bridge ---
@app.post("/api/charge")
def api_charge():
    data = request.get_json(force=True, silent=True) or {}
    uid = (data.get("uid","") or "").upper(); price = int(data.get("price", 0))
    ok, msg = charge_by_uid(uid, price, staff=data.get("staff","api"))
    return jsonify({"ok": ok, "message": msg})

@app.post("/api/topup")
def api_topup():
    data = request.get_json(force=True, silent=True) or {}
    uid = (data.get("uid","") or "").upper(); amount = int(data.get("amount", 0))
    ok, msg = topup_by_uid(uid, amount, staff=data.get("staff","api"))
    return jsonify({"ok": ok, "message": msg})

if __name__ == "__main__":
    # Flask dev server for local use; for production use Gunicorn or another WSGI server. :contentReference[oaicite:5]{index=5}
    app.run(host="0.0.0.0", port=5000, debug=False)

