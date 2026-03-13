"use server";

import { requireAuthContext } from "@/lib/auth-session";
import {
  getUserPreferencesByUserId,
  updateUserPreferencesByUserId,
} from "@/lib/repositories/user-preferences";
import {
  parseNfcReader,
  parsePosDefaultMode,
} from "@/lib/pos-preferences";

export async function getCurrentUserPreferencesAction() {
  try {
    const context = await requireAuthContext();
    return {
      success: true,
      data: getUserPreferencesByUserId(context.user.id),
    };
  } catch {
    return {
      success: false,
      error: "Failed to load preferences",
    };
  }
}

export async function updateCurrentUserPreferencesAction(input: {
  selectedReader: string;
  posDefaultMode: string;
}) {
  try {
    const context = await requireAuthContext();
    const preferences = updateUserPreferencesByUserId(context.user.id, {
      selectedReader: parseNfcReader(input.selectedReader),
      posDefaultMode: parsePosDefaultMode(input.posDefaultMode),
    });

    return {
      success: true,
      data: preferences,
    };
  } catch {
    return {
      success: false,
      error: "Failed to save preferences",
    };
  }
}
