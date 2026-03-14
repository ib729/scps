import { z } from "zod";
import type { NFCReader, PosDefaultMode } from "./pos-preferences";

// Student schemas
export const studentSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const createStudentSchema = z.object({
  name: z.string().min(1).max(255),
});

export type Student = z.infer<typeof studentSchema>;
export type CreateStudent = z.infer<typeof createStudentSchema>;

// Card schemas
export const cardSchema = z.object({
  card_uid: z.string(),
  student_id: z.number().int().positive(),
  status: z.enum(["active", "revoked"]),
  issued_at: z.string(),
});

export const createCardSchema = z.object({
  card_uid: z.string().min(1),
  student_id: z.number().int().positive(),
  status: z.enum(["active", "revoked"]).default("active"),
});

export type Card = z.infer<typeof cardSchema>;
export type CreateCard = z.infer<typeof createCardSchema>;

// Account schemas
export const accountSchema = z.object({
  student_id: z.number().int().positive(),
  balance: z.number().int(), // stored as cents internally
  max_overdraft_week: z.number().int().nonnegative(), // stored as cents internally
});

export const updateAccountSchema = z.object({
  balance: z.number().int().optional(), // stored as cents internally
  max_overdraft_week: z.number().int().nonnegative().optional(), // stored as cents internally
});

export type Account = z.infer<typeof accountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;

// Transaction schemas
export const transactionSchema = z.object({
  id: z.number().int().positive(),
  student_id: z.number().int().positive(),
  card_uid: z.string().nullable(),
  type: z.enum(["TOPUP", "DEBIT", "ADJUST"]),
  amount: z.number().int(), // stored as cents internally
  overdraft_component: z.number().int(), // stored as cents internally
  payment_method: z.string().nullable(),
  description: z.string().nullable(),
  staff: z.string().nullable(),
  created_at: z.string(),
});

export const createTransactionSchema = z.object({
  student_id: z.number().int().positive(),
  card_uid: z.string().optional(),
  type: z.enum(["TOPUP", "DEBIT", "ADJUST"]),
  amount: z.number().int(), // stored as cents internally
  overdraft_component: z.number().int().default(0), // stored as cents internally
  payment_method: z.string().optional(),
  description: z.string().optional(),
  staff: z.string().optional(),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type CreateTransaction = z.infer<typeof createTransactionSchema>;

// Overdraft week schemas
export const overdraftWeekSchema = z.object({
  student_id: z.number().int().positive(),
  week_start_utc: z.string(),
  used: z.number().int().nonnegative(), // stored as cents internally
});

export type OverdraftWeek = z.infer<typeof overdraftWeekSchema>;

// Extended types for joins
export type StudentWithAccount = Student & {
  balance: number;
  max_overdraft_week: number;
};

export type TransactionWithStudent = Transaction & {
  student_name: string;
};

export type TransactionNoteHistory = {
  id: number;
  transaction_id: number;
  previous_description: string | null;
  new_description: string | null;
  edited_by: string | null;
  edited_at: string;
};

export type TransactionListCursor = {
  createdAt: string;
  id: number;
};

export type CardWithStudent = Card & {
  student_name: string;
};

export type UserPreferences = {
  user_id: string;
  selected_reader: NFCReader;
  pos_default_mode: PosDefaultMode;
  updated_at: string;
};
