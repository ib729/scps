"use server";

import { revalidatePath } from "next/cache";
import {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  archiveStudent,
  hasTransactions,
  searchStudents,
  getStudentByName,
} from "@/lib/repositories/students";
import { createStudentSchema } from "@/lib/models";
import { requireAuthContext } from "@/lib/auth-session";

export async function getStudentsAction() {
  try {
    await requireAuthContext();
    return { success: true, data: getAllStudents() };
  } catch {
    return { success: false, error: "Failed to fetch students" };
  }
}

export async function getStudentByIdAction(id: number) {
  try {
    await requireAuthContext();
    const student = getStudentById(id);
    if (!student) {
      return { success: false, error: "Student not found" };
    }
    return { success: true, data: student };
  } catch {
    return { success: false, error: "Failed to fetch student" };
  }
}

export async function createStudentAction(data: unknown) {
  try {
    await requireAuthContext();
    const validated = createStudentSchema.parse(data);
    const student = createStudent(validated);
    revalidatePath("/students");
    return { success: true, data: student };
  } catch {
    return { success: false, error: "Failed to create student" };
  }
}

export async function updateStudentAction(id: number, data: unknown) {
  try {
    await requireAuthContext();
    const validated = createStudentSchema.parse(data);
    updateStudent(id, validated);
    revalidatePath("/students");
    revalidatePath(`/students/${id}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update student" };
  }
}

export async function deleteStudentAction(id: number) {
  try {
    await requireAuthContext();

    if (hasTransactions(id)) {
      archiveStudent(id);
      revalidatePath("/students");
      return { success: true, message: "Student archived due to existing transactions." };
    }

    deleteStudent(id);
    revalidatePath("/students");
    return { success: true, message: "Student deleted successfully." };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY"
    ) {
      // Fallback if hasTransactions check missed something or race condition
      try {
        archiveStudent(id);
        revalidatePath("/students");
        return { success: true, message: "Student archived due to existing financial history." };
      } catch {
        return {
          success: false,
          error: "Cannot delete or archive student with existing financial history.",
        };
      }
    }
    return { success: false, error: "Failed to delete student" };
  }
}

export async function searchStudentsAction(query: string, limit: number = 10) {
  try {
    await requireAuthContext();
    return { success: true, data: searchStudents(query, limit) };
  } catch {
    return { success: false, error: "Failed to search students" };
  }
}

export async function getStudentByNameAction(name: string) {
  try {
    await requireAuthContext();
    const student = getStudentByName(name);
    if (!student) {
      return { success: true, data: null };
    }
    return { success: true, data: student };
  } catch {
    return { success: false, error: "Failed to fetch student by name" };
  }
}
