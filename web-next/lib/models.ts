import { z } from "zod";
import type { NFCReader, PosDefaultMode } from "./pos-preferences";
import type { UserRole } from "./auth-session";

export type UserAccessSummary = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string | number;
  customerId: number | null;
  customerName: string | null;
};

// Customer schemas
export const customerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
});

export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomer = z.infer<typeof createCustomerSchema>;

// Card schemas
export const cardSchema = z.object({
  card_uid: z.string(),
  customer_id: z.number().int().positive(),
  status: z.enum(["active", "revoked"]),
  issued_at: z.string(),
});

export const createCardSchema = z.object({
  card_uid: z.string().min(1),
  customer_id: z.number().int().positive(),
  status: z.enum(["active", "revoked"]).default("active"),
});

export type Card = z.infer<typeof cardSchema>;
export type CreateCard = z.infer<typeof createCardSchema>;

// Account schemas
export const accountSchema = z.object({
  customer_id: z.number().int().positive(),
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
  customer_id: z.number().int().positive(),
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
  customer_id: z.number().int().positive(),
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
  customer_id: z.number().int().positive(),
  week_start_utc: z.string(),
  used: z.number().int().nonnegative(), // stored as cents internally
});

export type OverdraftWeek = z.infer<typeof overdraftWeekSchema>;

// Extended types for joins
export type CustomerWithAccount = Customer & {
  balance: number;
  max_overdraft_week: number;
};

export type TransactionWithCustomer = Transaction & {
  customer_name: string;
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

export type CardWithCustomer = Card & {
  customer_name: string;
};

export type UserPreferences = {
  user_id: string;
  selected_reader: NFCReader;
  pos_default_mode: PosDefaultMode;
  updated_at: string;
};

export const wechatTopupRequestStatusValues = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
] as const;

export type WechatTopupRequestStatus =
  (typeof wechatTopupRequestStatusValues)[number];

export type WechatTopupRequest = {
  id: number;
  customer_id: number;
  requested_amount: number;
  payable_amount: number;
  status: WechatTopupRequestStatus;
  created_by_user_id: string;
  created_by_name: string | null;
  internal_note: string | null;
  review_note: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name: string | null;
  approved_transaction_id: number | null;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  reviewed_at: string | null;
};

export type WechatTopupRequestWithCustomer = WechatTopupRequest & {
  customer_name: string;
};

export type CustomerPaymentRequest = Pick<WechatTopupRequest,
  "id" | "requested_amount" | "payable_amount" | "status" | "created_at" | "expires_at" | "claimed_at" | "reviewed_at" | "review_note" | "approved_transaction_id">;
export type CustomerTransaction = Pick<Transaction,
  "id" | "type" | "amount" | "payment_method" | "created_at">;

export type CustomerPortalData = {
  customer: { id: number; name: string; balance: number };
  transactions: CustomerTransaction[];
  pendingRequests: CustomerPaymentRequest[];
  recentRequests: CustomerPaymentRequest[];
};
