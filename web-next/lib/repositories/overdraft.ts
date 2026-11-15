import { getDb } from "../db";
import type { OverdraftWeek } from "../models";

export function getOverdraftWeek(
  studentId: number,
  weekStartUtc: string
): OverdraftWeek | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM overdraft_weeks
    WHERE student_id = ? AND week_start_utc = ?
  `);
  return stmt.get(studentId, weekStartUtc) as OverdraftWeek | undefined;
}

export function upsertOverdraftWeek(
  studentId: number,
  weekStartUtc: string,
  used: number
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO overdraft_weeks (student_id, week_start_utc, used)
    VALUES (?, ?, ?)
    ON CONFLICT(student_id, week_start_utc)
    DO UPDATE SET used = excluded.used
  `);
  stmt.run(studentId, weekStartUtc, used);
}

export function getAllOverdraftWeeks(): OverdraftWeek[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM overdraft_weeks ORDER BY week_start_utc DESC");
  return stmt.all() as OverdraftWeek[];
}

export function deleteOverdraftWeek(studentId: number, weekStartUtc: string): void {
  const db = getDb();
  const stmt = db.prepare(
    "DELETE FROM overdraft_weeks WHERE student_id = ? AND week_start_utc = ?"
  );
  stmt.run(studentId, weekStartUtc);
}

// Helper to calculate the current week start in UTC (Monday 00:00 Asia/Shanghai)
export function getCurrentWeekStartUtc(now: Date = new Date()): string {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const daysToSubtract = (shanghai.getUTCDay() + 6) % 7;
  shanghai.setUTCDate(shanghai.getUTCDate() - daysToSubtract);
  shanghai.setUTCHours(0, 0, 0, 0);
  return new Date(shanghai.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

