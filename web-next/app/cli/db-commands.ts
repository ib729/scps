import { getDb, closeDb, dbPath } from "../../lib/db";
import { assertCustomerSchema, migrateCustomerSchema } from "../../lib/customer-schema";
import { formatCurrency, toDbValue } from "../../lib/currency";
import Database from "better-sqlite3";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "node:os";
import { backupDatabase } from "../../tools/sqlite-snapshot";
import { importCustomers } from "../../tools/batch-import-customers";

interface CustomerRow {
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

export function applyLedgerAdjustment(database: Database.Database, customerId: number, amount: number, description: string): number {
  return database.transaction(() => {
    const account = database.prepare(`
      SELECT a.balance FROM accounts a JOIN customers s ON s.id = a.customer_id
      WHERE a.customer_id = ? AND s.archived = 0
    `).get(customerId) as { balance: number } | undefined;
    if (!account) throw new Error("Active customer account not found; no transaction was written");
    const balance = account.balance + amount;
    if (!Number.isSafeInteger(amount) || amount === 0 || !Number.isSafeInteger(balance)) {
      throw new Error("Adjustment exceeds the safe currency range");
    }
    database.prepare(`
      INSERT INTO transactions (customer_id, type, amount, payment_method, description, staff, created_at)
      VALUES (?, ?, ?, ?, ?, 'CLI-Admin', datetime('now'))
    `).run(customerId, amount > 0 ? "TOPUP" : "DEBIT", amount, amount > 0 ? "Cash" : "Balance", description.trim() || "CLI Adjustment");
    database.prepare("UPDATE accounts SET balance = ? WHERE customer_id = ?").run(balance, customerId);
    return balance;
  })();
}

export async function restoreDatabase(sourcePath: string, activePath: string, active: Database.Database): Promise<void> {
  const sourceStat = fs.statSync(sourcePath);
  const activeStat = fs.statSync(activePath);
  if (sourceStat.dev === activeStat.dev && sourceStat.ino === activeStat.ino) {
    throw new Error("Backup and active database must be different files");
  }
  if (active.inTransaction) throw new Error("Active database is busy in a transaction");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scps-restore-"));
  try {
    const stagedPath = path.join(directory, "snapshot.db");
    await backupDatabase(sourcePath, stagedPath);
    const source = new Database(stagedPath, { fileMustExist: true });
    try {
      source.pragma("foreign_keys=ON");
      if (source.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='students'").get()) migrateCustomerSchema(source);
      assertCustomerSchema(source);
      if (source.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup failed SQLite integrity checks");
      source.exec("BEGIN");
      const deadline = Date.now() + 30_000;
      const result = await source.backup(activePath, {
        progress: () => {
          if (Date.now() > deadline) throw new Error("Database remained busy; restore rolled back");
          return 100;
        },
      });
      // SQLite can report zero pages on initial SQLITE_BUSY without copying.
      if (result.totalPages === 0) throw new Error("Active database is busy; no data was restored");
    } finally { source.close(); }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

export async function handleLedgerAdjustments() {
  const db = getDb();
  
  while (true) {
    const search = await p.text({
      message: "Search for a customer by name",
      validate: (v = "") => (!v.trim() ? "Search query cannot be empty" : undefined),
    });

    if (p.isCancel(search)) break;

    // Search customers
    const matches = db.prepare(`
      SELECT s.id, s.name, COALESCE(a.balance, 0) as balance
      FROM customers s
      LEFT JOIN accounts a ON s.id = a.customer_id
      WHERE s.name LIKE ? AND s.archived = 0
      LIMIT 10
    `).all(`%${search.trim()}%`) as CustomerRow[];

    if (matches.length === 0) {
      p.log.warn("No active customers found matching that name.");
      const retry = await p.confirm({ message: "Search again?" });
      if (p.isCancel(retry) || !retry) break;
      continue;
    }

    const selectedId = await p.select({
      message: "Select a customer",
      options: matches.map((m) => ({
        value: m.id,
        label: `${m.name} (Current Balance: ¥${formatCurrency(m.balance)})`,
      })),
    });

    if (p.isCancel(selectedId)) break;

    const customer = matches.find((m) => m.id === selectedId)!;

    const amountInput = await p.text({
      message: "Amount (¥; negative for debit)",
      validate: (v = "") => {
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
    });

    if (p.isCancel(description)) break;

    const confirm = await p.confirm({
      message: `Confirm transaction: ¥${centsAmount > 0 ? "+" : ""}${formatCurrency(centsAmount)} for ${pc.bold(customer.name)}?`,
    });

    if (!confirm || p.isCancel(confirm)) break;

    const s = p.spinner();
    s.start("Processing transaction in ledger...");

    try {
      const newBalance = applyLedgerAdjustment(db, customer.id, centsAmount, description);
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
    validate: (v = "") => {
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

  const s = p.spinner();
  s.start("Importing customers...");
  try {
    const success = await importCustomers(path.resolve(csvPath.trim()), { skipDuplicates: true, dryRun });
    s.stop(success ? "✓ Import finished" : "Import failed; inspect row errors");
    if (!success) process.exitCode = 1;
  } catch (error) {
    s.stop("Import failed");
    p.log.error(error instanceof Error ? error.message : "Unknown import error");
    process.exitCode = 1;
  }
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

    let script = "";
    if (choice === "diagnose") script = "diagnose-nfc.ts";
    if (choice === "usb") script = "test-usb-ports.ts";
    if (choice === "test_readers") script = "test-readers.ts";

    const scriptPath = path.resolve(__dirname, "../../hardware", script);

    if (!fs.existsSync(scriptPath)) {
      p.log.error(`Hardware script not found at: ${scriptPath}`);
      continue;
    }

    const s = p.spinner();
    s.start(`Booting ${script}...`);

    const child = spawn(process.execPath, ["--import", "tsx", scriptPath], {
      cwd: path.resolve(__dirname, "../.."),
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

export async function handleImportDatabase(sourcePath?: string, confirmed?: boolean): Promise<boolean> {
  const activeDbPath = dbPath;
  if (!activeDbPath) {
    p.log.error("Active database path is not defined or found.");
    return false;
  }

  const selectedSource = sourcePath ?? (confirmed ? "" : await p.text({
    message: "Enter the absolute or relative path to your SQLite database backup (.db file)",
    validate: (v = "") => {
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
  }));

  if (p.isCancel(selectedSource) || !selectedSource.trim()) return false;

  const confirm = confirmed ?? await p.confirm({
    message: pc.red(pc.bold("CRITICAL WARNING: All active data will be replaced. Stop every writer first. Verified pre-cutover customer-domain backups are normalized in private staging. Continue?")),
  });

  if (!confirm || p.isCancel(confirm)) return false;

  const s = p.spinner();
  s.start("Validating backup and restoring through SQLite...");

  try {
    await restoreDatabase(selectedSource.trim(), activeDbPath, getDb());
    closeDb();
    getDb();
    s.stop(`✓ Database successfully restored! Active at: ${activeDbPath}`);
    return true;
  } catch (err) {
    s.stop("Failed to import database");
    p.log.error(err instanceof Error ? err.message : "Unknown error");
    
    // Attempt recovery
    try {
      getDb();
    } catch {}
    return false;
  }
}
