import { getDb } from "../db";
import type { Account, UpdateAccount } from "../models";

export function getAccountByStudentId(
  studentId: number
): Account | undefined {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM accounts WHERE student_id = ?");
  return stmt.get(studentId) as Account | undefined;
}

export function updateAccount(studentId: number, data: UpdateAccount): void {
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

  values.push(studentId);
  const stmt = db.prepare(
    `UPDATE accounts SET ${updates.join(", ")} WHERE student_id = ?`
  );
  stmt.run(...values);
}

export function adjustBalance(studentId: number, delta: number): void {
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE accounts SET balance = balance + ? WHERE student_id = ?"
  );
  stmt.run(delta, studentId);
}

