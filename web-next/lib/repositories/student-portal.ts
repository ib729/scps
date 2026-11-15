import type { StudentPortalData } from "../models";
import { getStudentById } from "./students";
import { getAccountByStudentId } from "./accounts";
import { getTransactionsByStudentId } from "./transactions";
import { listWechatTopupRequests, toStudentPaymentRequest } from "./wechat-topup-requests";

export function getStudentPortalData(studentId: number): StudentPortalData {
  const student = getStudentById(studentId);
  const account = getAccountByStudentId(studentId);
  if (!student || !account) throw new Error("Student account is unavailable");
  return {
    student: { id: student.id, name: student.name, balance: account.balance },
    transactions: getTransactionsByStudentId(studentId).map(({ id, type, amount, payment_method, created_at }) => ({ id, type, amount, payment_method, created_at })),
    pendingRequests: listWechatTopupRequests({ studentId, pendingOnly: true }).map(toStudentPaymentRequest),
    recentRequests: listWechatTopupRequests({ studentId }).map(toStudentPaymentRequest),
  };
}
