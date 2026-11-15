#!/usr/bin/env python3
"""Consistent SQLite snapshots and strictly staged backup extraction."""
import argparse
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile


class _ArchiveStream:
    def __init__(self, pipe):
        self.pipe = pipe
        self.size = 0
        self.tail = b""

    def read(self, size):
        data = self.pipe.read(size)
        self.size += len(data)
        self.tail = (self.tail + data)[-1024:]
        return data


def backup_database(source_path: Path, backup_path: Path) -> None:
    source_path = source_path.resolve(strict=True)
    if backup_path.exists() and source_path.samefile(backup_path):
        raise ValueError("Source and snapshot must be different files")
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)) as source:
        with closing(sqlite3.connect(backup_path)) as destination:
            source.backup(destination)
            if destination.execute("PRAGMA integrity_check").fetchall() != [("ok",)] or destination.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Snapshot failed SQLite integrity or foreign-key checks")


def extract_backup(archive_path: Path, directory: Path) -> Path:
    directory = directory.resolve(strict=True)
    if any(directory.iterdir()):
        raise ValueError("Extraction requires an empty staging directory")
    names = set()
    process = subprocess.Popen(["zstd", "-dc", "--", str(archive_path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        stream = _ArchiveStream(process.stdout)
        with tarfile.open(fileobj=stream, mode="r|", ignore_zeros=True) as archive:
            for member in archive:
                if member.name not in {"stuco.db", "stuco.db-wal", "stuco.db-shm"} or not member.isreg() or member.name in names:
                    raise ValueError("Unexpected, duplicate or unsafe backup member")
                names.add(member.name)
                with archive.extractfile(member) as source, (directory / member.name).open("xb") as target:
                    shutil.copyfileobj(source, target)
        # Drain the stream so decompression errors after the tar end cannot pass validation.
        while stream.read(65536):
            pass
        if process.wait() != 0:
            raise ValueError("Backup decompression failed")
        if "stuco.db" not in names:
            raise ValueError("Backup is missing stuco.db")
        # SQLite reads staged legacy WAL before validating/copying; never touch live sidecars.
        main = directory / "stuco.db"
        if stream.size % 512 or stream.tail != b"\0" * 1024:
            raise ValueError("Truncated tar archive")
        clean = directory / "validated.db"
        backup_database(main, clean)
        clean.replace(main)
        for suffix in ["-wal", "-shm"]:
            (directory / ("stuco.db" + suffix)).unlink(missing_ok=True)
        return main
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
        process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    snapshot = commands.add_parser("snapshot")
    snapshot.add_argument("source", type=Path)
    snapshot.add_argument("destination", type=Path)
    extract = commands.add_parser("extract")
    extract.add_argument("archive", type=Path)
    extract.add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.command == "snapshot":
        backup_database(args.source, args.destination)
    else:
        print(extract_backup(args.archive, args.directory))


if __name__ == "__main__":
    main()
