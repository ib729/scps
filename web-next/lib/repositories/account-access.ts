import { getDb } from "../db";
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

export function setUserRole(actorUserId: string, userId: string, role: "staff" | "admin"): void {
  const db = getDb();
  db.transaction(() => {
    if (db.prepare("SELECT role FROM user WHERE id=?").pluck().get(actorUserId) !== "admin") throw new Error("Forbidden");
    if (role !== "staff" && role !== "admin") throw new Error("Invalid operator role");
    const current = db.prepare("SELECT role FROM user WHERE id=?").pluck().get(userId);
    if (current === undefined) throw new Error("User not found");
    if (current === "admin" && role !== "admin" && db.prepare("SELECT COUNT(*) FROM user WHERE role='admin'").pluck().get() === 1) throw new Error("Cannot remove the last administrator");
    db.prepare("UPDATE user SET role=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(role,userId);
  }).immediate();
}
