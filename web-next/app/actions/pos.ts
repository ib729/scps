"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkoutStudent } from "@/lib/repositories/checkout";
import { toDbValue } from "@/lib/currency";
import { requireStaffContext } from "@/lib/auth-session";

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
    const { user } = await requireStaffContext();

    const validated = posCheckoutSchema.parse(data);

    const chargeAmountInCents = toDbValue(validated.amount);

    const result = checkoutStudent({
      ...validated,
      amount: chargeAmountInCents,
      staff: user.name,
    });

    revalidatePath("/pos");
    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${result.transaction.student_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process checkout" };
  }
}
