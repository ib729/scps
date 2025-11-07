import { getDb } from "../db";
import type {
  Transaction,
  CreateTransaction,
  TransactionWithStudent,
} from "../models";

export function getAllTransactions(
  limit?: number
): TransactionWithStudent[] {
  const db = getDb();
  const query = `
    SELECT 
      t.id,
      t.student_id,
      t.card_uid,
      t.type,
      t.amount,
      t.overdraft_component,
      t.description,
      t.staff,
      t.created_at,
      s.name as student_name
    FROM transactions t
    JOIN students s ON t.student_id = s.id
    ORDER BY t.created_at DESC
    ${limit ? "LIMIT ?" : ""}
  `;
  const stmt = db.prepare(query);
  return (limit ? stmt.all(limit) : stmt.all()) as TransactionWithStudent[];
}

export function getTransactionsByStudentId(
  studentId: number
): Transaction[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM transactions
    WHERE student_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(studentId) as Transaction[];
}

export function getTransactionById(id: number): Transaction | undefined {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM transactions WHERE id = ?");
  return stmt.get(id) as Transaction | undefined;
}

export function createTransaction(data: CreateTransaction): Transaction {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO transactions (
      student_id, card_uid, type, amount, overdraft_component, description, staff, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const info = stmt.run(
    data.student_id,
    data.card_uid || null,
    data.type,
    data.amount,
    data.overdraft_component || 0,
    data.description || null,
    data.staff || null
  );

  const getStmt = db.prepare("SELECT * FROM transactions WHERE id = ?");
  return getStmt.get(Number(info.lastInsertRowid)) as Transaction;
}

export function deleteTransaction(id: number): void {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM transactions WHERE id = ?");
  stmt.run(id);
}

export function getRecentTransactions(limit: number = 10): TransactionWithStudent[] {
  return getAllTransactions(limit);
}

export function getStudentIdsWithTransactions(): number[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT DISTINCT student_id
    FROM transactions
  `);
  const rows = stmt.all() as { student_id: number }[];
  return rows.map((row) => row.student_id);
}

