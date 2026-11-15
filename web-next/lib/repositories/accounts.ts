import { getDb } from "../db";
import type { Account, UpdateAccount } from "../models";

export function getAccountByCustomerId(
  customerId: number
): Account | undefined {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM accounts WHERE customer_id = ?");
  return stmt.get(customerId) as Account | undefined;
}

export function updateAccount(customerId: number, data: UpdateAccount): void {
  const db = getDb();
  const updates: string[] = [];
  const values: (number | string)[] = [];

  if (data.balance !== undefined) {
    updates.push("balance = ?");
    values.push(data.balance);
  }
  if (data.max_overdraft_week !== undefined) {
    updates.push("max_overdraft_week = ?");
    values.push(data.max_overdraft_week);
  }

  if (updates.length === 0) return;

  values.push(customerId);
  const stmt = db.prepare(
    `UPDATE accounts SET ${updates.join(", ")} WHERE customer_id = ?`
  );
  stmt.run(...values);
}

export function adjustBalance(customerId: number, delta: number): void {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE accounts SET balance = balance + ? WHERE customer_id = ?"
  );
  if (stmt.run(delta, customerId).changes === 0) throw new Error("Account not found");
}

