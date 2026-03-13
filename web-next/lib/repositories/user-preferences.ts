import { getDb } from "../db";
import type { UserPreferences } from "../models";
import {
  DEFAULT_NFC_READER,
  DEFAULT_POS_MODE,
  parseNfcReader,
  parsePosDefaultMode,
  type NFCReader,
  type PosDefaultMode,
} from "../pos-preferences";

function normalizePreferencesRow(
  row:
    | {
        user_id: string;
        selected_reader: string;
        pos_default_mode: string;
        updated_at: string;
      }
    | undefined,
  userId: string,
): UserPreferences {
  return {
    user_id: userId,
    selected_reader: parseNfcReader(row?.selected_reader),
    pos_default_mode: parsePosDefaultMode(row?.pos_default_mode),
    updated_at: row?.updated_at ?? new Date(0).toISOString(),
  };
}

export function getUserPreferencesByUserId(userId: string): UserPreferences {
  const db = getDb();

  const existing = db
    .prepare(
      `
        SELECT user_id, selected_reader, pos_default_mode, updated_at
        FROM user_preferences
        WHERE user_id = ?
        LIMIT 1
      `,
    )
    .get(userId) as
    | {
        user_id: string;
        selected_reader: string;
        pos_default_mode: string;
        updated_at: string;
      }
    | undefined;

  if (existing) {
    return normalizePreferencesRow(existing, userId);
  }

  db.prepare(
    `
      INSERT INTO user_preferences (user_id, selected_reader, pos_default_mode)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `,
  ).run(userId, DEFAULT_NFC_READER, DEFAULT_POS_MODE);

  const created = db
    .prepare(
      `
        SELECT user_id, selected_reader, pos_default_mode, updated_at
        FROM user_preferences
        WHERE user_id = ?
        LIMIT 1
      `,
    )
    .get(userId) as
    | {
        user_id: string;
        selected_reader: string;
        pos_default_mode: string;
        updated_at: string;
      }
    | undefined;

  return normalizePreferencesRow(created, userId);
}

export function updateUserPreferencesByUserId(
  userId: string,
  updates: {
    selectedReader: NFCReader;
    posDefaultMode: PosDefaultMode;
  },
): UserPreferences {
  const db = getDb();

  db.prepare(
    `
      INSERT INTO user_preferences (
        user_id,
        selected_reader,
        pos_default_mode,
        updated_at
      )
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        selected_reader = excluded.selected_reader,
        pos_default_mode = excluded.pos_default_mode,
        updated_at = excluded.updated_at
    `,
  ).run(userId, updates.selectedReader, updates.posDefaultMode);

  return getUserPreferencesByUserId(userId);
}
