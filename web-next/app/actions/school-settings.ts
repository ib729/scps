"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth-session";
import { getDb } from "@/lib/db";
import { saveSchoolSettings } from "@/lib/school-settings";

export async function updateSchoolSettingsAction(input: unknown) {
  try {
    await requireRole("admin");
    const data = saveSchoolSettings(getDb(), input);
    revalidatePath("/admin", "layout");
    return { success: true, data };
  } catch {
    return { success: false, error: "Unable to save school details. Check the year and logo, and try again." };
  }
}
