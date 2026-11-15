import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SetupPathsTest(unittest.TestCase):
    def test_configure_database_preserves_target_from_both_working_directories(self):
        with tempfile.TemporaryDirectory(prefix="scps-setup-") as directory:
            root = Path(directory)
            for name in ["scripts/setup-debian.sh", "web-next/lib/database-path.cjs", "migrations/schema.sql", "web-next/migrations/better_auth_schema.sql", "web-next/.env.local.example"]:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            (root / "web-next/node_modules").symlink_to(ROOT / "web-next/node_modules", target_is_directory=True)
            web = root / "web-next"
            env_file = web / ".env.local"
            target = web / "private dir/ledger.db"
            env_file.write_text('DATABASE_PATH="private dir/ledger.db"\n')
            command = '''source "$1/scripts/setup-debian.sh"
run_as_user() { "$@"; }
configure_database
'''
            env = {k: v for k, v in os.environ.items() if k != "DATABASE_PATH"}
            for index, cwd in enumerate([root, web]):
                subprocess.run(["bash", "-c", command, "setup-test", str(root)], cwd=cwd, env=env, check=True, capture_output=True, text=True)
                self.assertTrue(target.exists())
                self.assertIn(str(target), env_file.read_text())
                with sqlite3.connect(target) as db:
                    self.assertIsNotNone(db.execute("SELECT name FROM sqlite_schema WHERE name='session'").fetchone())
                    if index:
                        self.assertEqual(db.execute("SELECT name FROM students WHERE id=1").fetchone()[0], "preserved")
                    db.execute("INSERT OR IGNORE INTO students(id,name) VALUES(1,'preserved')")
                    db.commit()
                    self.assertEqual(db.execute("SELECT name FROM students WHERE id=1").fetchone()[0], "preserved")
                self.assertEqual(list(root.rglob("*.db")), [target])


if __name__ == "__main__":
    unittest.main()
