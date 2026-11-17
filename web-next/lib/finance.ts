import type Database from "better-sqlite3";
import { z } from "zod";
import { createHash } from "node:crypto";


export type FinanceChannel = "WeChat" | "Alipay" | "Cash";
export type FinanceActor = { id: string; name: string };
export type FinanceBalanceInput = Record<FinanceChannel, string>;
export type FinanceAmounts = Record<FinanceChannel, number>;
const channelSchema = z.enum(["WeChat", "Alipay", "Cash"]);
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const balancesSchema = z.object({ WeChat: z.string(), Alipay: z.string(), Cash: z.string() }).strict();
const optionalText = (max: number) => z.string().trim().max(max).optional();
export const financeSetupSchema = z.object({
  startMonth: z.string(), balances: balancesSchema, expectedRevision: revisionSchema, reason: optionalText(1000),
}).strict();
export const financeEntrySchema = z.object({
  id: z.string().uuid(), expectedRevision: revisionSchema, kind: z.enum(["expense", "income", "transfer"]),
  date: z.string(), channel: channelSchema, toChannel: channelSchema.optional(), amount: z.string(),
  description: z.string().trim().min(1).max(500), recipient: optionalText(255), reference: optionalText(255),
  voided: z.boolean(), reason: optionalText(1000),
}).strict();
export const financeObservationSchema = z.object({
  month: z.string(), balances: balancesSchema, explanation: optionalText(1000), expectedRevision: revisionSchema,
}).strict();
export const financeCloseSchema = z.object({
  month: z.string(), expectedRevision: revisionSchema, expectedHash: z.string(), reason: optionalText(1000),
}).strict();
export type FinanceSetupInput = z.infer<typeof financeSetupSchema>;
export type FinanceEntryInput = z.infer<typeof financeEntrySchema>;
export type FinanceObservationInput = z.infer<typeof financeObservationSchema>;
export type FinanceCloseInput = z.infer<typeof financeCloseSchema>;

export class FinanceError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = "FinanceError";
  }
}

export function parseFinanceAmount(value: string, allowZero: boolean): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new FinanceError("Enter a valid amount with at most two decimal places");
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || (!allowZero && cents === 0n)) {
    throw new FinanceError("Amount is outside the allowed range");
  }
  return Number(cents);
}

export function getFinanceMonthBounds(month: string): { startUtc: string; endUtc: string } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match || Number(match[1]) < 2000) throw new FinanceError("Enter a valid month from 2000 onward");
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    startUtc: new Date(Date.UTC(year, index, 1) - 8 * 60 * 60 * 1000).toISOString(),
    endUtc: new Date(Date.UTC(year, index + 1, 1) - 8 * 60 * 60 * 1000).toISOString(),
  };
}

function parsedBalances(input: FinanceBalanceInput): FinanceAmounts {
  return { WeChat: parseFinanceAmount(input.WeChat, true), Alipay: parseFinanceAmount(input.Alipay, true), Cash: parseFinanceAmount(input.Cash, true) };
}

function checkRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new FinanceError("Records changed; reload and try again", 409);
}


function checkDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new FinanceError("Enter a valid date");
}

export function saveFinanceSetup(db: Database.Database, input: FinanceSetupInput, actor: FinanceActor): void {
  const data = financeSetupSchema.parse(input);
  getFinanceMonthBounds(data.startMonth);
  const balances = parsedBalances(data.balances);
  db.transaction(() => {
    const previous = db.prepare<[], { revision: number; start_month: string }>("SELECT revision,start_month FROM finance_setup_versions ORDER BY revision DESC LIMIT 1").get();
    checkRevision(previous?.revision ?? 0, data.expectedRevision);
    if (previous && previous.start_month !== data.startMonth) throw new FinanceError("The start month cannot be changed");
    if (previous && !data.reason) throw new FinanceError("A correction reason is required");
    db.prepare("INSERT INTO finance_setup_versions VALUES(?,?,?,?,?,?,?,?,?)").run(
      data.expectedRevision + 1, data.startMonth, balances.Cash, balances.WeChat, balances.Alipay,
      previous ? data.reason : null, actor.id, actor.name, new Date().toISOString(),
    );
  }).immediate();
}

export function saveFinanceEntry(db: Database.Database, input: FinanceEntryInput, actor: FinanceActor): void {
  const data = financeEntrySchema.parse(input);
  checkDate(data.date);
  const amount = parseFinanceAmount(data.amount, false);
  if ((data.kind === "transfer" && (!data.toChannel || data.toChannel === data.channel)) ||
      (data.kind !== "transfer" && data.toChannel)) throw new FinanceError("Choose a different destination for transfers");
  db.transaction(() => {
    const setup = db.prepare<[], { start_month: string }>("SELECT start_month FROM finance_setup_versions ORDER BY revision DESC LIMIT 1").get();
    if (!setup) throw new FinanceError("Set opening balances first");
    if (data.date < `${setup.start_month}-01` || data.date > new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)) throw new FinanceError("Entry date must be between the start month and today");
    const previous = db.prepare<[string], { revision: number }>("SELECT revision FROM finance_entry_versions WHERE entry_id=? ORDER BY revision DESC LIMIT 1").get(data.id);
    checkRevision(previous?.revision ?? 0, data.expectedRevision);
    if ((previous || data.voided) && !data.reason) throw new FinanceError("A correction reason is required");
    if (!previous && data.voided) throw new FinanceError("Cannot void a new entry");
    db.prepare("INSERT INTO finance_entry_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      data.id, data.expectedRevision + 1, data.kind, data.date, data.channel, data.toChannel ?? null,
      amount, data.description, data.recipient || null, data.reference || null, data.voided ? 1 : 0,
      data.reason || null, actor.id, actor.name, new Date().toISOString(),
    );
  }).immediate();
}

export function saveFinanceObservation(db: Database.Database, input: FinanceObservationInput, actor: FinanceActor): void {
  const data = financeObservationSchema.parse(input);
  getFinanceMonthBounds(data.month);
  const balances = parsedBalances(data.balances);
  db.transaction(() => {
    const setup = db.prepare<[], { start_month: string }>("SELECT start_month FROM finance_setup_versions ORDER BY revision DESC LIMIT 1").get();
    if (!setup || data.month < setup.start_month) throw new FinanceError("Choose a month at or after setup");
    const previous = db.prepare<[string], { revision: number }>("SELECT revision FROM finance_balance_versions WHERE month=? ORDER BY revision DESC LIMIT 1").get(data.month);
    checkRevision(previous?.revision ?? 0, data.expectedRevision);
    db.prepare("INSERT INTO finance_balance_versions VALUES(?,?,?,?,?,?,?,?,?)").run(
      data.month, data.expectedRevision + 1, balances.Cash, balances.WeChat, balances.Alipay,
      data.explanation || null, actor.id, actor.name, new Date().toISOString(),
    );
  }).immediate();
}

export type FinanceBookAmounts = FinanceAmounts & { Unassigned: number };
export type FinanceSetup = { revision: number; startMonth: string; balancesCents: FinanceAmounts; reason: string | null; actor: FinanceActor; recordedAt: string };
export type FinanceEntry = { id: string; revision: number; kind: FinanceEntryInput["kind"]; date: string; channel: FinanceChannel; toChannel: FinanceChannel | null; amountCents: number; description: string; recipient: string | null; reference: string | null; voided: boolean; reason: string | null; actor: FinanceActor; recordedAt: string };
export type FinanceObservation = { month: string; revision: number; balancesCents: FinanceAmounts; explanation: string | null; actor: FinanceActor; recordedAt: string };
export type FinanceReceipt = { source: "transaction" | "wechat_request" | "manual_income"; sourceId: string; postedAt: string; channel: FinanceChannel | "Unassigned"; originalMethod: string | null; amountCents: number; creditedCents: number | null; description: string | null; recipient: string | null; reference: string | null };
export type FinanceTransactionSource = { id: number; customerId?: number; type: "TOPUP" | "DEBIT" | "ADJUST"; amountCents: number; method: string | null; staff: string | null; description: string | null; createdAt: string };
export type FinanceWechatSource = { id: number; customerId?: number; transactionId: number | null; requestedCents: number; payableCents: number; reviewedAt: string; status: "approved" };
export type FinanceSummary = {
  openingCents: FinanceBookAmounts; receiptsCents: FinanceBookAmounts; incomeCents: FinanceBookAmounts;
  expensesCents: FinanceBookAmounts; transfersInCents: FinanceBookAmounts; transfersOutCents: FinanceBookAmounts;
  expectedClosingCents: FinanceBookAmounts; actualClosingCents: FinanceAmounts | null; varianceCents: FinanceAmounts | null;
  totalExpectedCents: number; totalActualCents: number | null; totalVarianceCents: number | null;
  salesCents: number; salesLessExpensesCents: number; walletAdjustmentsCents: number;
};
export type FinanceDraft = {
  month: string; timeZone: "Asia/Shanghai"; startUtc: string; endUtc: string; preparedAt: string; sourceHash: string;
  summary: FinanceSummary; creditObservation: { observedAt: string; creditOwedCents: number; debtCents: number };
  entries: FinanceEntry[]; receipts: FinanceReceipt[]; warnings: string[]; observation: FinanceObservation | null;
  canClose: boolean; blockers: string[];
};
export type FinanceSnapshot = {
  schemaVersion: 1; month: string; revision: number; savedAt: string; savedBy: FinanceActor; reason: string | null; draft: FinanceDraft;
  evidence: { setup: FinanceSetup; entries: FinanceEntry[]; transactions: FinanceTransactionSource[]; wechatRequests: FinanceWechatSource[]; observation: FinanceObservation };
};
export type FinanceReportView = { snapshot: FinanceSnapshot; stale: boolean; staleReason: string | null };
export type FinanceReportIndex = { id: number; month: string; revision: number; savedAt: string; savedBy: FinanceActor; reason: string | null; stale: boolean; staleReason: string | null };
export type FinancePageData = {
  setup: FinanceSetup | null; month: string; draft: FinanceDraft | null; error: string | null;
  entries: FinanceEntry[]; entryHistory: FinanceEntry[]; observation: FinanceObservation | null;
  reports: FinanceReportIndex[]; revisions: Array<FinanceReportView & { id: number }>;
};

type SetupRow = { revision: number; start_month: string; cash: number; wechat: number; alipay: number; reason: string | null; recorded_by_id: string; recorded_by_name: string; recorded_at: string };
type EntryRow = { entry_id: string; revision: number; kind: FinanceEntryInput["kind"]; effective_date: string; channel: FinanceChannel; to_channel: FinanceChannel | null; amount: number; description: string; recipient: string | null; reference: string | null; voided: number; reason: string | null; recorded_by_id: string; recorded_by_name: string; recorded_at: string };
type BalanceRow = { month: string; revision: number; cash: number; wechat: number; alipay: number; explanation: string | null; recorded_by_id: string; recorded_by_name: string; recorded_at: string };
type TransactionRow = { id: number; customer_id: number; type: FinanceTransactionSource["type"]; amount: number; payment_method: string | null; staff: string | null; description: string | null; created_at: string };
type RequestRow = { id: number; customer_id: number; approved_transaction_id: number | null; requested_amount: number; payable_amount: number; reviewed_at: string | null };

function setupFromRow(row: SetupRow): FinanceSetup {
  return { revision: row.revision, startMonth: row.start_month, balancesCents: { Cash: row.cash, WeChat: row.wechat, Alipay: row.alipay }, reason: row.reason, actor: { id: row.recorded_by_id, name: row.recorded_by_name }, recordedAt: row.recorded_at };
}
function entryFromRow(row: EntryRow): FinanceEntry {
  return { id: row.entry_id, revision: row.revision, kind: row.kind, date: row.effective_date, channel: row.channel, toChannel: row.to_channel, amountCents: row.amount, description: row.description, recipient: row.recipient, reference: row.reference, voided: !!row.voided, reason: row.reason, actor: { id: row.recorded_by_id, name: row.recorded_by_name }, recordedAt: row.recorded_at };
}
function observationFromRow(row: BalanceRow): FinanceObservation {
  return { month: row.month, revision: row.revision, balancesCents: { Cash: row.cash, WeChat: row.wechat, Alipay: row.alipay }, explanation: row.explanation, actor: { id: row.recorded_by_id, name: row.recorded_by_name }, recordedAt: row.recorded_at };
}
function sourceTimestamp(value: string | null, source: string): string {
  if (!value || !/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,3})?Z?$/.test(value)) throw new FinanceError(`Invalid timestamp for ${source}`);
  const normalized = value.replace(" ", "T").replace(/Z?$/, "Z");
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== normalized.slice(0, 19)) throw new FinanceError(`Invalid timestamp for ${source}`);
  return parsed.toISOString();
}
function checked(value: number, source: string): number {
  if (!Number.isSafeInteger(value)) throw new FinanceError(`Unsafe amount in ${source}`);
  return value;
}
function add(target: FinanceBookAmounts, channel: keyof FinanceBookAmounts, amount: number): void {
  target[channel] = checked(target[channel] + amount, channel);
}
const channels = ["WeChat", "Alipay", "Cash", "Unassigned"] as const;
function zeroBook(): FinanceBookAmounts { return { WeChat: 0, Alipay: 0, Cash: 0, Unassigned: 0 }; }
function bookTotal(book: FinanceBookAmounts): number {
  return channels.reduce((sum, channel) => checked(sum + book[channel], "total"), 0);
}

function calculateFinance(db: Database.Database, month: string, now: Date): { draft: FinanceDraft; evidence: Omit<FinanceSnapshot["evidence"], "observation"> & { observation: FinanceObservation | null } } | null {
  const bounds = getFinanceMonthBounds(month);
  const setupRow = db.prepare<[], SetupRow>("SELECT * FROM finance_setup_versions ORDER BY revision DESC LIMIT 1").get();
  if (!setupRow) return null;
  const setup = setupFromRow(setupRow);
  if (month < setup.startMonth) throw new FinanceError("The selected month is before the finance start month");
  const cutover = getFinanceMonthBounds(setup.startMonth).startUtc;
  const observationRow = db.prepare<[string], BalanceRow>("SELECT * FROM finance_balance_versions WHERE month=? ORDER BY revision DESC LIMIT 1").get(month);
  const observation = observationRow ? observationFromRow(observationRow) : null;
  const entryRows = db.prepare<[], EntryRow>(`SELECT e.* FROM finance_entry_versions e
    WHERE e.revision=(SELECT MAX(x.revision) FROM finance_entry_versions x WHERE x.entry_id=e.entry_id)
    ORDER BY e.entry_id`).all();
  const entries = entryRows.map(entryFromRow).filter(entry => entry.date >= `${setup.startMonth}-01` && entry.date < month + "-32");
  const entryHistory = db.prepare<[string, string], EntryRow>(`SELECT * FROM finance_entry_versions WHERE entry_id IN
    (SELECT entry_id FROM finance_entry_versions WHERE effective_date>=? AND effective_date<?)
    ORDER BY entry_id,revision`).all(`${setup.startMonth}-01`, `${month}-32`).map(entryFromRow);
  const transactionRows = db.prepare<[], TransactionRow>("SELECT id,customer_id,type,amount,payment_method,staff,description,created_at FROM transactions ORDER BY id").all();
  const requestRows = db.prepare<[], RequestRow>("SELECT id,customer_id,approved_transaction_id,requested_amount,payable_amount,reviewed_at FROM wechat_topup_requests WHERE status='approved' ORDER BY id").all();
  const links = new Map<number, number>();
  for (const request of requestRows) {
    if (request.approved_transaction_id !== null) {
      if (links.has(request.approved_transaction_id)) throw new FinanceError(`Approved requests ${links.get(request.approved_transaction_id)} and ${request.id} share transaction ${request.approved_transaction_id}`);
      links.set(request.approved_transaction_id, request.id);
    }
  }
  const relevantLinkedIds = new Set(requestRows.filter(row => {
    const at = sourceTimestamp(row.reviewed_at, `approved request ${row.id}`);
    return at >= cutover && at < bounds.endUtc && row.approved_transaction_id !== null;
  }).map(row => row.approved_transaction_id!));
  const transactions: FinanceTransactionSource[] = [];
  const wechatRequests: FinanceWechatSource[] = [];
  const opening = { ...setup.balancesCents, Unassigned: 0 };
  const receipts = zeroBook(), income = zeroBook(), expenses = zeroBook(), transfersIn = zeroBook(), transfersOut = zeroBook();
  const details: FinanceReceipt[] = [], warnings: string[] = [];
  let sales = 0, adjustments = 0;
  const applyReceipt = (receipt: FinanceReceipt) => {
    if (receipt.postedAt < cutover || receipt.postedAt >= bounds.endUtc) return;
    if (receipt.channel === "Unassigned") warnings.push(`Unassigned receipt ${receipt.source} ${receipt.sourceId}: ${receipt.originalMethod ?? "no payment method"}`);
    if (receipt.postedAt < bounds.startUtc) add(opening, receipt.channel, receipt.amountCents);
    else {
      add(receipts, receipt.channel, receipt.amountCents);
      details.push(receipt);
    }
  };
  const byId = new Map(transactionRows.map(row => [row.id, row]));
  for (const row of transactionRows) {
    const at = sourceTimestamp(row.created_at, `transaction ${row.id}`);
    checked(row.amount, `transaction ${row.id}`);
    if ((row.type === "TOPUP" && row.amount <= 0) || (row.type === "DEBIT" && row.amount >= 0)) throw new FinanceError(`Invalid sign for transaction ${row.id}`);
    if ((at >= cutover && at < bounds.endUtc) || relevantLinkedIds.has(row.id)) {
      transactions.push({ id: row.id, customerId: row.customer_id, type: row.type, amountCents: row.amount, method: row.payment_method, staff: row.staff, description: row.description, createdAt: at });
    }
    if (at < cutover || at >= bounds.endUtc) continue;
    if (row.staff === "CLI-Admin") {
      if (at >= bounds.startUtc) {
        adjustments = checked(adjustments + row.amount, "wallet adjustments");
        warnings.push(`CLI-Admin transaction ${row.id} needs review`);
      }
    } else if (row.type === "ADJUST") {
      if (at >= bounds.startUtc) adjustments = checked(adjustments + row.amount, "wallet adjustments");
    } else if (row.type === "DEBIT") {
      if (at >= bounds.startUtc) sales = checked(sales - row.amount, "sales");
    } else if (!links.has(row.id)) {
      const channel = row.payment_method === "WeChat" || row.payment_method === "Alipay" || row.payment_method === "Cash" ? row.payment_method : "Unassigned";
      applyReceipt({ source: "transaction", sourceId: String(row.id), postedAt: at, channel, originalMethod: row.payment_method, amountCents: row.amount, creditedCents: row.amount, description: row.description, recipient: null, reference: null });
    }
  }
  for (const row of requestRows) {
    const at = sourceTimestamp(row.reviewed_at, `approved request ${row.id}`);
    if (checked(row.requested_amount, `request ${row.id}`) <= 0 || checked(row.payable_amount, `request ${row.id}`) <= 0 || row.payable_amount < row.requested_amount) throw new FinanceError(`Invalid amount for approved request ${row.id}`);
    if (row.approved_transaction_id !== null) {
      const linked = byId.get(row.approved_transaction_id);
      if (linked && (linked.customer_id !== row.customer_id || linked.type !== "TOPUP" || linked.amount !== row.requested_amount || linked.staff === "CLI-Admin")) throw new FinanceError(`Conflicting transaction ${linked.id} for approved request ${row.id}`);
    }
    const linked = row.approved_transaction_id === null ? undefined : byId.get(row.approved_transaction_id);
    const linkedAt = linked ? sourceTimestamp(linked.created_at, `transaction ${linked.id}`) : null;
    if ((at >= cutover && at < bounds.endUtc) || (linkedAt !== null && linkedAt >= cutover && linkedAt < bounds.endUtc)) {
      wechatRequests.push({ id: row.id, customerId: row.customer_id, transactionId: row.approved_transaction_id, requestedCents: row.requested_amount, payableCents: row.payable_amount, reviewedAt: at, status: "approved" });
    }
    if (at < cutover || at >= bounds.endUtc) continue;
    if (row.approved_transaction_id === null || !byId.has(row.approved_transaction_id)) warnings.push(`Approved request ${row.id} has no linked transaction`);
    applyReceipt({ source: "wechat_request", sourceId: String(row.id), postedAt: at, channel: "WeChat", originalMethod: "WeChat", amountCents: row.payable_amount, creditedCents: row.requested_amount, description: null, recipient: null, reference: null });
  }
  for (const entry of entries) {
    checkDate(entry.date);
    checked(entry.amountCents, `entry ${entry.id}`);
    if (entry.voided) continue;
    const prior = entry.date < `${month}-01`;
    if (entry.kind === "transfer") {
      if (prior) {
        add(opening, entry.channel, -entry.amountCents);
        add(opening, entry.toChannel!, entry.amountCents);
      } else {
        add(transfersOut, entry.channel, entry.amountCents);
        add(transfersIn, entry.toChannel!, entry.amountCents);
      }
    } else if (prior) add(opening, entry.channel, entry.kind === "income" ? entry.amountCents : -entry.amountCents);
    else if (entry.kind === "expense") add(expenses, entry.channel, entry.amountCents);
    else {
      add(income, entry.channel, entry.amountCents);
      details.push({ source: "manual_income", sourceId: entry.id, postedAt: new Date(Date.parse(`${entry.date}T00:00:00Z`) - 8 * 3600_000).toISOString(), channel: entry.channel, originalMethod: entry.channel, amountCents: entry.amountCents, creditedCents: null, description: entry.description, recipient: entry.recipient, reference: entry.reference });
    }
  }
  for (const values of [opening, receipts, income, expenses, transfersIn, transfersOut]) bookTotal(values);
  const closing = zeroBook();
  for (const channel of channels) {
    closing[channel] = checked(opening[channel], channel);
    for (const amount of [receipts[channel], income[channel], -expenses[channel], transfersIn[channel], -transfersOut[channel]]) {
      add(closing, channel, amount);
    }
  }
  const totalExpected = bookTotal(closing);
  const actual = observation?.balancesCents ?? null;
  const variance = actual ? { WeChat: checked(actual.WeChat - closing.WeChat, "WeChat variance"), Alipay: checked(actual.Alipay - closing.Alipay, "Alipay variance"), Cash: checked(actual.Cash - closing.Cash, "Cash variance") } : null;
  const totalActual = actual ? checked(checked(actual.WeChat + actual.Alipay, "actual") + actual.Cash, "actual") : null;
  const totalVariance = totalActual === null ? null : checked(totalActual - totalExpected, "total variance");
  const preparedAt = now.toISOString();
  let credit = 0, debt = 0;
  for (const row of db.prepare<[], { balance: number }>("SELECT balance FROM accounts ORDER BY customer_id").all()) {
    checked(row.balance, "customer balance");
    if (row.balance > 0) credit = checked(credit + row.balance, "customer credit");
    else debt = checked(debt - row.balance, "customer debt");
  }
  const sourceHash = createHash("sha256").update(JSON.stringify({ setup, entries, transactions, wechatRequests, observation })).digest("hex");
  const evidence = { setup, entries: entryHistory, transactions, wechatRequests, observation };
  const blockers: string[] = [];
  if (bounds.endUtc > preparedAt) blockers.push("The selected month has not ended");
  if (!observation) blockers.push("Enter all month-end actual balances");
  if (observation && !observation.explanation && (warnings.length > 0 || closing.Unassigned !== 0 || totalVariance !== 0 || Object.values(variance!).some(value => value !== 0))) blockers.push("An explanation is required for differences or warnings");
  const draft: FinanceDraft = {
    month, timeZone: "Asia/Shanghai", ...bounds, preparedAt, sourceHash,
    summary: { openingCents: opening, receiptsCents: receipts, incomeCents: income, expensesCents: expenses, transfersInCents: transfersIn, transfersOutCents: transfersOut, expectedClosingCents: closing, actualClosingCents: actual, varianceCents: variance, totalExpectedCents: totalExpected, totalActualCents: totalActual, totalVarianceCents: totalVariance, salesCents: sales, salesLessExpensesCents: checked(sales - bookTotal(expenses), "sales less expenses"), walletAdjustmentsCents: adjustments },
    creditObservation: { observedAt: preparedAt, creditOwedCents: credit, debtCents: debt },
    entries: entries.filter(entry => !entry.voided && entry.date.startsWith(month + "-")),
    receipts: details.sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.sourceId.localeCompare(b.sourceId)),
    warnings, observation, canClose: blockers.length === 0, blockers,
  };
  return { draft, evidence };
}

export function getFinanceDraft(db: Database.Database, month: string, now = new Date()): FinanceDraft | null {
  return calculateFinance(db, month, now)?.draft ?? null;
}

export function closeFinanceMonth(db: Database.Database, input: FinanceCloseInput, actor: FinanceActor, now = new Date()): number {
  const data = financeCloseSchema.parse(input);
  getFinanceMonthBounds(data.month);
  return db.transaction(() => {
    const previous = db.prepare<[string], { revision: number }>("SELECT revision FROM finance_reports WHERE month=? ORDER BY revision DESC LIMIT 1").get(data.month);
    checkRevision(previous?.revision ?? 0, data.expectedRevision);
    if (previous && !data.reason) throw new FinanceError("A revision reason is required");
    const calculated = calculateFinance(db, data.month, now);
    if (!calculated) throw new FinanceError("Set opening balances first");
    if (calculated.draft.sourceHash !== data.expectedHash) throw new FinanceError("Source records changed; reload and try again", 409);
    if (!calculated.draft.canClose || !calculated.evidence.observation) throw new FinanceError(calculated.draft.blockers.join("; "));
    const snapshot: FinanceSnapshot = {
      schemaVersion: 1, month: data.month, revision: data.expectedRevision + 1,
      savedAt: now.toISOString(), savedBy: actor, reason: data.reason || null,
      draft: calculated.draft, evidence: { ...calculated.evidence, observation: calculated.evidence.observation },
    };
    const result = db.prepare("INSERT INTO finance_reports(month,revision,source_hash,snapshot_json,reason,recorded_by_id,recorded_by_name,recorded_at) VALUES(?,?,?,?,?,?,?,?)").run(
      data.month, snapshot.revision, snapshot.draft.sourceHash, JSON.stringify(snapshot), snapshot.reason, actor.id, actor.name, snapshot.savedAt,
    );
    return Number(result.lastInsertRowid);
  }).immediate();
}

export function getFinanceReport(db: Database.Database, id: number): FinanceReportView | undefined {
  const row = db.prepare<[number], { snapshot_json: string; source_hash: string; month: string }>("SELECT snapshot_json,source_hash,month FROM finance_reports WHERE id=?").get(id);
  if (!row) return undefined;
  const snapshot = JSON.parse(row.snapshot_json) as FinanceSnapshot;
  try {
    const current = calculateFinance(db, row.month, new Date());
    const stale = !current || current.draft.sourceHash !== row.source_hash;
    return { snapshot, stale, staleReason: stale ? "Source records changed; generate a new revision" : null };
  } catch (error) {
    if (error instanceof FinanceError) return { snapshot, stale: true, staleReason: error.message };
    throw error;
  }
}

export function getFinancePageData(db: Database.Database, month: string, now = new Date()): FinancePageData {
  getFinanceMonthBounds(month);
  const setupRow = db.prepare<[], SetupRow>("SELECT * FROM finance_setup_versions ORDER BY revision DESC LIMIT 1").get();
  const observationRow = db.prepare<[string], BalanceRow>("SELECT * FROM finance_balance_versions WHERE month=? ORDER BY revision DESC LIMIT 1").get(month);
  const historyRows = db.prepare<[string], EntryRow>(`SELECT * FROM finance_entry_versions WHERE entry_id IN
    (SELECT entry_id FROM finance_entry_versions WHERE substr(effective_date,1,7)=?)
    ORDER BY entry_id,revision`).all(month);
  const entryHistory = historyRows.map(entryFromRow);
  const latest = new Map<string, FinanceEntry>();
  for (const entry of entryHistory) latest.set(entry.id, entry);
  const rows = db.prepare<[], { id: number; month: string; revision: number; recorded_at: string; recorded_by_id: string; recorded_by_name: string; reason: string | null }>("SELECT id,month,revision,recorded_at,recorded_by_id,recorded_by_name,reason FROM finance_reports ORDER BY month DESC,revision DESC").all();
  const revisions: FinancePageData["revisions"] = [];
  const reports: FinanceReportIndex[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const view = getFinanceReport(db, row.id)!;
    if (row.month === month) revisions.push({ ...view, id: row.id });
    if (!seen.has(row.month)) {
      seen.add(row.month);
      reports.push({ id: row.id, month: row.month, revision: row.revision, savedAt: row.recorded_at, savedBy: { id: row.recorded_by_id, name: row.recorded_by_name }, reason: row.reason, stale: view.stale, staleReason: view.staleReason });
    }
  }
  let draft: FinanceDraft | null = null;
  let error: string | null = null;
  try {
    draft = getFinanceDraft(db, month, now);
  } catch (cause) {
    if (!(cause instanceof FinanceError)) throw cause;
    error = cause.message;
  }
  return { setup: setupRow ? setupFromRow(setupRow) : null, month, draft, error, entries: [...latest.values()], entryHistory, observation: observationRow ? observationFromRow(observationRow) : null, reports, revisions };
}
