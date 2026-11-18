"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCustomerById } from "@/lib/repositories/customers";
import { createTransaction } from "@/lib/repositories/transactions";
import { adjustBalance } from "@/lib/repositories/accounts";
import { toDbValue } from "@/lib/currency";
import { requireStaffContext } from "@/lib/auth-session";
import {
  OTHER_PAYMENT_METHOD_MAX_LENGTH,
  PAYMENT_METHOD_VALUES,
} from "@/lib/payment-methods";

const topupSchema = z
  .object({
    customer_id: z.number().int().positive(),
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
    const { user } = await requireStaffContext();

    const validated = topupSchema.parse(data);
    const db = getDb();

    const amountInCents = toDbValue(validated.amount);
    const paymentMethod = resolvePaymentMethod(
      validated.payment_method,
      validated.other_payment_method,
    );

    const result = db.transaction(() => {
      const customer = getCustomerById(validated.customer_id);
      if (!customer) {
        throw new Error("Customer not found");
      }

      const transaction = createTransaction({
        customer_id: validated.customer_id,
        type: "TOPUP",
        amount: amountInCents,
        overdraft_component: 0,
        payment_method: paymentMethod,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.customer_id, amountInCents);

      return {
        transaction,
        newBalance: customer.balance + amountInCents,
      };
    })();

    revalidatePath("/admin/topup");
    revalidatePath("/admin/transactions");
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${validated.customer_id}`);
    revalidatePath("/admin");

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
    const { user } = await requireStaffContext();

    const validated = topupSchema.parse(data);
    const db = getDb();

    const amountInCents = toDbValue(validated.amount);
    const paymentMethod = resolvePaymentMethod(
      validated.payment_method,
      validated.other_payment_method,
    );

    const result = db.transaction(() => {
      const customer = getCustomerById(validated.customer_id);
      if (!customer) {
        throw new Error("Customer not found");
      }

      const topupTransaction = createTransaction({
        customer_id: validated.customer_id,
        type: "TOPUP",
        amount: amountInCents,
        overdraft_component: 0,
        payment_method: paymentMethod,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.customer_id, amountInCents);

      const paymentTransaction = createTransaction({
        customer_id: validated.customer_id,
        type: "DEBIT",
        amount: -amountInCents,
        overdraft_component: 0,
        description: validated.description || undefined,
        staff: user.name,
      });

      adjustBalance(validated.customer_id, -amountInCents);

      return {
        topupTransaction,
        paymentTransaction,
        newBalance: customer.balance,
      };
    })();

    revalidatePath("/admin/topup");
    revalidatePath("/admin/transactions");
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${validated.customer_id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/pos");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process top-up and payment" };
  }
}
