import { getDb } from "../db";
import type { OverdraftWeek } from "../models";

export function getOverdraftWeek(
  customerId: number,
  weekStartUtc: string
): OverdraftWeek | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM overdraft_weeks
    WHERE customer_id = ? AND week_start_utc = ?
  `);
  return stmt.get(customerId, weekStartUtc) as OverdraftWeek | undefined;
}

export function upsertOverdraftWeek(
  customerId: number,
  weekStartUtc: string,
  used: number
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO overdraft_weeks (customer_id, week_start_utc, used)
    VALUES (?, ?, ?)
    ON CONFLICT(customer_id, week_start_utc)
    DO UPDATE SET used = excluded.used
  `);
  stmt.run(customerId, weekStartUtc, used);
}

export function getAllOverdraftWeeks(): OverdraftWeek[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM overdraft_weeks ORDER BY week_start_utc DESC");
  return stmt.all() as OverdraftWeek[];
}

export function deleteOverdraftWeek(customerId: number, weekStartUtc: string): void {
  const db = getDb();
  const stmt = db.prepare(
    "DELETE FROM overdraft_weeks WHERE customer_id = ? AND week_start_utc = ?"
  );
  stmt.run(customerId, weekStartUtc);
}

// Helper to calculate the current week start in UTC (Monday 00:00 Asia/Shanghai)
export function getCurrentWeekStartUtc(now: Date = new Date()): string {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const daysToSubtract = (shanghai.getUTCDay() + 6) % 7;
  shanghai.setUTCDate(shanghai.getUTCDate() - daysToSubtract);
  shanghai.setUTCHours(0, 0, 0, 0);
  return new Date(shanghai.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

