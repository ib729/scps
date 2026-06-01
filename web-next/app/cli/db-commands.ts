import { getDb, closeDb, dbPath } from "../../lib/db";
import { formatCurrency } from "../../lib/currency";
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
      if (!retry) break;
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
        const num = parseFloat(v);
        if (isNaN(num)) return "Please enter a valid number";
        if (num === 0) return "Amount cannot be zero";
        return undefined;
      },
    });

    if (p.isCancel(amountInput)) break;

    const rawAmount = parseFloat(amountInput);
    // Convert to cents (CNY scale is 100, e.g. ¥5.50 = 550)
    const centsAmount = Math.round(rawAmount * 100);

    const description = await p.text({
      message: "Optional note / description",
      placeholder: "e.g. Cash Top-up via CLI",
    });

    if (p.isCancel(description)) break;

    const confirm = await p.confirm({
      message: `Confirm transaction: ¥${rawAmount > 0 ? "+" : ""}${rawAmount.toFixed(2)} for ${pc.bold(student.name)}?`,
    });

    if (!confirm || p.isCancel(confirm)) break;

    const s = p.spinner();
    s.start("Processing transaction in ledger...");

    try {
      db.transaction(() => {
        // 1. Insert into transactions table
        db.prepare(`
          INSERT INTO transactions (student_id, type, amount, payment_method, description, staff, created_at)
          VALUES (?, ?, ?, ?, ?, 'CLI-Admin', datetime('now'))
        `).run(
          student.id,
          centsAmount > 0 ? "TOPUP" : "DEBIT",
          centsAmount,
          centsAmount > 0 ? "Cash" : "Balance",
          (typeof description === "string" ? description : "").trim() || "CLI Adjustment"
        );

        // 2. Update account balance
        db.prepare(`
          UPDATE accounts
          SET balance = balance + ?
          WHERE student_id = ?
        `).run(centsAmount, student.id);
      })();

      const newBalance = student.balance + centsAmount;
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

  const args = [path.resolve(process.cwd(), "..", "hardware-pi", "batch_import_students.py"), csvPath.trim()];
  if (dryRun) args.push("--dry-run");

  const s = p.spinner();
  s.start("Executing import script...");

  // Spawn Python script
  const child = spawn("python3", args, {
    stdio: "inherit", // Pipe directly into the stdout/stderr so the user sees python's rich print outputs!
  });

  await new Promise<void>((resolve) => {
    child.on("close", (code) => {
      s.stop(`✓ Import process finished (Exit code: ${code})`);
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

    const scriptPath = path.resolve(process.cwd(), "..", "hardware-pi", pyScript);

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
      child.on("close", (code) => {
        s.stop(`✓ Script completed (Exit code: ${code})`);
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
    message: pc.red(pc.bold("CRITICAL WARNING: This will completely OVERWRITE your active database (all transactions, cards, students, and users will be replaced). THIS CANNOT BE UNDONE! Are you sure?")),
  });

  if (!confirm || p.isCancel(confirm)) return;

  const s = p.spinner();
  s.start("Shutting down active database and purging logs...");

  try {
    // 1. Close current connection safely
    closeDb();

    // 2. Clear WAL and SHM files to avoid merge contamination
    const walFile = `${activeDbPath}-wal`;
    const shmFile = `${activeDbPath}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

    s.message("Copying database backup over active database...");

    // 3. Copy backup file to overwrite
    fs.copyFileSync(sourcePath.trim(), activeDbPath);

    s.message("Restarting database engine...");
    
    // 4. Force re-open database connection to apply new data schema
    getDb();

    s.stop(`✓ Database successfully imported and overwritten! Active at: ${activeDbPath}`);
  } catch (err) {
    s.stop("Failed to import database");
    p.log.error(err instanceof Error ? err.message : "Unknown error");
    
    // Attempt recovery
    try {
      getDb();
    } catch {}
  }
}
