import { getDb } from "../db";
import type {
  Transaction,
  TransactionListCursor,
  CreateTransaction,
  TransactionWithStudent,
  TransactionNoteHistory,
} from "../models";

type TransactionTypeFilter = Transaction["type"];

function normalizeTransactionType(type?: string | null): TransactionTypeFilter | null {
  if (type === "TOPUP" || type === "DEBIT" || type === "ADJUST") {
    return type;
  }

  return null;
}

function buildTransactionFilters(filters?: {
  search?: string;
  type?: string | null;
}) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  const search = filters?.search?.trim().toLowerCase();
  const type = normalizeTransactionType(filters?.type);

  if (search) {
    const numericId = Number.parseInt(search, 10);
    if (Number.isInteger(numericId) && numericId.toString() === search) {
      clauses.push("(lower(s.name) LIKE ? OR t.id = ?)");
      params.push(`%${search}%`, numericId);
    } else {
      clauses.push("lower(s.name) LIKE ?");
      params.push(`%${search}%`);
    }
  }

  if (type) {
    clauses.push("t.type = ?");
    params.push(type);
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

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
    ORDER BY t.created_at DESC, t.id DESC
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
    ORDER BY created_at DESC, id DESC
  `);
  return stmt.all(studentId) as Transaction[];
}

export function getTransactionById(id: number): Transaction | undefined {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM transactions WHERE id = ?");
  return stmt.get(id) as Transaction | undefined;
}

export function getTransactionWithStudentById(id: number): TransactionWithStudent | undefined {
  const db = getDb();
  const stmt = db.prepare(`
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
    WHERE t.id = ?
    LIMIT 1
  `);
  return stmt.get(id) as TransactionWithStudent | undefined;
}

export function getTransactionNoteHistory(transactionId: number): TransactionNoteHistory[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, transaction_id, previous_description, new_description, edited_by, edited_at
    FROM transaction_note_history
    WHERE transaction_id = ?
    ORDER BY edited_at DESC, id DESC
  `);
  return stmt.all(transactionId) as TransactionNoteHistory[];
}

export function updateTransactionDescription({
  id,
  description,
  editedBy,
}: {
  id: number;
  description: string | null;
  editedBy: string | null;
}): TransactionWithStudent | undefined {
  const db = getDb();
  const normalizedDescription = description?.trim() ? description.trim() : null;

  return db.transaction(() => {
    const existing = db
      .prepare("SELECT id, description FROM transactions WHERE id = ? LIMIT 1")
      .get(id) as { id: number; description: string | null } | undefined;

    if (!existing) {
      return undefined;
    }

    if ((existing.description ?? null) === normalizedDescription) {
      return getTransactionWithStudentById(id);
    }

    db.prepare(
      `
        INSERT INTO transaction_note_history (
          transaction_id,
          previous_description,
          new_description,
          edited_by
        )
        VALUES (?, ?, ?, ?)
      `,
    ).run(id, existing.description ?? null, normalizedDescription, editedBy);

    db.prepare("UPDATE transactions SET description = ? WHERE id = ?").run(
      normalizedDescription,
      id,
    );

    return getTransactionWithStudentById(id);
  })();
}

export function createTransaction(data: CreateTransaction): Transaction {
  const db = getDb();
  const paymentMethod =
    data.type === "DEBIT" ? "Balance" : data.payment_method || null;
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
    paymentMethod,
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

export interface DashboardChartDataPoint {
  date: string;
  topups: number;
  revenue: number;
}

export function getDashboardChartData(days: number = 90): DashboardChartDataPoint[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      date(created_at) as day,
      COALESCE(SUM(CASE WHEN type = 'TOPUP' THEN amount ELSE 0 END), 0) as topups,
      COALESCE(ABS(SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END)), 0) as revenue
    FROM transactions
    WHERE 
      created_at >= date('now', '-${days - 1} days')
    GROUP BY day
    ORDER BY day ASC
  `);

  const results = stmt.all() as {
    day: string;
    topups: number;
    revenue: number;
  }[];

  const byDate = new Map(results.map((row) => [row.day, row]));
  const chartData: DashboardChartDataPoint[] = [];
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(endDate);
    current.setDate(endDate.getDate() - offset);
    const year = current.getFullYear();
    const month = `${current.getMonth() + 1}`.padStart(2, "0");
    const day = `${current.getDate()}`.padStart(2, "0");
    const key = `${year}-${month}-${day}`;
    const existing = byDate.get(key);

    chartData.push({
      date: key,
      topups: existing?.topups ?? 0,
      revenue: existing?.revenue ?? 0,
    });
  }

  return chartData;
}

export interface WeeklyTopupData {
  week: string;
  amount: number;
  weekStart: string;
}

export function getWeeklyTopupData(weeks: number = 12): WeeklyTopupData[] {
  const weeklyData = getDashboardChartData(weeks * 7);
  const buckets = new Map<string, number>();

  for (const row of weeklyData) {
    const date = new Date(`${row.date}T00:00:00`);
    const dayOfWeek = (date.getDay() + 6) % 7;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - dayOfWeek);

    const year = weekStart.getFullYear();
    const month = `${weekStart.getMonth() + 1}`.padStart(2, "0");
    const day = `${weekStart.getDate()}`.padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    buckets.set(key, (buckets.get(key) ?? 0) + row.topups);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, amount]) => {
      const date = new Date(`${weekStart}T00:00:00`);
      return {
        week: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        amount,
        weekStart,
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
        ORDER BY t.created_at DESC, t.id DESC
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

export function getTransactionsBatch({
  offset,
  limit,
  search,
  type,
}: {
  offset: number;
  limit: number;
  search?: string;
  type?: string | null;
}) {
  const normalizedOffset = Math.max(0, offset);
  const normalizedLimit = Math.min(Math.max(limit, 20), 200);
  const db = getDb();
  const { whereClause, params } = buildTransactionFilters({ search, type });

  const total = (
    db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM transactions t
          JOIN students s ON t.student_id = s.id
          ${whereClause}
        `,
      )
      .get(...params) as {
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
        ${whereClause}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(...params, normalizedLimit, normalizedOffset) as TransactionWithStudent[];

  const nextOffset = normalizedOffset + items.length;

  return {
    items,
    total,
    offset: normalizedOffset,
    limit: normalizedLimit,
    nextOffset,
    hasMore: nextOffset < total,
  };
}

export function getTransactionsCursorBatch({
  limit,
  search,
  type,
  cursor,
}: {
  limit: number;
  search?: string;
  type?: string | null;
  cursor?: TransactionListCursor | null;
}) {
  const normalizedLimit = Math.min(Math.max(limit, 20), 200);
  const db = getDb();
  const { whereClause, params } = buildTransactionFilters({ search, type });
  const cursorClause = cursor
    ? `${whereClause ? " AND" : " WHERE"} (t.created_at < ? OR (t.created_at = ? AND t.id < ?))`
    : "";
  const queryParams = cursor
    ? [...params, cursor.createdAt, cursor.createdAt, cursor.id]
    : params;

  const rows = db
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
        ${whereClause}
        ${cursorClause}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ?
      `,
    )
    .all(...queryParams, normalizedLimit + 1) as TransactionWithStudent[];

  const hasMore = rows.length > normalizedLimit;
  const items = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const lastItem = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem
      ? {
          createdAt: lastItem.created_at,
          id: lastItem.id,
        }
      : null,
  };
}
