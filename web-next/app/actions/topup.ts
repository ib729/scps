"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getStudentById } from "@/lib/repositories/students";
import { createTransaction } from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import { toDbValue } from "@/lib/currency";

const topupSchema = z.object({
  student_id: z.number().int().positive(),
  amount: z.number().positive(), // accepts decimals, will be converted to tenths
  description: z.string().optional(),
  staff: z.string().optional(),
});

export async function topupAction(data: unknown) {
  try {
    const validated = topupSchema.parse(data);
    const db = getDb();

    // Convert display amount to database value (tenths)
    const amountInTenths = toDbValue(validated.amount);

    const result = db.transaction(() => {
      // Verify student exists
      const student = getStudentById(validated.student_id);
      if (!student) {
        throw new Error("Student not found");
      }

      // Create transaction
      const transaction = createTransaction({
        student_id: validated.student_id,
        type: "TOPUP",
        amount: amountInTenths,
        overdraft_component: 0,
        description: validated.description || undefined,
        staff: validated.staff || undefined,
      });

      // Update balance
      adjustBalance(validated.student_id, amountInTenths);

      return {
        transaction,
        newBalance: student.balance + amountInTenths,
      };
    })();

    revalidatePath("/topup");
    revalidatePath("/transactions");
    revalidatePath("/students");
    revalidatePath(`/students/${validated.student_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process top-up" };
  }
}

const adjustSchema = z.object({
  student_id: z.number().int().positive(),
  amount: z.number(), // accepts decimals (positive or negative), will be converted to tenths
  description: z.string(),
  staff: z.string().optional(),
});

export async function adjustBalanceManualAction(data: unknown) {
  try {
    const validated = adjustSchema.parse(data);
    const db = getDb();

    // Convert display amount to database value (tenths)
    const amountInTenths = toDbValue(validated.amount);

    const result = db.transaction(() => {
      // Verify student exists
      const student = getStudentById(validated.student_id);
      if (!student) {
        throw new Error("Student not found");
      }

      // Create adjustment transaction
      const transaction = createTransaction({
        student_id: validated.student_id,
        type: "ADJUST",
        amount: amountInTenths,
        overdraft_component: 0,
        description: validated.description || undefined,
        staff: validated.staff || undefined,
      });

      // Update balance
      adjustBalance(validated.student_id, amountInTenths);

      return {
        transaction,
        newBalance: student.balance + amountInTenths,
      };
    })();

    revalidatePath("/students");
    revalidatePath(`/students/${validated.student_id}`);
    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to adjust balance" };
  }
}

