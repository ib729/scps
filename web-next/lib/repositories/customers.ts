import { getDb } from "../db";
import type {
  Customer,
  CreateCustomer,
  CustomerWithAccount,
} from "../models";

export function getAllCustomers(): CustomerWithAccount[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.name,
      COALESCE(a.balance, 0) as balance,
      COALESCE(a.max_overdraft_week, 0) as max_overdraft_week
    FROM customers s
    LEFT JOIN accounts a ON s.id = a.customer_id
    WHERE s.archived = 0
    ORDER BY s.name ASC
  `);
  return stmt.all() as CustomerWithAccount[];
}

export function getCustomerById(id: number): CustomerWithAccount | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.name,
      COALESCE(a.balance, 0) as balance,
      COALESCE(a.max_overdraft_week, 0) as max_overdraft_week
    FROM customers s
    LEFT JOIN accounts a ON s.id = a.customer_id
    WHERE s.id = ?
  `);
  return stmt.get(id) as CustomerWithAccount | undefined;
}

export function getCustomerByName(name: string): Customer | undefined {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM customers WHERE name = ?");
  return stmt.get(name) as Customer | undefined;
}

export function createCustomer(data: CreateCustomer): Customer {
  const db = getDb();
  const insertCustomer = db.prepare("INSERT INTO customers (name) VALUES (?)");
  const createAccount = db.prepare(
    "INSERT INTO accounts (customer_id, balance, max_overdraft_week) VALUES (?, 0, 0)"
  );

  const result = db.transaction(() => {
    const info = insertCustomer.run(data.name);
    const customerId = Number(info.lastInsertRowid);
    createAccount.run(customerId);
    return { id: customerId, name: data.name };
  })();

  return result;
}

export function updateCustomer(id: number, data: Partial<CreateCustomer>): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE customers SET name = ? WHERE id = ?");
  stmt.run(data.name, id);
}

export function deleteCustomer(id: number): void {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM customers WHERE id = ?");
  stmt.run(id);
}

export function archiveCustomer(id: number): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE customers SET archived = 1 WHERE id = ?");
  stmt.run(id);
}

export function hasTransactions(id: number): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE customer_id = ?"
  );
  const result = stmt.get(id) as { count: number };
  return result.count > 0;
}

export function searchCustomers(query: string, limit: number = 10): CustomerWithAccount[] {
  const db = getDb();
  const normalizedQuery = query.trim().toLowerCase();
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.name,
      COALESCE(a.balance, 0) as balance,
      COALESCE(a.max_overdraft_week, 0) as max_overdraft_week
    FROM customers s
    LEFT JOIN accounts a ON s.id = a.customer_id
    WHERE lower(s.name) LIKE ? AND s.archived = 0
    ORDER BY
      CASE
        WHEN lower(s.name) = ? THEN 0
        WHEN lower(s.name) LIKE ? THEN 1
        WHEN lower(s.name) LIKE ? THEN 2
        ELSE 3
      END,
      instr(lower(s.name), ?),
      s.name ASC
    LIMIT ?
  `);
  return stmt.all(
    `%${normalizedQuery}%`,
    normalizedQuery,
    `${normalizedQuery}%`,
    `% ${normalizedQuery}%`,
    normalizedQuery,
    limit,
  ) as CustomerWithAccount[];
}
