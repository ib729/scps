import { getDb } from "../db";
import type { Card, CreateCard, CardWithStudent } from "../models";

export function getAllCards(): CardWithStudent[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      c.card_uid,
      c.student_id,
      c.status,
      c.issued_at,
      s.name as student_name
    FROM cards c
    JOIN students s ON c.student_id = s.id
    ORDER BY c.issued_at DESC
  `);
  return stmt.all() as CardWithStudent[];
}

export function getCardByUid(cardUid: string): CardWithStudent | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      c.card_uid,
      c.student_id,
      c.status,
      c.issued_at,
      s.name as student_name
    FROM cards c
    JOIN students s ON c.student_id = s.id
    WHERE c.card_uid = ?
  `);
  return stmt.get(cardUid) as CardWithStudent | undefined;
}

export function getCardsByStudentId(studentId: number): Card[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM cards WHERE student_id = ? ORDER BY issued_at DESC"
  );
  return stmt.all(studentId) as Card[];
}

export function createCard(data: CreateCard): Card {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO cards (card_uid, student_id, status, issued_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  stmt.run(data.card_uid, data.student_id, data.status);

  const getStmt = db.prepare("SELECT * FROM cards WHERE card_uid = ?");
  return getStmt.get(data.card_uid) as Card;
}

export function updateCardStatus(
  cardUid: string,
  status: "active" | "revoked"
): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE cards SET status = ? WHERE card_uid = ?");
  stmt.run(status, cardUid);
}

export function deleteCard(cardUid: string): void {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM cards WHERE card_uid = ?");
  stmt.run(cardUid);
}

