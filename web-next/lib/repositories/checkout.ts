import { getDb } from "../db";
import type { Transaction } from "../models";
import { formatCurrency } from "../currency";
import { getCustomerById } from "./customers";
import { getCardByUid } from "./cards";
import { createTransaction } from "./transactions";
import { adjustBalance, getAccountByCustomerId } from "./accounts";
import { getCurrentWeekStartUtc, getOverdraftWeek, upsertOverdraftWeek } from "./overdraft";

export function checkoutCustomer(data: { customer_id?: number; card_uid?: string; amount: number; description?: string; staff: string }): { transaction: Transaction; newBalance: number; overdraftUsed: number } {
  if (!Number.isSafeInteger(data.amount) || data.amount <= 0) throw new Error("Amount must be positive safe integer cents");
  return getDb().transaction(() => {
    let customerId: number;
    if (data.customer_id) customerId = data.customer_id;
    else if (data.card_uid) {
      const card = getCardByUid(data.card_uid);
      if (!card) throw new Error("Card not found");
      if (card.status !== "active") throw new Error("Card is not active");
      customerId = card.customer_id;
    } else throw new Error("Either customer_id or card_uid must be provided");
    const customer = getCustomerById(customerId);
    if (!customer) throw new Error("Customer not found");
    const account = getAccountByCustomerId(customerId);
    if (!account) throw new Error("Account not found");
    const currentBalance = account.balance;
    const newBalance = currentBalance - data.amount;
    if (!Number.isSafeInteger(currentBalance) || !Number.isSafeInteger(newBalance)) throw new Error("Balance exceeds the safe currency range");
    const overdraftUsed = Math.max(0, -newBalance) - Math.max(0, -currentBalance);
    if (overdraftUsed > 0) {
      const weekStart = getCurrentWeekStartUtc();
      const currentUsed = getOverdraftWeek(customerId, weekStart)?.used ?? 0;
      const totalUsed = currentUsed + overdraftUsed;
      if (!Number.isSafeInteger(currentUsed) || !Number.isSafeInteger(totalUsed) || !Number.isSafeInteger(account.max_overdraft_week)) throw new Error("Weekly overdraft exceeds the safe currency range");
      if (totalUsed > account.max_overdraft_week) throw new Error(`Insufficient funds. Overdraft limit (¥${formatCurrency(account.max_overdraft_week)}/week) would be exceeded.`);
      upsertOverdraftWeek(customerId, weekStart, totalUsed);
    }
    const transaction = createTransaction({customer_id:customerId,card_uid:data.card_uid,type:"DEBIT",amount:-data.amount,overdraft_component:overdraftUsed,description:data.description || undefined,staff:data.staff});
    adjustBalance(customerId,-data.amount);
    return {transaction,newBalance,overdraftUsed};
  }).immediate();
}
