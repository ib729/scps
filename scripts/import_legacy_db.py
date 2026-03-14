#!/usr/bin/env python3
"""
Replace the current STUCO database with a migrated legacy database.

The legacy database is treated as the source of truth. This script:
- snapshots the legacy SQLite database (including WAL-backed state)
- backs up the current target database
- builds a fresh target database on the current schema
- imports Better Auth tables and operational data
- migrates tenths-of-CNY values to cents
- extracts payment_method from legacy TOPUP descriptions where possible
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DB = REPO_ROOT / "IMPORTTHIS" / "stuco.db"
DEFAULT_TARGET_DB = REPO_ROOT / "stuco.db"
BACKUP_DIR = REPO_ROOT / "db_backups"
SCHEMA_FILE = REPO_ROOT / "migrations" / "schema.sql"
BETTER_AUTH_SCHEMA_FILE = REPO_ROOT / "web-next" / "migrations" / "better_auth_schema.sql"

TOPUP_PAYMENT_METHOD_FALLBACK = "WeChat"


def sqlite_connect(path: Path, *, readonly: bool = False) -> sqlite3.Connection:
    if readonly:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    else:
        conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


def backup_database(source_path: Path, backup_path: Path) -> None:
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite_connect(source_path) as source_conn, sqlite_connect(backup_path) as backup_conn:
        source_conn.backup(backup_conn)


def snapshot_database(source_path: Path, prefix: str) -> Path:
    fd, temp_name = tempfile.mkstemp(prefix=prefix, suffix=".db")
    os.close(fd)
    snapshot_path = Path(temp_name)
    backup_database(source_path, snapshot_path)
    return snapshot_path


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
        """,
        (table_name,),
    ).fetchone()
    return row is not None


def get_table_columns(conn: sqlite3.Connection, table_name: str) -> list[str]:
    return [row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})")]


def load_current_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))
    conn.executescript(BETTER_AUTH_SCHEMA_FILE.read_text(encoding="utf-8"))

    student_columns = set(get_table_columns(conn, "students"))
    if "archived" not in student_columns:
        conn.execute("ALTER TABLE students ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")

    transaction_columns = set(get_table_columns(conn, "transactions"))
    if "payment_method" not in transaction_columns:
        conn.execute("ALTER TABLE transactions ADD COLUMN payment_method TEXT")

    user_columns = set(get_table_columns(conn, "user"))
    if "role" not in user_columns:
        conn.execute(
            "ALTER TABLE user ADD COLUMN role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff'))"
        )

    conn.execute(
        """
        INSERT INTO app_meta(key, value)
        VALUES ('currency_scale', '100')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """
    )

    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_tx_student_time
          ON transactions(student_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_transactions_created_at
          ON transactions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_transactions_type_created_at
          ON transactions(type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_transactions_student_id_created_at
          ON transactions(student_id, created_at DESC);
        """
    )


def normalize_description(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip()


def infer_topup_payment_method(description: str | None) -> tuple[str, str | None]:
    raw_description = normalize_description(description)
    if not raw_description:
        return TOPUP_PAYMENT_METHOD_FALLBACK, None

    lowered = raw_description.lower()
    payment_method = TOPUP_PAYMENT_METHOD_FALLBACK
    cleaned = raw_description

    if "wechat" in lowered:
        payment_method = "WeChat"
        cleaned = re.sub(
            r"^\s*wechat(?:\s+pay)?(?:\s+to\s+[^\n.]+)?[\s.:,-]*",
            "",
            raw_description,
            flags=re.IGNORECASE,
        )
    elif "alipay" in lowered:
        payment_method = "Alipay"
        cleaned = re.sub(
            r"^\s*alipay[\s.:,-]*",
            "",
            raw_description,
            flags=re.IGNORECASE,
        )
    elif "cash" in lowered:
        payment_method = "Cash"
        cleaned = re.sub(
            r"^\s*cash[\s.:,-]*",
            "",
            raw_description,
            flags=re.IGNORECASE,
        )
    elif "bitcoin" in lowered or re.search(r"\bbtc\b", lowered):
        payment_method = "Bitcoin"
        cleaned = re.sub(
            r"^\s*(?:bitcoin|btc)[\s.:,-]*",
            "",
            raw_description,
            flags=re.IGNORECASE,
        )

    cleaned = cleaned.strip(" \n\r\t.:,-")
    if not cleaned:
        cleaned = None

    if payment_method == TOPUP_PAYMENT_METHOD_FALLBACK:
        return payment_method, raw_description

    return payment_method, cleaned


def copy_auth_tables(source_conn: sqlite3.Connection, target_conn: sqlite3.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}

    user_columns = set(get_table_columns(source_conn, "user")) if table_exists(source_conn, "user") else set()
    if user_columns:
        rows = source_conn.execute(
            "SELECT id, name, email, emailVerified, image, createdAt, updatedAt FROM user ORDER BY createdAt, id"
        ).fetchall()
        target_conn.executemany(
            """
            INSERT INTO user (id, name, email, emailVerified, image, role, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    row["id"],
                    row["name"],
                    row["email"],
                    row["emailVerified"],
                    row["image"],
                    "staff",
                    row["createdAt"],
                    row["updatedAt"],
                )
                for row in rows
            ],
        )
        counts["user"] = len(rows)
    else:
        counts["user"] = 0

    for table_name, ordered_columns in (
        (
            "account",
            [
                "id",
                "userId",
                "accountId",
                "providerId",
                "accessToken",
                "refreshToken",
                "accessTokenExpiresAt",
                "refreshTokenExpiresAt",
                "expiresAt",
                "scope",
                "idToken",
                "password",
                "createdAt",
                "updatedAt",
            ],
        ),
        (
            "session",
            ["id", "userId", "token", "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt"],
        ),
        (
            "verification",
            None,
        ),
    ):
        if not table_exists(source_conn, table_name) or not table_exists(target_conn, table_name):
            counts[table_name] = 0
            continue

        source_columns = get_table_columns(source_conn, table_name)
        target_columns = get_table_columns(target_conn, table_name)
        if ordered_columns is None:
            columns = [column for column in source_columns if column in target_columns]
        else:
            columns = [column for column in ordered_columns if column in source_columns and column in target_columns]

        select_sql = f"SELECT {', '.join(columns)} FROM {table_name}"
        rows = source_conn.execute(select_sql).fetchall()
        placeholders = ", ".join(["?"] * len(columns))
        insert_sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
        target_conn.executemany(
            insert_sql,
            [tuple(row[column] for column in columns) for row in rows],
        )
        counts[table_name] = len(rows)

    return counts


def import_students(source_conn: sqlite3.Connection, target_conn: sqlite3.Connection) -> int:
    rows = source_conn.execute("SELECT id, name FROM students ORDER BY id").fetchall()
    target_conn.executemany(
        "INSERT INTO students (id, name, archived) VALUES (?, ?, 0)",
        [(row["id"], row["name"],) for row in rows],
    )
    return len(rows)


def import_accounts(source_conn: sqlite3.Connection, target_conn: sqlite3.Connection) -> int:
    rows = source_conn.execute(
        "SELECT student_id, balance, max_overdraft_week FROM accounts ORDER BY student_id"
    ).fetchall()
    target_conn.executemany(
        """
        INSERT INTO accounts (student_id, balance, max_overdraft_week)
        VALUES (?, ?, ?)
        """,
        [
            (
                row["student_id"],
                int(row["balance"]) * 10,
                int(row["max_overdraft_week"]) * 10,
            )
            for row in rows
        ],
    )
    return len(rows)


def import_cards(source_conn: sqlite3.Connection, target_conn: sqlite3.Connection) -> int:
    rows = source_conn.execute(
        "SELECT card_uid, student_id, status, issued_at FROM cards ORDER BY card_uid"
    ).fetchall()
    target_conn.executemany(
        """
        INSERT INTO cards (card_uid, student_id, status, issued_at)
        VALUES (?, ?, ?, ?)
        """,
        [(row["card_uid"], row["student_id"], row["status"], row["issued_at"]) for row in rows],
    )
    return len(rows)


def import_overdraft_weeks(source_conn: sqlite3.Connection, target_conn: sqlite3.Connection) -> int:
    rows = source_conn.execute(
        "SELECT student_id, week_start_utc, used FROM overdraft_weeks ORDER BY student_id, week_start_utc"
    ).fetchall()
    target_conn.executemany(
        """
        INSERT INTO overdraft_weeks (student_id, week_start_utc, used)
        VALUES (?, ?, ?)
        """,
        [(row["student_id"], row["week_start_utc"], int(row["used"]) * 10) for row in rows],
    )
    return len(rows)


def import_transactions(source_conn: sqlite3.Connection, target_conn: sqlite3.Connection) -> dict[str, int]:
    rows = source_conn.execute(
        """
        SELECT
          id,
          student_id,
          card_uid,
          type,
          amount,
          overdraft_component,
          description,
          staff,
          created_at
        FROM transactions
        ORDER BY id
        """
    ).fetchall()

    inferred_counts = {
        "WeChat": 0,
        "Alipay": 0,
        "Cash": 0,
        "Bitcoin": 0,
        TOPUP_PAYMENT_METHOD_FALLBACK: 0,
    }

    payload = []
    for row in rows:
        payment_method = None
        description = normalize_description(row["description"]) or None

        if row["type"] == "TOPUP":
            payment_method, description = infer_topup_payment_method(row["description"])
            inferred_counts[payment_method] = inferred_counts.get(payment_method, 0) + 1

        payload.append(
            (
                row["id"],
                row["student_id"],
                row["card_uid"],
                row["type"],
                int(row["amount"]) * 10,
                int(row["overdraft_component"]) * 10,
                payment_method,
                description,
                row["staff"],
                row["created_at"],
            )
        )

    target_conn.executemany(
        """
        INSERT INTO transactions (
          id,
          student_id,
          card_uid,
          type,
          amount,
          overdraft_component,
          payment_method,
          description,
          staff,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        payload,
    )
    return {"total": len(rows), **inferred_counts}


def set_sequences(conn: sqlite3.Connection) -> None:
    max_student_id = conn.execute("SELECT COALESCE(MAX(id), 0) AS value FROM students").fetchone()["value"]
    max_transaction_id = conn.execute("SELECT COALESCE(MAX(id), 0) AS value FROM transactions").fetchone()["value"]

    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('students', 'transactions')")
    conn.executemany(
        "INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)",
        [
            ("students", max_student_id),
            ("transactions", max_transaction_id),
        ],
    )


def ensure_admin_role(conn: sqlite3.Connection) -> None:
    if not table_exists(conn, "user"):
        return

    admin_count = conn.execute(
        "SELECT COUNT(*) AS count FROM user WHERE role = 'admin'"
    ).fetchone()["count"]
    if admin_count:
        return

    first_user = conn.execute(
        "SELECT id FROM user ORDER BY createdAt ASC, id ASC LIMIT 1"
    ).fetchone()
    if first_user:
        conn.execute("UPDATE user SET role = 'admin' WHERE id = ?", (first_user["id"],))


def cleanup_sidecar_files(db_path: Path) -> None:
    for suffix in ("-wal", "-shm"):
        sidecar = Path(f"{db_path}{suffix}")
        if sidecar.exists():
            sidecar.unlink()


def replace_database(temp_target_path: Path, target_path: Path) -> None:
    cleanup_sidecar_files(target_path)
    os.replace(temp_target_path, target_path)
    cleanup_sidecar_files(temp_target_path)


def run_import(source_path: Path, target_path: Path) -> dict[str, object]:
    if not source_path.exists():
        raise FileNotFoundError(f"Legacy database not found: {source_path}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"stuco_pre_import_{timestamp}.db"
    if target_path.exists():
        backup_database(target_path, backup_path)

    source_snapshot_path = snapshot_database(source_path, "legacy-stuco-")
    temp_target_path = target_path.with_name(f".stuco-import-{timestamp}.db")

    try:
        if temp_target_path.exists():
            temp_target_path.unlink()

        with sqlite_connect(temp_target_path) as target_conn, sqlite_connect(source_snapshot_path, readonly=True) as source_conn:
            load_current_schema(target_conn)

            with target_conn:
                auth_counts = copy_auth_tables(source_conn, target_conn)
                students_count = import_students(source_conn, target_conn)
                accounts_count = import_accounts(source_conn, target_conn)
                cards_count = import_cards(source_conn, target_conn)
                overdraft_count = import_overdraft_weeks(source_conn, target_conn)
                transaction_counts = import_transactions(source_conn, target_conn)
                ensure_admin_role(target_conn)
                set_sequences(target_conn)

        replace_database(temp_target_path, target_path)

        return {
            "backup_path": str(backup_path) if target_path.exists() else None,
            "auth": auth_counts,
            "students": students_count,
            "accounts": accounts_count,
            "cards": cards_count,
            "overdraft_weeks": overdraft_count,
            "transactions": transaction_counts,
        }
    finally:
        if source_snapshot_path.exists():
            source_snapshot_path.unlink()
        if temp_target_path.exists():
            temp_target_path.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replace the current DB with a migrated legacy DB")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE_DB, help="Path to the legacy SQLite database")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET_DB, help="Path to the target SQLite database")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_import(args.source.resolve(), args.target.resolve())
    print("Legacy database import complete.")
    if result["backup_path"]:
        print(f"Backup: {result['backup_path']}")
    print(
        "Auth tables: "
        f"user={result['auth']['user']}, "
        f"account={result['auth']['account']}, "
        f"session={result['auth']['session']}, "
        f"verification={result['auth']['verification']}"
    )
    print(f"Students imported: {result['students']}")
    print(f"Accounts imported: {result['accounts']}")
    print(f"Cards imported: {result['cards']}")
    print(f"Overdraft weeks imported: {result['overdraft_weeks']}")
    tx_summary = result["transactions"]
    print(f"Transactions imported: {tx_summary['total']}")
    print(
        "Top-up payment methods inferred: "
        f"WeChat={tx_summary['WeChat']}, "
        f"Cash={tx_summary['Cash']}, "
        f"Alipay={tx_summary['Alipay']}, "
        f"Bitcoin={tx_summary['Bitcoin']}, "
        f"{TOPUP_PAYMENT_METHOD_FALLBACK}={tx_summary[TOPUP_PAYMENT_METHOD_FALLBACK]}"
    )


if __name__ == "__main__":
    main()
