"use server";

import { revalidatePath } from "next/cache";
import {
  getAccountByCustomerId,
  updateAccount,
  adjustBalance,
} from "@/lib/repositories/accounts";
import { updateAccountSchema } from "@/lib/models";
import { requireStaffContext } from "@/lib/auth-session";

export async function getAccountByCustomerIdAction(customerId: number) {
  try {
    await requireStaffContext();
    const account = getAccountByCustomerId(customerId);
    if (!account) {
      return { success: false, error: "Account not found" };
    }
    return { success: true, data: account };
  } catch {
    return { success: false, error: "Failed to fetch account" };
  }
}

export async function updateAccountAction(customerId: number, data: unknown) {
  try {
    await requireStaffContext();
    const validated = updateAccountSchema.parse(data);
    updateAccount(customerId, validated);
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update account" };
  }
}

export async function adjustBalanceAction(customerId: number, delta: number) {
  try {
    await requireStaffContext();
    adjustBalance(customerId, delta);
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to adjust balance" };
  }
}
