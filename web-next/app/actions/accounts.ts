"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getAccountByStudentId,
  updateAccount,
  adjustBalance,
} from "@/lib/repositories/accounts";
import { updateAccountSchema } from "@/lib/models";
import { toDbValue } from "@/lib/currency";

export async function getAccountByStudentIdAction(studentId: number) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }
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
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }
    const validated = updateAccountSchema.parse(data);
    updateAccount(studentId, validated);
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update account" };
  }
}

export async function adjustBalanceAction(studentId: number, delta: number) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      return { success: false, error: "Unauthorized" };
    }
    adjustBalance(studentId, delta);
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to adjust balance" };
  }
}

