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

const posCheckoutSchema = z
  .object({
    student_id: z.number().int().positive().optional(),
    card_uid: z.string().optional(),
    amount: z.number().int().positive(),
    description: z.string().optional(),
    staff: z.string().optional(),
  })
  .refine((data) => data.student_id || data.card_uid, {
    message: "Either student_id or card_uid must be provided",
  });

export async function posCheckoutAction(data: unknown) {
  try {
    const validated = posCheckoutSchema.parse(data);
    const db = getDb();

    const result = db.transaction(() => {
      // Resolve student: either from student_id or by looking up card_uid
      let studentId: number;
      let cardUid: string | undefined = validated.card_uid;

      if (validated.student_id) {
        // Direct student selection
        studentId = validated.student_id;
      } else if (validated.card_uid) {
        // Card-based lookup
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

      // Get student with account
      const student = getStudentById(studentId);
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
        const overdraftWeek = getOverdraftWeek(studentId, weekStart);
        const currentUsed = overdraftWeek?.used || 0;
        const totalUsed = currentUsed + overdraftUsed;

        if (totalUsed > student.max_overdraft_week) {
          throw new Error(
            `Insufficient funds. Overdraft limit (¥${student.max_overdraft_week}/week) would be exceeded.`
          );
        }

        // Update overdraft usage
        upsertOverdraftWeek(studentId, weekStart, totalUsed);
      }

      // Create transaction
      const transaction = createTransaction({
        student_id: studentId,
        card_uid: cardUid,
        type: "DEBIT",
        amount: -chargeAmount,
        overdraft_component: overdraftUsed,
        description: validated.description || "POS Purchase",
        staff: validated.staff,
      });

      // Update balance
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

