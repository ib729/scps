"use server";

import { revalidatePath } from "next/cache";
import {
  getAllCards,
  getCardByUid,
  getCardsByStudentId,
  createCard,
  updateCardStatus,
  deleteCard,
} from "@/lib/repositories/cards";
import { createCardSchema } from "@/lib/models";
import { requireAuthContext } from "@/lib/auth-session";

export async function getCardsAction() {
  try {
    await requireAuthContext();
    return { success: true, data: getAllCards() };
  } catch {
    return { success: false, error: "Failed to fetch cards" };
  }
}

export async function getCardByUidAction(cardUid: string) {
  try {
    await requireAuthContext();
    const card = getCardByUid(cardUid);
    if (!card) {
      return { success: false, error: "Card not found" };
    }
    return { success: true, data: card };
  } catch {
    return { success: false, error: "Failed to fetch card" };
  }
}

export async function getCardsByStudentIdAction(studentId: number) {
  try {
    await requireAuthContext();
    return { success: true, data: getCardsByStudentId(studentId) };
  } catch {
    return { success: false, error: "Failed to fetch cards" };
  }
}

export async function createCardAction(data: unknown) {
  try {
    await requireAuthContext();
    const validated = createCardSchema.parse(data);
    const card = createCard(validated);
    revalidatePath("/customers");
    revalidatePath(`/customers/${validated.student_id}`);
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
    await requireAuthContext();
    updateCardStatus(cardUid, status);
    revalidatePath("/customers");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update card status" };
  }
}

export async function deleteCardAction(cardUid: string) {
  try {
    await requireAuthContext();
    deleteCard(cardUid);
    revalidatePath("/customers");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete card" };
  }
}
