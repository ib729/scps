import type { CustomerPortalData } from "../models";
import { getCustomerById } from "./customers";
import { getAccountByCustomerId } from "./accounts";
import { getTransactionsByCustomerId } from "./transactions";
import { listWechatTopupRequests, toCustomerPaymentRequest } from "./wechat-topup-requests";

export function getCustomerPortalData(customerId: number): CustomerPortalData {
  const customer = getCustomerById(customerId);
  const account = getAccountByCustomerId(customerId);
  if (!customer || !account) throw new Error("Customer account is unavailable");
  return {
    customer: { id: customer.id, name: customer.name, balance: account.balance },
    transactions: getTransactionsByCustomerId(customerId).map(({ id, type, amount, payment_method, created_at }) => ({ id, type, amount, payment_method, created_at })),
    pendingRequests: listWechatTopupRequests({ customerId, pendingOnly: true }).map(toCustomerPaymentRequest),
    recentRequests: listWechatTopupRequests({ customerId }).map(toCustomerPaymentRequest),
  };
}
