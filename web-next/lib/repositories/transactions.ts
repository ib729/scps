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
      t.payment_method,
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
      student_id, card_uid, type, amount, overdraft_component, payment_method, description, staff, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const info = stmt.run(
    data.student_id,
    data.card_uid || null,
    data.type,
    data.amount,
    data.overdraft_component || 0,
    data.payment_method || null,
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

export function getDashboardStats() {
  const db = getDb();
  const result = db
    .prepare(
      `
        SELECT
          (SELECT COUNT(*) FROM students WHERE archived = 0) AS totalStudents,
          (
            SELECT COALESCE(SUM(COALESCE(a.balance, 0)), 0)
            FROM students s
            LEFT JOIN accounts a ON a.student_id = s.id
            WHERE s.archived = 0
          ) AS totalBalance,
          (
            SELECT COUNT(*)
            FROM students s
            LEFT JOIN accounts a ON a.student_id = s.id
            WHERE s.archived = 0 AND COALESCE(a.balance, 0) < 0
          ) AS studentsWithNegativeBalance,
          (
            SELECT COUNT(*)
            FROM transactions
            WHERE type = 'DEBIT'
          ) AS totalSales,
          (
            SELECT COALESCE(ABS(SUM(amount)), 0)
            FROM transactions
            WHERE type = 'DEBIT'
          ) AS totalSalesAmount
      `,
    )
    .get() as {
    totalStudents: number;
    totalBalance: number;
    studentsWithNegativeBalance: number;
    totalSales: number;
    totalSalesAmount: number;
  };

  return {
    totalStudents: result.totalStudents || 0,
    totalBalance: result.totalBalance || 0,
    studentsWithNegativeBalance: result.studentsWithNegativeBalance || 0,
    totalSales: result.totalSales || 0,
    totalSalesAmount: result.totalSalesAmount || 0,
  };
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

export interface WeeklyTopupData {
  week: string;
  amount: number;
  weekStart: string;
}

export function getWeeklyTopupData(weeks: number = 12): WeeklyTopupData[] {
  const db = getDb();

  // Get top-up transactions from the last N weeks, grouped by week
  // SQLite doesn't support 'weeks' modifier, so we convert to days
  const days = weeks * 7;
  const stmt = db.prepare(`
    SELECT 
      date(created_at, 'weekday 0', '-6 days') as week_start,
      SUM(amount) as total_amount
    FROM transactions
    WHERE 
      type = 'TOPUP' 
      AND created_at >= date('now', '-${days} days')
    GROUP BY week_start
    ORDER BY week_start ASC
  `);

  const results = stmt.all() as { week_start: string; total_amount: number }[];

  // Format the data for the chart
  return results.map((row) => {
    const date = new Date(row.week_start);
    const weekLabel = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return {
      week: weekLabel,
      amount: row.total_amount || 0,
      weekStart: row.week_start,
    };
  });
}

export function getTotalSalesCount(): number {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE type = 'DEBIT'
  `);
  const result = stmt.get() as { count: number };
  return result.count || 0;
}

export function getTotalSalesAmount(): number {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT SUM(amount) as total
    FROM transactions
    WHERE type = 'DEBIT'
  `);
  const result = stmt.get() as { total: number };
  // DEBIT amounts are negative, so we return the absolute value
  return Math.abs(result.total || 0);
}

export function getTransactionsPage({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}) {
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(Math.max(pageSize, 10), 200);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const db = getDb();

  const total = (
    db.prepare("SELECT COUNT(*) AS count FROM transactions").get() as {
      count: number;
    }
  ).count;

  const items = db
    .prepare(
      `
        SELECT
          t.id,
          t.student_id,
          t.card_uid,
          t.type,
          t.amount,
          t.overdraft_component,
          t.payment_method,
          t.description,
          t.staff,
          t.created_at,
          s.name as student_name
        FROM transactions t
        JOIN students s ON t.student_id = s.id
        ORDER BY t.created_at DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(normalizedPageSize, offset) as TransactionWithStudent[];

  return {
    items,
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
  };
}
