import dotenv from "dotenv";
import path from "path";

// 1. Force load the environment variables from .env.local!
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { handleManageUsers } from "./auth-commands";
import { handleLedgerAdjustments, handleCSVImport, handleHardwareDiagnostics, handleImportDatabase } from "./db-commands";

const program = new Command();

async function showMainMenu() {
  p.intro(pc.bgCyan(pc.black(" SCPS CLI ")));

  while (true) {
    const action = await p.select({
      message: "What management task would you like to perform?",
      options: [
        { value: "users", label: "Manage Staff Accounts (Add, Delete, Reset Passwords)" },
        { value: "ledger", label: "Ledger & Balances (Top-up, Adjustments)" },
        { value: "import", label: "Import Students (CSV)" },
        { value: "import-db", label: "Import SQLite Database Backup (Overwrite Active)" },
        { value: "diagnose", label: "NFC Hardware & Diagnostics" },
        { value: "exit", label: "Exit CLI" },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro(pc.yellow("Goodbye!"));
      break;
    }

    if (action === "users") {
      await handleManageUsers();
    } else if (action === "ledger") {
      await handleLedgerAdjustments();
    } else if (action === "import") {
      await handleCSVImport();
    } else if (action === "import-db") {
      await handleImportDatabase();
    } else if (action === "diagnose") {
      await handleHardwareDiagnostics();
    }
  }
}

async function main() {
  // Setup commander for scripted/non-interactive calls if provided
  program
    .name("scps-cli")
    .description("A feature-rich administrative CLI for SCPS")
    .version("1.0.0");

  program
    .command("users")
    .description("Interactively manage users, roles, and credentials")
    .action(async () => {
      await handleManageUsers();
    });

  program
    .command("ledger")
    .description("Interactively execute cash top-ups and balance debits")
    .action(async () => {
      await handleLedgerAdjustments();
    });

  program
    .command("import")
    .description("Import students and card UIDs from a CSV file")
    .action(async () => {
      await handleCSVImport();
    });

  program
    .command("import-db")
    .description("Import an SQLite backup database and completely overwrite active data")
    .action(async () => {
      await handleImportDatabase();
    });

  program
    .command("diagnose")
    .description("Run serial, reader, and GPIO test scripts on the Pi")
    .action(async () => {
      await handleHardwareDiagnostics();
    });

  // If no arguments were passed, default to opening the premium interactive menu!
  if (process.argv.length <= 2) {
    await showMainMenu();
  } else {
    await program.parseAsync(process.argv);
  }
}

main().catch((err) => {
  console.error(pc.red("CLI Fatal Error:"), err);
  process.exit(1);
});
