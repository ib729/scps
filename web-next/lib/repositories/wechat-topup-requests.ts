import { getDb } from "../db";
import { formatCurrency, toDbValue } from "../currency";
import type {
  CustomerWithAccount,
  CustomerPaymentRequest,
  Transaction,
  WechatTopupRequestWithCustomer,
} from "../models";
import { getCustomerById } from "./customers";
import { adjustBalance } from "./accounts";
import { createTransaction } from "./transactions";

const REQUEST_EXPIRY_MINUTES = 15;

export function parseWechatTopupAmount(input: string): number {
  const value = input.trim();
  const cents = toDbValue(Number(value));
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || !Number.isSafeInteger(cents) || cents <= 0 || !Number.isSafeInteger(cents + 99)) {
    throw new Error("Enter a positive amount with at most two decimal places");
  }
  return cents;
}

function expirePendingRequests(database = getDb()) {
  database
    .prepare(
      `
        UPDATE wechat_topup_requests
        SET
          status = 'expired',
          reviewed_at = datetime('now')
        WHERE status = 'pending'
          AND claimed_at IS NULL
          AND expires_at <= datetime('now')
      `,
    )
    .run();
}

function listActivePayableAmounts(database = getDb()) {
  expirePendingRequests(database);

  return new Set(
    (
      database
        .prepare(
          `
            SELECT payable_amount
            FROM wechat_topup_requests
            WHERE status = 'pending'
          `,
        )
        .all() as Array<{ payable_amount: number }>
    ).map((row) => row.payable_amount),
  );
}

export function getWechatTopupRequestById(
  id: number,
  database = getDb(),
): WechatTopupRequestWithCustomer | undefined {
  const row = database
    .prepare(
      `
        SELECT
          r.id,
          r.customer_id,
          r.requested_amount,
          r.payable_amount,
          r.status,
          r.created_by_user_id,
          r.created_by_name,
          r.internal_note,
          r.review_note,
          r.reviewed_by_user_id,
          r.reviewed_by_name,
          r.approved_transaction_id,
          r.created_at,
          r.expires_at,
          r.claimed_at,
          r.reviewed_at,
          s.name AS customer_name
        FROM wechat_topup_requests r
        JOIN customers s ON s.id = r.customer_id
        WHERE r.id = ?
        LIMIT 1
      `,
    )
    .get(id) as WechatTopupRequestWithCustomer | undefined;

  return row;
}

export function generateUniquePayableAmount(
  requestedAmount: number,
  database = getDb(),
) {
  const activePayableAmounts = listActivePayableAmounts(database);

  for (let delta = 1; delta <= 99; delta += 1) {
    const candidate = requestedAmount + delta;
    if (!activePayableAmounts.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Too many active requests at this amount. Try again in a moment.",
  );
}

export function createWechatTopupRequest(params: {
  customerId: number;
  requestedAmount: number;
  createdByUserId: string;
  createdByName: string;
  internalNote?: string | null;
}) {
  const db = getDb();
  return db.transaction(() => {
    expirePendingRequests(db);
    if (!Number.isSafeInteger(params.requestedAmount) || params.requestedAmount < 1 || !Number.isSafeInteger(params.requestedAmount + 99)) {
      throw new Error("Enter a positive amount with at most two decimal places");
    }
    const customer = db.prepare("SELECT s.id FROM customers s JOIN accounts a ON a.customer_id=s.id WHERE s.id=? AND s.archived=0").get(params.customerId);
    if (!customer) throw new Error("Customer account is unavailable");

  const payableAmount = generateUniquePayableAmount(params.requestedAmount, db);

  const insert = db.prepare(
    `
      INSERT INTO wechat_topup_requests (
        customer_id,
        requested_amount,
        payable_amount,
        created_by_user_id,
        created_by_name,
        internal_note,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+${REQUEST_EXPIRY_MINUTES} minutes'))
    `,
  );

  const result = insert.run(
    params.customerId,
    params.requestedAmount,
    payableAmount,
    params.createdByUserId,
    params.createdByName,
    params.internalNote?.trim() || null,
  );

    return getWechatTopupRequestById(Number(result.lastInsertRowid), db)!;
  }).immediate();
}

export function listWechatTopupRequests(options: { customerId?: number; pendingOnly?: boolean; limit?: number } = {}): WechatTopupRequestWithCustomer[] {
  const db = getDb();
  expirePendingRequests(db);

  return db
    .prepare(
      `
        SELECT
          r.id,
          r.customer_id,
          r.requested_amount,
          r.payable_amount,
          r.status,
          r.created_by_user_id,
          r.created_by_name,
          r.internal_note,
          r.review_note,
          r.reviewed_by_user_id,
          r.reviewed_by_name,
          r.approved_transaction_id,
          r.created_at,
          r.expires_at,
          r.claimed_at,
          r.reviewed_at,
          s.name AS customer_name
        FROM wechat_topup_requests r
        JOIN customers s ON s.id = r.customer_id
        WHERE (? IS NULL OR r.customer_id = ?)
          AND CASE WHEN ? THEN r.status = 'pending' ELSE r.status <> 'pending' END
        ORDER BY
          ${options.pendingOnly
            ? "(r.claimed_at IS NULL), r.claimed_at DESC, r.created_at DESC, r.id DESC"
            : "COALESCE(r.reviewed_at, r.created_at) DESC, r.id DESC"}
        LIMIT ?
      `,
    )
    .all(options.customerId ?? null, options.customerId ?? null, Number(!!options.pendingOnly), options.limit ?? (options.pendingOnly ? -1 : 50)) as WechatTopupRequestWithCustomer[];
}

export function markWechatTopupRequestClaimed(requestId: number): { request: WechatTopupRequestWithCustomer; newlyClaimed: boolean } {
  const db = getDb();

  return db.transaction(() => {
    expirePendingRequests(db);

    const request = getWechatTopupRequestById(requestId, db);
    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      throw new Error("This request can no longer be marked as paid");
    }

    if (request.claimed_at) {
      return { request, newlyClaimed: false };
    }

    db.prepare(
      `
        UPDATE wechat_topup_requests
        SET claimed_at = datetime('now')
        WHERE id = ? AND status = 'pending' AND claimed_at IS NULL
      `,
    ).run(request.id);

    return { request: getWechatTopupRequestById(request.id, db)!, newlyClaimed: true };
  }).immediate();
}

export function approveWechatTopupRequest(params: {
  requestId: number;
  reviewedByUserId: string;
  reviewedByName: string;
  reviewNote?: string | null;
}): { request: WechatTopupRequestWithCustomer; transaction: Transaction; customer: CustomerWithAccount } {
  const db = getDb();

  return db.transaction(() => {
    expirePendingRequests(db);

    const request = getWechatTopupRequestById(params.requestId, db);
    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      throw new Error("This request can no longer be approved");
    }

    if (!request.claimed_at) {
      throw new Error("Payment must be marked as sent before approval");
    }

    const customer = getCustomerById(request.customer_id);
    if (!customer) {
      throw new Error("Customer not found");
    }

    const descriptionParts = [
      `WCP request #${request.id}`,
      `paid ¥${formatCurrency(request.payable_amount)}`,
    ];
    const internalNote = request.internal_note?.trim();
    if (internalNote) {
      descriptionParts.push(internalNote);
    }

    const transaction = createTransaction({
      customer_id: request.customer_id,
      type: "TOPUP",
      amount: request.requested_amount,
      overdraft_component: 0,
      payment_method: "WeChat",
      description: descriptionParts.join(" • "),
      staff: params.reviewedByName,
    });

    adjustBalance(request.customer_id, request.requested_amount);

    db.prepare(
      `
        UPDATE wechat_topup_requests
        SET
          status = 'approved',
          reviewed_by_user_id = ?,
          reviewed_by_name = ?,
          review_note = ?,
          approved_transaction_id = ?,
          reviewed_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `,
    ).run(
      params.reviewedByUserId,
      params.reviewedByName,
      params.reviewNote?.trim() || null,
      transaction.id,
      request.id,
    );

    return {
      request: getWechatTopupRequestById(request.id, db)!,
      transaction,
      customer: {
        ...customer,
        balance: customer.balance + request.requested_amount,
      } as CustomerWithAccount,
    };
  }).immediate();
}

export function rejectWechatTopupRequest(params: {
  requestId: number;
  reviewedByUserId: string;
  reviewedByName: string;
  reviewNote?: string | null;
}) {
  const db = getDb();

  return db.transaction(() => {
    expirePendingRequests(db);

    const request = getWechatTopupRequestById(params.requestId, db);
    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      throw new Error("This request can no longer be rejected");
    }

    db.prepare(
      `
        UPDATE wechat_topup_requests
        SET
          status = 'rejected',
          reviewed_by_user_id = ?,
          reviewed_by_name = ?,
          review_note = ?,
          reviewed_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `,
    ).run(
      params.reviewedByUserId,
      params.reviewedByName,
      params.reviewNote?.trim() || null,
      request.id,
    );

    return getWechatTopupRequestById(request.id, db)!;
  }).immediate();
}

export function toCustomerPaymentRequest(request: WechatTopupRequestWithCustomer): CustomerPaymentRequest {
  const { id, requested_amount, payable_amount, status, created_at, expires_at, claimed_at, reviewed_at, review_note, approved_transaction_id } = request;
  return { id, requested_amount, payable_amount, status, created_at, expires_at, claimed_at, reviewed_at, review_note, approved_transaction_id };
}
