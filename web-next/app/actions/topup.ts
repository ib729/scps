"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getStudentById } from "@/lib/repositories/students";
import { createTransaction } from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import { toDbValue } from "@/lib/currency";
import { requireAuthContext } from "@/lib/auth-session";
import {
  OTHER_PAYMENT_METHOD_MAX_LENGTH,
  PAYMENT_METHOD_VALUES,
} from "@/lib/payment-methods";

const topupSchema = z
  .object({
    student_id: z.number().int().positive(),
    amount: z.number().positive(),
    payment_method: z.enum(PAYMENT_METHOD_VALUES),
    other_payment_method: z
      .string()
      .trim()
      .max(OTHER_PAYMENT_METHOD_MAX_LENGTH)
      .optional(),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.payment_method === "Other" && !data.other_payment_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["other_payment_method"],
        message: "Enter the payment method",
      });
    }
  });

function resolvePaymentMethod(
  paymentMethod: (typeof PAYMENT_METHOD_VALUES)[number],
  otherPaymentMethod?: string,
) {
  return paymentMethod === "Other" ? otherPaymentMethod! : paymentMethod;
}

export async function topupAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();

    const validated = topupSchema.parse(data);
    const db = getDb();

    const amountInCents = toDbValue(validated.amount);
    const paymentMethod = resolvePaymentMethod(
      validated.payment_method,
      validated.other_payment_method,
    );

    const result = db.transaction(() => {
      const student = getStudentById(validated.student_id);
      if (!student) {
        throw new Error("Customer not found");
      }

      const transaction = createTransaction({
        student_id: validated.student_id,
        type: "TOPUP",
        amount: amountInCents,
        overdraft_component: 0,
        payment_method: paymentMethod,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.student_id, amountInCents);

      return {
        transaction,
        newBalance: student.balance + amountInCents,
      };
    })();

    revalidatePath("/topup");
    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${validated.student_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process top-up" };
  }
}

export async function topupAndPayAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();

    const validated = topupSchema.parse(data);
    const db = getDb();

    const amountInCents = toDbValue(validated.amount);
    const paymentMethod = resolvePaymentMethod(
      validated.payment_method,
      validated.other_payment_method,
    );

    const result = db.transaction(() => {
      const student = getStudentById(validated.student_id);
      if (!student) {
        throw new Error("Customer not found");
      }

      const topupTransaction = createTransaction({
        student_id: validated.student_id,
        type: "TOPUP",
        amount: amountInCents,
        overdraft_component: 0,
        payment_method: paymentMethod,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.student_id, amountInCents);

      const paymentTransaction = createTransaction({
        student_id: validated.student_id,
        type: "DEBIT",
        amount: -amountInCents,
        overdraft_component: 0,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.student_id, -amountInCents);

      return {
        topupTransaction,
        paymentTransaction,
        newBalance: student.balance,
      };
    })();

    revalidatePath("/topup");
    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${validated.student_id}`);
    revalidatePath("/dashboard");
    revalidatePath("/pos");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process top-up and payment" };
  }
}

const adjustSchema = z.object({
  student_id: z.number().int().positive(),
  amount: z.number(),
  description: z.string(),
});

export async function adjustBalanceManualAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();

    const validated = adjustSchema.parse(data);
    const db = getDb();

    const amountInCents = toDbValue(validated.amount);

    const result = db.transaction(() => {
      const student = getStudentById(validated.student_id);
      if (!student) {
        throw new Error("Customer not found");
      }

      const transaction = createTransaction({
        student_id: validated.student_id,
        type: "ADJUST",
        amount: amountInCents,
        overdraft_component: 0,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.student_id, amountInCents);

      return {
        transaction,
        newBalance: student.balance + amountInCents,
      };
    })();

    revalidatePath("/customers");
    revalidatePath(`/customers/${validated.student_id}`);
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
