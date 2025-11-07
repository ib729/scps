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

export async function getCardsAction() {
  try {
    return { success: true, data: getAllCards() };
  } catch {
    return { success: false, error: "Failed to fetch cards" };
  }
}

export async function getCardByUidAction(cardUid: string) {
  try {
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
    return { success: true, data: getCardsByStudentId(studentId) };
  } catch {
    return { success: false, error: "Failed to fetch cards" };
  }
}

export async function createCardAction(data: unknown) {
  try {
    const validated = createCardSchema.parse(data);
    const card = createCard(validated);
    revalidatePath("/students");
    revalidatePath(`/students/${validated.student_id}`);
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
    updateCardStatus(cardUid, status);
    revalidatePath("/students");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update card status" };
  }
}

export async function deleteCardAction(cardUid: string) {
  try {
    deleteCard(cardUid);
    revalidatePath("/students");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete card" };
  }
}

