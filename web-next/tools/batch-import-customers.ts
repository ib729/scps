import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { Command } from "commander";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { assertCustomerSchema } from "../lib/customer-schema";
import { resolveDatabasePath } from "../lib/database-path";

interface ImportRow { row: number; name: string; uid: string }
interface ImportOptions { skipDuplicates: boolean; dryRun: boolean }

export async function importCustomers(csvFile: string, options: ImportOptions): Promise<boolean> {
  let database: Database.Database | undefined;
  try {
    const records = parse(await fs.promises.readFile(csvFile, "utf8"), {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
    const header = records.shift();
    if (!header?.includes("name")) throw new Error("CSV must have a 'name' column");
    if (new Set(header).size !== header.length) throw new Error("CSV has duplicate column names");
    const nameColumn = header.indexOf("name");
    const uidColumn = header.indexOf("uid");
    const rows: ImportRow[] = [];
    let validationErrors = 0;
    for (const [index, record] of records.entries()) {
      const row = index + 2;
      const name = record[nameColumn]?.trim() ?? "";
      const uid = uidColumn < 0 ? "" : (record[uidColumn]?.trim().toUpperCase() ?? "");
      let error: string | undefined;
      if (record.length !== header.length) error = `Expected ${header.length} columns, found ${record.length}`;
      else if (!name) error = "Missing or empty name";
      else if (uid && !/^[0-9A-F]{4,20}$/.test(uid)) error = `Invalid UID '${uid}' (expected 4-20 hexadecimal characters)`;
      if (error) {
        console.error(`Row ${row}${name ? ` (${name})` : ""}: ${error}`);
        validationErrors++;
      } else rows.push({ row, name, uid });
    }
    if (!rows.length) throw new Error("No valid customers found in CSV file");

    const env = config({ path: path.resolve(import.meta.dirname, "../.env.local"), override: false, quiet: true });
    if (env.error && env.error.code !== "ENOENT") throw env.error;
    const filename = resolveDatabasePath();
    database = new Database(filename, { readonly: options.dryRun, fileMustExist: true });
    database.pragma("foreign_keys=ON");
    database.pragma("busy_timeout=5000");
    assertCustomerSchema(database);
    console.log(`Connecting to database at: ${filename}`);
    if (options.dryRun) console.log("DRY RUN: No database changes will be made");

    const findCustomer = database.prepare<[string], { id: number }>("SELECT id FROM customers WHERE name=?");
    const findCard = database.prepare<[string], { customer_id: number }>("SELECT customer_id FROM cards WHERE card_uid=?");
    const insertCustomer = database.prepare("INSERT INTO customers(name) VALUES (?)");
    const insertAccount = database.prepare("INSERT INTO accounts(customer_id,balance,max_overdraft_week) VALUES (?,0,0)");
    const insertCard = database.prepare("INSERT INTO cards(card_uid,customer_id,status) VALUES (?,?,'active')");
    // Read-only overlays make later dry-run rows see earlier planned customers and cards.
    const plannedCustomers = new Map<string, number | string>();
    const plannedCards = new Map<string, number | string>();
    let imported = 0;
    let skipped = 0;
    let cardsCreated = 0;
    let importErrors = 0;
    const applyRow = ({ name, uid }: ImportRow) => {
      const existingId = plannedCustomers.get(name) ?? findCustomer.get(name)?.id;
      const existing = existingId !== undefined;
      if (existing && !options.skipDuplicates) throw new Error("Customer already exists");
      const cardOwner = uid ? (plannedCards.get(uid) ?? findCard.get(uid)?.customer_id) : undefined;
      if (cardOwner !== undefined && cardOwner !== existingId) throw new Error(`Card UID ${uid} already assigned to customer ID ${cardOwner}`);

      const customerId = existingId ?? (options.dryRun ? `planned:${name}` : Number(insertCustomer.run(name).lastInsertRowid));
      if (!existing && !options.dryRun) insertAccount.run(customerId);
      const createCard = Boolean(uid && cardOwner === undefined);
      if (createCard && !options.dryRun) insertCard.run(uid, customerId);
      if (options.dryRun) {
        plannedCustomers.set(name, customerId);
        if (createCard) plannedCards.set(uid, customerId);
      }
      return { existing, createCard };
    };
    const importRow = database.transaction(applyRow);
    for (const row of rows) {
      try {
        const result = options.dryRun ? applyRow(row) : importRow.immediate(row);
        if (result.existing) skipped++;
        else imported++;
        if (result.createCard) cardsCreated++;
        console.log(`${options.dryRun ? "[DRY RUN] " : ""}${result.existing ? (result.createCard ? "Added card to existing customer" : "Skipped duplicate") : "Imported"}: ${row.name}${row.uid ? ` → ${row.uid}` : ""}`);
      } catch (error) {
        console.error(`Row ${row.row} (${row.name}): ${error instanceof Error ? error.message : String(error)}`);
        importErrors++;
      }
    }
    console.log(`Import Summary: ${options.dryRun ? "Would import" : "Imported"}: ${imported}; ${options.dryRun ? "Would create cards" : "Cards created"}: ${cardsCreated}; Skipped (duplicates): ${skipped}; Validation errors: ${validationErrors}; Import errors: ${importErrors}`);
    return validationErrors === 0 && importErrors === 0;
  } catch (error) {
    console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    database?.close();
  }
}

async function main() {
  const program = new Command()
    .description("Batch import customers and optional NFC cards from CSV")
    .argument("<csv-file>", "CSV file with name and optional uid columns")
    .option("--template", "Generate a template instead of importing")
    .option("--with-uid", "Include a UID column in the template")
    .option("--dry-run", "Validate and preview without changing the database")
    .option("--no-skip-duplicates", "Fail on duplicate customer names");
  program.parse();
  const [filename] = program.args;
  const options = program.opts<{ template?: boolean; withUid?: boolean; dryRun?: boolean; skipDuplicates: boolean }>();
  if (options.template) {
    await fs.promises.writeFile(filename, options.withUid
      ? "name,uid\nJohn Doe,DEADBEEF\nJane Smith,0E39E996\nAlice Johnson,\n"
      : "name\nJohn Doe\nJane Smith\nAlice Johnson\n");
    console.log(`Template CSV created: ${filename}`);
    return;
  }
  if (!await importCustomers(filename, { skipDuplicates: options.skipDuplicates, dryRun: options.dryRun ?? false })) process.exitCode = 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
