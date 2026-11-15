import { getDb } from "../db";
import type { UserRole } from "../auth-session";
import type { UserAccessSummary } from "../models";

export function getLinkedCustomerId(userId: string): number | undefined {
  const row = getDb().prepare(`
    SELECT l.customer_id FROM user_customer_links l
    JOIN customers s ON s.id = l.customer_id AND s.archived = 0
    JOIN accounts a ON a.customer_id = s.id
    WHERE l.user_id = ?
  `).get(userId) as { customer_id: number } | undefined;
  return row?.customer_id;
}

export function listUserAccess(): UserAccessSummary[] {
  return getDb().prepare(`
    SELECT u.id,u.name,u.email,u.role,u.createdAt,l.customer_id AS customerId,s.name AS customerName
    FROM user u LEFT JOIN user_customer_links l ON l.user_id=u.id
    LEFT JOIN customers s ON s.id=l.customer_id
    ORDER BY (u.role='customer' AND l.customer_id IS NULL) DESC,u.createdAt DESC,u.id
  `).all() as UserAccessSummary[];
}

export function approveCustomerRegistration(actorUserId: string, userId: string, customerId: number): void {
  const db = getDb();
  db.transaction(() => {
    const actor = db.prepare("SELECT role FROM user WHERE id=?").pluck().get(actorUserId);
    if (actor !== "admin") throw new Error("Forbidden");
    const role = db.prepare("SELECT role FROM user WHERE id=?").pluck().get(userId);
    if (role !== "customer") throw new Error("A customer registration is required");
    const link = db.prepare("SELECT customer_id FROM user_customer_links WHERE user_id=?").pluck().get(userId);
    if (link !== undefined && link !== customerId) throw new Error("User is already linked to a different customer");
    const customer = db.prepare("SELECT s.id FROM customers s JOIN accounts a ON a.customer_id=s.id WHERE s.id=? AND s.archived=0").get(customerId);
    if (!customer) throw new Error("Customer account is unavailable");
    const owner = db.prepare("SELECT user_id FROM user_customer_links WHERE customer_id=?").pluck().get(customerId);
    if (owner !== undefined && owner !== userId) throw new Error("Customer is already linked to another user");
    if (link === undefined) db.prepare("INSERT INTO user_customer_links(user_id,customer_id) VALUES(?,?)").run(userId,customerId);
  }).immediate();
}

export function setUserRole(actorUserId: string, userId: string, role: UserRole): void {
  const db = getDb();
  db.transaction(() => {
    if (db.prepare("SELECT role FROM user WHERE id=?").pluck().get(actorUserId) !== "admin") throw new Error("Forbidden");
    const current = db.prepare("SELECT role FROM user WHERE id=?").pluck().get(userId);
    if (current === undefined) throw new Error("User not found");
    if (current === "admin" && role !== "admin" && db.prepare("SELECT COUNT(*) FROM user WHERE role='admin'").pluck().get() === 1) throw new Error("Cannot remove the last administrator");
    db.prepare("UPDATE user SET role=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(role,userId);
  }).immediate();
}
