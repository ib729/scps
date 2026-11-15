import { getDb } from "../db";
import type { Card, CreateCard, CardWithCustomer } from "../models";

export function getAllCards(): CardWithCustomer[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      c.card_uid,
      c.customer_id,
      c.status,
      c.issued_at,
      s.name as customer_name
    FROM cards c
    JOIN customers s ON c.customer_id = s.id
    ORDER BY c.issued_at DESC
  `);
  return stmt.all() as CardWithCustomer[];
}

export function getCardByUid(cardUid: string): CardWithCustomer | undefined {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      c.card_uid,
      c.customer_id,
      c.status,
      c.issued_at,
      s.name as customer_name
    FROM cards c
    JOIN customers s ON c.customer_id = s.id
    WHERE c.card_uid = ?
  `);
  return stmt.get(cardUid) as CardWithCustomer | undefined;
}

export function getCardsByCustomerId(customerId: number): Card[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM cards WHERE customer_id = ? ORDER BY issued_at DESC"
  );
  return stmt.all(customerId) as Card[];
}

export function createCard(data: CreateCard): Card {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO cards (card_uid, customer_id, status, issued_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  stmt.run(data.card_uid, data.customer_id, data.status);

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

