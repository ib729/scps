"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getStudentById } from "@/lib/repositories/students";
import { getCardByUid } from "@/lib/repositories/cards";
import { createTransaction } from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import {
  getOverdraftWeek,
  upsertOverdraftWeek,
  getCurrentWeekStartUtc,
} from "@/lib/repositories/overdraft";
import { formatCurrency, toDbValue } from "@/lib/currency";
import { requireAuthContext } from "@/lib/auth-session";

const posCheckoutSchema = z
  .object({
    student_id: z.number().int().positive().optional(),
    card_uid: z.string().optional(),
    amount: z.number().positive(),
    description: z.string().optional(),
  })
  .refine((data) => data.student_id || data.card_uid, {
    message: "Either student_id or card_uid must be provided",
  });

export async function posCheckoutAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();

    const validated = posCheckoutSchema.parse(data);
    const db = getDb();

    const chargeAmountInCents = toDbValue(validated.amount);

    const result = db.transaction(() => {
      let studentId: number;
      const cardUid: string | undefined = validated.card_uid;

      if (validated.student_id) {
        studentId = validated.student_id;
      } else if (validated.card_uid) {
        const card = getCardByUid(validated.card_uid);
        if (!card) {
          throw new Error("Card not found");
        }
        if (card.status !== "active") {
          throw new Error("Card is not active");
        }
        studentId = card.student_id;
      } else {
        throw new Error("Either student_id or card_uid must be provided");
      }

      const student = getStudentById(studentId);
      if (!student) {
        throw new Error("Customer not found");
      }

      const currentBalance = student.balance;
      const chargeAmount = chargeAmountInCents;
      const newBalance = currentBalance - chargeAmount;

      let overdraftUsed = 0;

      if (newBalance < 0) {
        overdraftUsed = Math.abs(newBalance);
        const weekStart = getCurrentWeekStartUtc();
        const overdraftWeek = getOverdraftWeek(studentId, weekStart);
        const currentUsed = overdraftWeek?.used || 0;
        const totalUsed = currentUsed + overdraftUsed;

        if (totalUsed > student.max_overdraft_week) {
          throw new Error(
            `Insufficient funds. Overdraft limit (¥${formatCurrency(student.max_overdraft_week)}/week) would be exceeded.`
          );
        }

        upsertOverdraftWeek(studentId, weekStart, totalUsed);
      }

      const transaction = createTransaction({
        student_id: studentId,
        card_uid: cardUid,
        type: "DEBIT",
        amount: -chargeAmount,
        overdraft_component: overdraftUsed,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(studentId, -chargeAmount);

      return {
        transaction,
        newBalance,
        overdraftUsed,
      };
    })();

    revalidatePath("/pos");
    revalidatePath("/transactions");
    revalidatePath("/students");
    revalidatePath(`/students/${result.transaction.student_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process checkout" };
  }
}
