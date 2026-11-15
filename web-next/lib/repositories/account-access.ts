import { getDb } from "../db";
import type { UserRole } from "../auth-session";
import type { UserAccessSummary } from "../models";

export function getLinkedStudentId(userId: string): number | undefined {
  const row = getDb().prepare(`
    SELECT l.student_id FROM user_student_links l
    JOIN students s ON s.id = l.student_id AND s.archived = 0
    JOIN accounts a ON a.student_id = s.id
    WHERE l.user_id = ?
  `).get(userId) as { student_id: number } | undefined;
  return row?.student_id;
}

export function listUserAccess(): UserAccessSummary[] {
  return getDb().prepare(`
    SELECT u.id,u.name,u.email,u.role,u.createdAt,l.student_id AS studentId,s.name AS studentName
    FROM user u LEFT JOIN user_student_links l ON l.user_id=u.id
    LEFT JOIN students s ON s.id=l.student_id
    ORDER BY (u.role='student' AND l.student_id IS NULL) DESC,u.createdAt DESC,u.id
  `).all() as UserAccessSummary[];
}

export function approveStudentRegistration(actorUserId: string, userId: string, studentId: number): void {
  const db = getDb();
  db.transaction(() => {
    const actor = db.prepare("SELECT role FROM user WHERE id=?").pluck().get(actorUserId);
    if (actor !== "admin") throw new Error("Forbidden");
    const role = db.prepare("SELECT role FROM user WHERE id=?").pluck().get(userId);
    if (role !== "student") throw new Error("A student registration is required");
    const link = db.prepare("SELECT student_id FROM user_student_links WHERE user_id=?").pluck().get(userId);
    if (link !== undefined && link !== studentId) throw new Error("User is already linked to a different student");
    const student = db.prepare("SELECT s.id FROM students s JOIN accounts a ON a.student_id=s.id WHERE s.id=? AND s.archived=0").get(studentId);
    if (!student) throw new Error("Student account is unavailable");
    const owner = db.prepare("SELECT user_id FROM user_student_links WHERE student_id=?").pluck().get(studentId);
    if (owner !== undefined && owner !== userId) throw new Error("Student is already linked to another user");
    if (link === undefined) db.prepare("INSERT INTO user_student_links(user_id,student_id) VALUES(?,?)").run(userId,studentId);
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
