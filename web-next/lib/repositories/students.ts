import { getDb } from "../db";
import type {
  Student,
  CreateStudent,
  StudentWithAccount,
} from "../models";

export function getAllStudents(): StudentWithAccount[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.name,
      COALESCE(a.balance, 0) as balance,
      COALESCE(a.max_overdraft_week, 20) as max_overdraft_week
    FROM students s
    LEFT JOIN accounts a ON s.id = a.student_id
    ORDER BY s.name ASC
  `);
  return stmt.all() as StudentWithAccount[];
}

export function getStudentById(id: number): StudentWithAccount | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.name,
      COALESCE(a.balance, 0) as balance,
      COALESCE(a.max_overdraft_week, 20) as max_overdraft_week
    FROM students s
    LEFT JOIN accounts a ON s.id = a.student_id
    WHERE s.id = ?
  `);
  return stmt.get(id) as StudentWithAccount | undefined;
}

export function getStudentByName(name: string): Student | undefined {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM students WHERE name = ?");
  return stmt.get(name) as Student | undefined;
}

export function createStudent(data: CreateStudent): Student {
  const db = getDb();
  const insertStudent = db.prepare("INSERT INTO students (name) VALUES (?)");
  const createAccount = db.prepare(
    "INSERT INTO accounts (student_id, balance, max_overdraft_week) VALUES (?, 0, 20)"
  );

  const result = db.transaction(() => {
    const info = insertStudent.run(data.name);
    const studentId = Number(info.lastInsertRowid);
    createAccount.run(studentId);
    return { id: studentId, name: data.name };
  })();

  return result;
}

export function updateStudent(id: number, data: Partial<CreateStudent>): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE students SET name = ? WHERE id = ?");
  stmt.run(data.name, id);
}

export function deleteStudent(id: number): void {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM students WHERE id = ?");
  stmt.run(id);
}

export function searchStudents(query: string): StudentWithAccount[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      s.id, 
      s.name,
      COALESCE(a.balance, 0) as balance,
      COALESCE(a.max_overdraft_week, 20) as max_overdraft_week
    FROM students s
    LEFT JOIN accounts a ON s.id = a.student_id
    WHERE s.name LIKE ?
    ORDER BY s.name ASC
  `);
  return stmt.all(`%${query}%`) as StudentWithAccount[];
}

