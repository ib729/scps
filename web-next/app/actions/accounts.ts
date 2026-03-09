"use server";

import { revalidatePath } from "next/cache";
import {
  getAccountByStudentId,
  updateAccount,
  adjustBalance,
} from "@/lib/repositories/accounts";
import { updateAccountSchema } from "@/lib/models";
import { requireAuthContext } from "@/lib/auth-session";

export async function getAccountByStudentIdAction(studentId: number) {
  try {
    await requireAuthContext();
    const account = getAccountByStudentId(studentId);
    if (!account) {
      return { success: false, error: "Account not found" };
    }
    return { success: true, data: account };
  } catch {
    return { success: false, error: "Failed to fetch account" };
  }
}

export async function updateAccountAction(studentId: number, data: unknown) {
  try {
    await requireAuthContext();
    const validated = updateAccountSchema.parse(data);
    updateAccount(studentId, validated);
    revalidatePath("/customers");
    revalidatePath(`/customers/${studentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update account" };
  }
}

export async function adjustBalanceAction(studentId: number, delta: number) {
  try {
    await requireAuthContext();
    adjustBalance(studentId, delta);
    revalidatePath("/customers");
    revalidatePath(`/customers/${studentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to adjust balance" };
  }
}
