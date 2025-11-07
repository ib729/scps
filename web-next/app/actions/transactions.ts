"use server";

import { revalidatePath } from "next/cache";
import {
  getAllTransactions,
  getTransactionsByStudentId,
  getTransactionById,
  createTransaction,
  deleteTransaction,
  getRecentTransactions,
} from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import { createTransactionSchema } from "@/lib/models";
import { getDb } from "@/lib/db";

export async function getTransactionsAction(limit?: number) {
  try {
    return { success: true, data: getAllTransactions(limit) };
  } catch {
    return { success: false, error: "Failed to fetch transactions" };
  }
}

export async function getTransactionsByStudentIdAction(studentId: number) {
  try {
    return { success: true, data: getTransactionsByStudentId(studentId) };
  } catch {
    return { success: false, error: "Failed to fetch transactions" };
  }
}

export async function getTransactionByIdAction(id: number) {
  try {
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
    const validated = createTransactionSchema.parse(data);
    const db = getDb();

    const result = db.transaction(() => {
      const transaction = createTransaction(validated);
      // Update account balance
      adjustBalance(validated.student_id, validated.amount);
      return transaction;
    })();

    revalidatePath("/transactions");
    revalidatePath("/students");
    revalidatePath(`/students/${validated.student_id}`);
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch {
    return { success: false, error: "Failed to create transaction" };
  }
}

export async function deleteTransactionAction(id: number) {
  try {
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
    revalidatePath("/students");
    revalidatePath(`/students/${transaction.student_id}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete transaction" };
  }
}

export async function getRecentTransactionsAction(limit: number = 10) {
  try {
    return { success: true, data: getRecentTransactions(limit) };
  } catch {
    return { success: false, error: "Failed to fetch recent transactions" };
  }
}

