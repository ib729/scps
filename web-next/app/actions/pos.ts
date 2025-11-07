"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getStudentById } from "@/lib/repositories/students";
import { createTransaction } from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import {
  getOverdraftWeek,
  upsertOverdraftWeek,
  getCurrentWeekStartUtc,
} from "@/lib/repositories/overdraft";

const posCheckoutSchema = z.object({
  student_id: z.number().int().positive(),
  card_uid: z.string().optional(),
  amount: z.number().int().positive(),
  description: z.string().optional(),
  staff: z.string().optional(),
});

export async function posCheckoutAction(data: unknown) {
  try {
    const validated = posCheckoutSchema.parse(data);
    const db = getDb();

    const result = db.transaction(() => {
      // Get student with account
      const student = getStudentById(validated.student_id);
      if (!student) {
        throw new Error("Student not found");
      }

      const currentBalance = student.balance;
      const chargeAmount = validated.amount;
      const newBalance = currentBalance - chargeAmount;

      let overdraftUsed = 0;

      // Check if overdraft is needed
      if (newBalance < 0) {
        overdraftUsed = Math.abs(newBalance);
        const weekStart = getCurrentWeekStartUtc();
        const overdraftWeek = getOverdraftWeek(validated.student_id, weekStart);
        const currentUsed = overdraftWeek?.used || 0;
        const totalUsed = currentUsed + overdraftUsed;

        if (totalUsed > student.max_overdraft_week) {
          throw new Error(
            `Insufficient funds. Overdraft limit (¥${student.max_overdraft_week}/week) would be exceeded.`
          );
        }

        // Update overdraft usage
        upsertOverdraftWeek(validated.student_id, weekStart, totalUsed);
      }

      // Create transaction
      const transaction = createTransaction({
        student_id: validated.student_id,
        card_uid: validated.card_uid,
        type: "DEBIT",
        amount: -chargeAmount,
        overdraft_component: overdraftUsed,
        description: validated.description || "POS Purchase",
        staff: validated.staff,
      });

      // Update balance
      adjustBalance(validated.student_id, -chargeAmount);

      return {
        transaction,
        newBalance,
        overdraftUsed,
      };
    })();

    revalidatePath("/pos");
    revalidatePath("/transactions");
    revalidatePath("/students");
    revalidatePath(`/students/${validated.student_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process checkout" };
  }
}

