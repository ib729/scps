import importlib.util
from contextlib import closing
import io
import os
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sqlite_snapshot", ROOT / "scripts/sqlite_snapshot.py")


class SQLiteBackupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="scps-backup-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.ledger = self.directory / "ledger.db"
        self.db = sqlite3.connect(self.ledger)
        self.addCleanup(self.db.close)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE ledger(balance INTEGER)")
        self.db.execute("INSERT INTO ledger VALUES(731)")
        self.db.commit()
        self.module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(self.module)

    def test_snapshot_keeps_committed_wal_and_rejects_identity_and_missing_source(self):
        target = self.directory / "nested/stuco.db"
        self.module.backup_database(self.ledger, target)
        with closing(sqlite3.connect(target)) as copy:
            self.assertEqual(copy.execute("SELECT balance FROM ledger").fetchone()[0], 731)
        with self.assertRaises((ValueError, OSError)):
            self.module.backup_database(self.ledger, self.ledger)
        missing = self.directory / "missing.db"
        with self.assertRaises((ValueError, OSError, sqlite3.Error)):
            self.module.backup_database(missing, target)
        self.assertFalse(missing.exists())

    def archive(self, names):
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as tar:
            for name, kind in names:
                item = tarfile.TarInfo(name)
                item.type = kind
                item.linkname = "stuco.db"
                content = self.ledger.read_bytes()
                item.size = len(content) if kind == tarfile.REGTYPE else 0
                tar.addfile(item, io.BytesIO(content) if item.size else None)
        archive = self.directory / "input.tar.zst"
        archive.write_bytes(subprocess.run(["zstd", "-q", "-c"], input=raw.getvalue(), check=True, capture_output=True).stdout)
        return archive

    def test_extract_refuses_unsafe_or_incomplete_archives_without_touching_ledger(self):
        for index, names in enumerate([
            [("../stuco.db", tarfile.REGTYPE)], [("/stuco.db", tarfile.REGTYPE)],
            [("stuco.db", tarfile.SYMTYPE)], [("stuco.db", tarfile.LNKTYPE)],
            [("stuco.db", tarfile.REGTYPE), ("stuco.db", tarfile.REGTYPE)],
            [("other.db", tarfile.REGTYPE)], [("stuco.db-wal", tarfile.REGTYPE)],
        ]):
            archive = self.archive(names)
            stage = self.directory / f"stage-{index}"
            stage.mkdir()
            with self.subTest(names=names), self.assertRaises((ValueError, OSError, tarfile.TarError, sqlite3.Error)):
                self.module.extract_backup(archive, stage)
            self.assertEqual(self.db.execute("SELECT balance FROM ledger").fetchone()[0], 731)
        archive.write_bytes(archive.read_bytes()[:20])
        stage = self.directory / "truncated"
        stage.mkdir()
        with self.assertRaises((ValueError, OSError, tarfile.TarError)):
            self.module.extract_backup(archive, stage)

    def test_web_backup_uses_configured_ledger_from_either_cwd_and_publishes_only_success(self):
        env = {**os.environ, "DATABASE_PATH": str(self.ledger)}
        for index, cwd in enumerate([ROOT, ROOT / "web-next"]):
            archive = self.directory / f"web-{index}.tar.zst"
            subprocess.run(["bash", str(ROOT / "scripts/web_backup.sh"), str(archive)], cwd=cwd, env=env, check=True, capture_output=True)
            stage = self.directory / f"web-stage-{index}"
            stage.mkdir()
            target = self.module.extract_backup(archive, stage)
            with closing(sqlite3.connect(target)) as copy:
                self.assertEqual(copy.execute("SELECT balance FROM ledger").fetchone()[0], 731)
        broken = self.directory / "bin"
        broken.mkdir()
        zstd = broken / "zstd"
        zstd.write_text("#!/bin/sh\nexit 1\n")
        zstd.chmod(0o755)
        output = self.directory / "failed.tar.zst"
        result = subprocess.run(["bash", str(ROOT / "scripts/web_backup.sh"), str(output)], env={**env, "PATH": f"{broken}:{env['PATH']}"}, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())
        self.assertEqual(self.db.execute("SELECT balance FROM ledger").fetchone()[0], 731)


    def test_cloud_roundtrip_and_noninteractive_restore_preserve_pre_restore_state(self):
        root = self.directory / "repo"
        for name in ["scripts/web_backup.sh", "scripts/cloud_backup_r2.sh", "scripts/restore_from_r2.sh", "scripts/sqlite_snapshot.py", "web-next/lib/database-path.cjs", "scps-cli"]:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
            target.chmod(0o755)
        for name in ["node_modules", "app", "lib/db.ts", "lib/models.ts", "lib/currency.ts", "lib/pos-preferences.ts", "lib/user-schema.cjs", "lib/repositories", "tsconfig.json"]:
            target = root / "web-next" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.symlink_to(ROOT / "web-next" / name)
        active = self.directory / "active.db"
        with closing(sqlite3.connect(active)) as db:
            db.executescript((ROOT / "migrations/schema.sql").read_text() + (ROOT / "web-next/migrations/better_auth_schema.sql").read_text())
            db.execute("INSERT INTO students(id,name) VALUES(1,'Backup check')")
            db.execute("INSERT INTO accounts(student_id,balance) VALUES(1,731)")
            db.commit()
        env = {**os.environ, "DATABASE_PATH": str(active)}
        subprocess.run([str(ROOT / "web-next/node_modules/.bin/tsx"), "-e", "import {getDb,closeDb} from './lib/db';getDb();closeDb()"], cwd=ROOT / "web-next", env=env, check=True, capture_output=True)
        remote = self.directory / "remote"
        remote.mkdir()
        config = self.directory / "rclone.conf"
        config.write_text(f"[r2]\ntype = alias\nremote = {remote}\n[r2-crypt]\ntype = alias\nremote = {remote}\n")
        env["RCLONE_CONFIG"] = str(config)
        with closing(sqlite3.connect(active)) as db:
            db.execute("PRAGMA journal_mode=WAL")
            upload = subprocess.run(["bash", str(root / "scripts/cloud_backup_r2.sh")], cwd=root / "web-next", env=env, capture_output=True)
            self.assertEqual(upload.returncode, 0, upload.stderr.decode() + upload.stdout.decode())
            archive = next(remote.glob("*.tar.zst"))
            db.execute("UPDATE accounts SET balance=999")
            db.commit()
            result = subprocess.run(["bash", str(root / "scripts/restore_from_r2.sh"), archive.name, "--writers-stopped"], cwd=root, env=env, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            self.assertEqual(db.execute("SELECT balance FROM accounts").fetchone()[0], 731)
        stage = self.directory / "pre-restore"
        stage.mkdir()
        saved = self.module.extract_backup(next((root / "db_backups").glob("pre_restore*")), stage)
        with closing(sqlite3.connect(saved)) as db:
            self.assertEqual(db.execute("SELECT balance FROM accounts").fetchone()[0], 999)
if __name__ == "__main__":
    unittest.main()

