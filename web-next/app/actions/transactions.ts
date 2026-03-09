"use server";

import { revalidatePath } from "next/cache";
import {
  getAllTransactions,
  getTransactionsByStudentId,
  getTransactionById,
  createTransaction,
  deleteTransaction,
  getRecentTransactions,
  getTransactionsPage,
  getTransactionsBatch,
} from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import { createTransactionSchema } from "@/lib/models";
import { getDb } from "@/lib/db";
import { requireAuthContext } from "@/lib/auth-session";

export async function getTransactionsAction(limit?: number) {
  try {
    await requireAuthContext();
    return { success: true, data: getAllTransactions(limit) };
  } catch {
    return { success: false, error: "Failed to fetch transactions" };
  }
}

export async function getTransactionsByStudentIdAction(studentId: number) {
  try {
    await requireAuthContext();
    return { success: true, data: getTransactionsByStudentId(studentId) };
  } catch {
    return { success: false, error: "Failed to fetch transactions" };
  }
}

export async function getTransactionByIdAction(id: number) {
  try {
    await requireAuthContext();
    const transaction = getTransactionById(id);
    if (!transaction) {
      return { success: false, error: "Transaction not found" };
    }
    return { success: true, data: transaction };
  } catch {
    return { success: false, error: "Failed to fetch transaction" };
  }
}

export async function createTransactionAction(data: unknown) {
  try {
    await requireAuthContext();
    const validated = createTransactionSchema.parse(data);
    const db = getDb();

    const result = db.transaction(() => {
      const transaction = createTransaction(validated);
      // Update account balance
      adjustBalance(validated.student_id, validated.amount);
      return transaction;
    })();

    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${validated.student_id}`);
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch {
    return { success: false, error: "Failed to create transaction" };
  }
}

export async function deleteTransactionAction(id: number) {
  try {
    await requireAuthContext();
    // Note: Deleting transactions should also adjust the balance back
    const transaction = getTransactionById(id);
    if (!transaction) {
      return { success: false, error: "Transaction not found" };
    }

    const db = getDb();
    db.transaction(() => {
      deleteTransaction(id);
      // Reverse the transaction amount
      adjustBalance(transaction.student_id, -transaction.amount);
    })();

    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${transaction.student_id}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete transaction" };
  }
}

export async function getRecentTransactionsAction(limit: number = 10) {
  try {
    await requireAuthContext();
    return { success: true, data: getRecentTransactions(limit) };
  } catch {
    return { success: false, error: "Failed to fetch recent transactions" };
  }
}

export async function getTransactionsPageAction(page: number, pageSize: number) {
  try {
    await requireAuthContext();
    return { success: true, data: getTransactionsPage({ page, pageSize }) };
  } catch {
    return { success: false, error: "Failed to fetch transactions" };
  }
}

export async function getTransactionsBatchAction(offset: number, limit: number) {
  try {
    await requireAuthContext();
    return { success: true, data: getTransactionsBatch({ offset, limit }) };
  } catch {
    return { success: false, error: "Failed to fetch transactions" };
  }
}
