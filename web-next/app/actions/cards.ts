"use server";

import { revalidatePath } from "next/cache";
import {
  getAllCards,
  getCardByUid,
  getCardsByCustomerId,
  createCard,
  updateCardStatus,
  deleteCard,
} from "@/lib/repositories/cards";
import { createCardSchema } from "@/lib/models";
import { requireStaffContext } from "@/lib/auth-session";

export async function getCardsAction() {
  try {
    await requireStaffContext();
    return { success: true, data: getAllCards() };
  } catch {
    return { success: false, error: "Failed to fetch cards" };
  }
}

export async function getCardByUidAction(cardUid: string) {
  try {
    await requireStaffContext();
    const card = getCardByUid(cardUid);
    if (!card) {
      return { success: false, error: "Card not found" };
    }
    return { success: true, data: card };
  } catch {
    return { success: false, error: "Failed to fetch card" };
  }
}

export async function getCardsByCustomerIdAction(customerId: number) {
  try {
    await requireStaffContext();
    return { success: true, data: getCardsByCustomerId(customerId) };
  } catch {
    return { success: false, error: "Failed to fetch cards" };
  }
}

export async function createCardAction(data: unknown) {
  try {
    await requireStaffContext();
    const validated = createCardSchema.parse(data);
    const card = createCard(validated);
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${validated.customer_id}`);
    return { success: true, data: card };
  } catch {
    return { success: false, error: "Failed to create card" };
  }
}

export async function updateCardStatusAction(
  cardUid: string,
  status: "active" | "revoked"
) {
  try {
    await requireStaffContext();
    updateCardStatus(cardUid, status);
    revalidatePath("/admin/customers");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update card status" };
  }
}

export async function deleteCardAction(cardUid: string) {
  try {
    await requireStaffContext();
    deleteCard(cardUid);
    revalidatePath("/admin/customers");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete card" };
  }
}
