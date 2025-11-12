import { z } from "zod";

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
  balance: z.number().int(), // stored as tenths internally
  max_overdraft_week: z.number().int().nonnegative(), // stored as tenths internally
});

export const updateAccountSchema = z.object({
  balance: z.number().int().optional(), // stored as tenths internally
  max_overdraft_week: z.number().int().nonnegative().optional(), // stored as tenths internally
});

export type Account = z.infer<typeof accountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;

// Transaction schemas
export const transactionSchema = z.object({
  id: z.number().int().positive(),
  student_id: z.number().int().positive(),
  card_uid: z.string().nullable(),
  type: z.enum(["TOPUP", "DEBIT", "ADJUST"]),
  amount: z.number().int(), // stored as tenths internally
  overdraft_component: z.number().int(), // stored as tenths internally
  description: z.string().nullable(),
  staff: z.string().nullable(),
  created_at: z.string(),
});

export const createTransactionSchema = z.object({
  student_id: z.number().int().positive(),
  card_uid: z.string().optional(),
  type: z.enum(["TOPUP", "DEBIT", "ADJUST"]),
  amount: z.number().int(), // stored as tenths internally
  overdraft_component: z.number().int().default(0), // stored as tenths internally
  description: z.string().optional(),
  staff: z.string().optional(),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type CreateTransaction = z.infer<typeof createTransactionSchema>;

// Overdraft week schemas
export const overdraftWeekSchema = z.object({
  student_id: z.number().int().positive(),
  week_start_utc: z.string(),
  used: z.number().int().nonnegative(), // stored as tenths internally
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

export type CardWithStudent = Card & {
  student_name: string;
};

// User schemas
export const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
  password_hash: z.string(),
  avatar: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(6),
  avatar: z.string().optional(),
});

export const updateUserProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  avatar: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;

