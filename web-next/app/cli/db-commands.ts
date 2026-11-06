import { getDb, closeDb, dbPath } from "../../lib/db";
import { formatCurrency, toDbValue } from "../../lib/currency";
import Database from "better-sqlite3";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

interface StudentRow {
  id: number;
  name: string;
  balance: number;
}

export function parseAdjustmentAmount(input: string): number {
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(input.trim())) {
    throw new Error("Enter a number with at most two decimal places");
  }
  const amount = toDbValue(Number(input));
  if (!Number.isSafeInteger(amount) || amount === 0) {
    throw new Error("Amount must be nonzero and within the safe currency range");
  }
  return amount;
}

export function applyLedgerAdjustment(database: Database.Database, studentId: number, amount: number, description: string): number {
  return database.transaction(() => {
    const account = database.prepare(`
      SELECT a.balance FROM accounts a JOIN students s ON s.id = a.student_id
      WHERE a.student_id = ? AND s.archived = 0
    `).get(studentId) as { balance: number } | undefined;
    if (!account) throw new Error("Active student account not found; no transaction was written");
    const balance = account.balance + amount;
    if (!Number.isSafeInteger(amount) || amount === 0 || !Number.isSafeInteger(balance)) {
      throw new Error("Adjustment exceeds the safe currency range");
    }
    database.prepare(`
      INSERT INTO transactions (student_id, type, amount, payment_method, description, staff, created_at)
      VALUES (?, ?, ?, ?, ?, 'CLI-Admin', datetime('now'))
    `).run(studentId, amount > 0 ? "TOPUP" : "DEBIT", amount, amount > 0 ? "Cash" : "Balance", description.trim() || "CLI Adjustment");
    database.prepare("UPDATE accounts SET balance = ? WHERE student_id = ?").run(balance, studentId);
    return balance;
  })();
}

export async function restoreDatabase(sourcePath: string, activePath: string, active: Database.Database): Promise<void> {
  const sourceStat = fs.statSync(sourcePath);
  const activeStat = fs.statSync(activePath);
  if (sourceStat.dev === activeStat.dev && sourceStat.ino === activeStat.ino) {
    throw new Error("Backup and active database must be different files");
  }
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    // Pin validation and copying to the same SQLite snapshot, including its WAL.
    source.exec("BEGIN");
    const foreignKeyErrors = source.pragma("foreign_key_check");
    if (source.pragma("integrity_check", { simple: true }) !== "ok" || !Array.isArray(foreignKeyErrors) || foreignKeyErrors.length > 0) {
      throw new Error("Backup failed SQLite integrity or foreign-key checks");
    }
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    const tables = active.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    for (const { name } of tables) {
      const columns = active.pragma(`table_info(${quote(name)})`) as { name: string }[];
      const sourceColumns = new Set((source.pragma(`table_info(${quote(name)})`) as { name: string }[]).map((column) => column.name));
      if (columns.some((column) => !sourceColumns.has(column.name))) {
        throw new Error(`Backup schema is incompatible with ${name}; migrate a copy first`);
      }
    }
    const scale = source.prepare("SELECT value FROM app_meta WHERE key = 'currency_scale'").get() as { value: string } | undefined;
    if (scale?.value !== "100") throw new Error("Backup must use the current cent-based schema; migrate a copy first");
    const deadline = Date.now() + 30_000;
    const result = await source.backup(activePath, {
      progress: () => {
        if (Date.now() > deadline) throw new Error("Database remained busy; restore rolled back");
        return 100;
      },
    });
    // better-sqlite3 can report zero pages on an initial SQLITE_BUSY without copying.
    if (result.totalPages === 0) throw new Error("Active database is busy; no data was restored");
  } finally {
    source.close();
  }
}

export async function handleLedgerAdjustments() {
  const db = getDb();
  
  while (true) {
    const search = await p.text({
      message: "Search for a student/customer by name",
      placeholder: "e.g. John",
      validate: (v) => (!v.trim() ? "Search query cannot be empty" : undefined),
    });

    if (p.isCancel(search)) break;

    // Search students
    const matches = db.prepare(`
      SELECT s.id, s.name, COALESCE(a.balance, 0) as balance
      FROM students s
      LEFT JOIN accounts a ON s.id = a.student_id
      WHERE s.name LIKE ? AND s.archived = 0
      LIMIT 10
    `).all(`%${search.trim()}%`) as StudentRow[];

    if (matches.length === 0) {
      p.log.warn("No active students found matching that name.");
      const retry = await p.confirm({ message: "Search again?" });
      if (p.isCancel(retry) || !retry) break;
      continue;
    }

    const selectedId = await p.select({
      message: "Select a student",
      options: matches.map((m) => ({
        value: m.id,
        label: `${m.name} (Current Balance: ¥${formatCurrency(m.balance)})`,
      })),
    });

    if (p.isCancel(selectedId)) break;

    const student = matches.find((m) => m.id === selectedId)!;

    const amountInput = await p.text({
      message: "Enter Top-up / Adjustment amount in ¥ (e.g. 50 or -20 for debit)",
      placeholder: "e.g. 50.00",
      validate: (v) => {
        try {
          parseAdjustmentAmount(v);
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : "Invalid amount";
        }
      },
    });

    if (p.isCancel(amountInput)) break;

    const centsAmount = parseAdjustmentAmount(amountInput);

    const description = await p.text({
      message: "Optional note / description",
      placeholder: "e.g. Cash Top-up via CLI",
    });

    if (p.isCancel(description)) break;

    const confirm = await p.confirm({
      message: `Confirm transaction: ¥${centsAmount > 0 ? "+" : ""}${formatCurrency(centsAmount)} for ${pc.bold(student.name)}?`,
    });

    if (!confirm || p.isCancel(confirm)) break;

    const s = p.spinner();
    s.start("Processing transaction in ledger...");

    try {
      const newBalance = applyLedgerAdjustment(db, student.id, centsAmount, description);
      s.stop(`✓ Transaction complete! New Balance: ¥${formatCurrency(newBalance)}`);
    } catch (err) {
      s.stop("Failed to process transaction");
      p.log.error(err instanceof Error ? err.message : "Unknown error");
    }
    
    break; // Return to main menu after transaction
  }
}

export async function handleCSVImport() {
  const csvPath = await p.text({
    message: "Enter the absolute or relative path to your CSV file",
    placeholder: "e.g. students.csv",
    validate: (v) => {
      if (!v.trim()) return "Path cannot be empty";
      if (!fs.existsSync(v.trim())) return "File does not exist at that path";
      return undefined;
    },
  });

  if (p.isCancel(csvPath)) return;

  const dryRun = await p.confirm({
    message: "Do you want to run a DRY RUN first? (Previews changes without writing to DB)",
  });

  if (p.isCancel(dryRun)) return;

  getDb(); // Ensure the active database is initialized before the Python writer opens it.
  const args = [path.resolve(__dirname, "../../../hardware-pi/batch_import_students.py"), path.resolve(csvPath.trim())];
  if (dryRun) args.push("--dry-run");

  const s = p.spinner();
  s.start("Executing import script...");

  // Spawn Python script
  const child = spawn("python3", args, {
    stdio: "inherit", // Pipe directly into the stdout/stderr so the user sees python's rich print outputs!
    env: { ...process.env, DATABASE_PATH: path.resolve(dbPath!) },
  });

  await new Promise<void>((resolve) => {
    child.on("error", (error) => {
      s.stop("Import could not start");
      p.log.error(error.message);
      resolve();
    });
    child.on("close", (code) => {
      s.stop(code === 0 ? "✓ Import process finished" : `Import failed (Exit code: ${code})`);
      resolve();
    });
  });
}

export async function handleHardwareDiagnostics() {
  while (true) {
    const choice = await p.select({
      message: "IoT & NFC Hardware Diagnostics",
      options: [
        { value: "diagnose", label: "Check NFC reader connection" },
        { value: "usb", label: "Scan serial USB ports" },
        { value: "test_readers", label: "Comprehensive multi-reader tests" },
        { value: "back", label: "← Go back" },
      ],
    });

    if (p.isCancel(choice) || choice === "back") break;

    let pyScript = "";
    if (choice === "diagnose") pyScript = "diagnose_nfc.py";
    if (choice === "usb") pyScript = "test_usb_ports.py";
    if (choice === "test_readers") pyScript = "test_readers.py";

    const scriptPath = path.resolve(__dirname, "../../../hardware-pi", pyScript);

    if (!fs.existsSync(scriptPath)) {
      p.log.error(`Hardware script not found at: ${scriptPath}`);
      continue;
    }

    const s = p.spinner();
    s.start(`Booting ${pyScript}...`);

    const child = spawn("python3", [scriptPath], {
      stdio: "inherit",
    });

    await new Promise<void>((resolve) => {
      child.on("error", (error) => {
        s.stop("Hardware script could not start");
        p.log.error(error.message);
        resolve();
      });
      child.on("close", (code) => {
        s.stop(code === 0 ? "✓ Script completed" : `Script failed (Exit code: ${code})`);
        resolve();
      });
    });
  }
}

export async function handleImportDatabase() {
  const activeDbPath = dbPath;
  if (!activeDbPath) {
    p.log.error("Active database path is not defined or found.");
    return;
  }

  const sourcePath = await p.text({
    message: "Enter the absolute or relative path to your SQLite database backup (.db file)",
    placeholder: "e.g. stuco.db.backup",
    validate: (v) => {
      if (!v.trim()) return "Path cannot be empty";
      if (!fs.existsSync(v.trim())) return "Backup file does not exist at that path";
      // basic sqlite signature check
      try {
        const buffer = Buffer.alloc(16);
        const fd = fs.openSync(v.trim(), "r");
        fs.readSync(fd, buffer, 0, 16, 0);
        fs.closeSync(fd);
        if (buffer.toString("utf-8", 0, 15) !== "SQLite format 3") {
          return "File is not a valid SQLite 3 database file";
        }
      } catch (err) {
        return "Failed to read file signature";
      }
      return undefined;
    },
  });

  if (p.isCancel(sourcePath)) return;

  const confirm = await p.confirm({
    message: pc.red(pc.bold("CRITICAL WARNING: All active data will be replaced. Stop the app and other writers first to avoid losing new work. Only current-schema backups are accepted. Continue?")),
  });

  if (!confirm || p.isCancel(confirm)) return;

  const s = p.spinner();
  s.start("Validating backup and restoring through SQLite...");

  try {
    await restoreDatabase(sourcePath.trim(), activeDbPath, getDb());
    closeDb();
    getDb();
    s.stop(`✓ Database successfully restored! Active at: ${activeDbPath}`);
  } catch (err) {
    s.stop("Failed to import database");
    p.log.error(err instanceof Error ? err.message : "Unknown error");
    
    // Attempt recovery
    try {
      getDb();
    } catch {}
  }
}
