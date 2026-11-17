"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, requireStaffContext } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import {
  FinanceError, financeSetupSchema, financeEntrySchema, financeObservationSchema, financeCloseSchema,
  saveFinanceSetup, saveFinanceEntry, saveFinanceObservation, closeFinanceMonth, calculateFinanceProfit, getFinanceProvisional,
} from "@/lib/finance";

function failure(error: unknown) {
  if (error instanceof FinanceError || error instanceof AuthError) return { success: false as const, error: error.message, status: error.status };
  if (error instanceof z.ZodError) return { success: false as const, error: error.issues[0]?.message ?? "Invalid finance input", status: 400 };
  console.error("Finance action failed", error);
  return { success: false as const, error: "Unable to save finance changes", status: 500 };
}

export async function saveFinanceSetupAction(data: unknown) {
  try {
    const { user } = await requireStaffContext();
    saveFinanceSetup(getDb(), financeSetupSchema.parse(data), { id: user.id, name: user.name });
    revalidatePath("/admin/finance");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function saveFinanceEntryAction(data: unknown) {
  try {
    const { user } = await requireStaffContext();
    saveFinanceEntry(getDb(), financeEntrySchema.parse(data), { id: user.id, name: user.name });
    revalidatePath("/admin/finance");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function saveFinanceObservationAction(data: unknown) {
  try {
    const { user } = await requireStaffContext();
    saveFinanceObservation(getDb(), financeObservationSchema.parse(data), { id: user.id, name: user.name });
    revalidatePath("/admin/finance");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function closeFinanceMonthAction(data: unknown) {
  try {
    const { user } = await requireStaffContext();
    const id = closeFinanceMonth(getDb(), financeCloseSchema.parse(data), { id: user.id, name: user.name });
    revalidatePath("/admin/finance");
    return { success: true as const, data: { id } };
  } catch (error) { return failure(error); }
}

export async function calculateFinanceProfitAction(data: unknown) {
  try {
    const { user } = await requireStaffContext();
    const input = z.object({ month: z.string(), goodsCost: z.string(), otherExpenses: z.string() }).strict().parse(data);
    const report = getFinanceProvisional(getDb(), input.month, { id: user.id, name: user.name });
    if (!report) throw new FinanceError("Set opening balances first");
    const salesCents = report.draft.summary.salesCents;
    return { success: true as const, data: { salesCents, profitCents: calculateFinanceProfit(salesCents, input.goodsCost, input.otherExpenses), endUtc: report.draft.endUtc } };
  } catch (error) { return failure(error); }
}
