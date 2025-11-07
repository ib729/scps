"use server";

import { revalidatePath } from "next/cache";
import {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  searchStudents,
} from "@/lib/repositories/students";
import { createStudentSchema } from "@/lib/models";

export async function getStudentsAction() {
  try {
    return { success: true, data: getAllStudents() };
  } catch {
    return { success: false, error: "Failed to fetch students" };
  }
}

export async function getStudentByIdAction(id: number) {
  try {
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
    deleteStudent(id);
    revalidatePath("/students");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete student" };
  }
}

export async function searchStudentsAction(query: string) {
  try {
    return { success: true, data: searchStudents(query) };
  } catch {
    return { success: false, error: "Failed to search students" };
  }
}

