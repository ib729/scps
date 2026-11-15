"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkoutCustomer } from "@/lib/repositories/checkout";
import { toDbValue } from "@/lib/currency";
import { requireStaffContext } from "@/lib/auth-session";

const posCheckoutSchema = z
  .object({
    customer_id: z.number().int().positive().optional(),
    card_uid: z.string().optional(),
    amount: z.number().positive(),
    description: z.string().optional(),
  })
  .refine((data) => data.customer_id || data.card_uid, {
    message: "Either customer_id or card_uid must be provided",
  });

export async function posCheckoutAction(data: unknown) {
  try {
    const { user } = await requireStaffContext();

    const validated = posCheckoutSchema.parse(data);

    const chargeAmountInCents = toDbValue(validated.amount);

    const result = checkoutCustomer({
      ...validated,
      amount: chargeAmountInCents,
      staff: user.name,
    });

    revalidatePath("/pos");
    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${result.transaction.customer_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to process checkout" };
  }
}
