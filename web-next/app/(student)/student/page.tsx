import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError, requirePageRole, requireStudentContext } from "@/lib/auth-session";
import type { StudentPortalData } from "@/lib/models";
import { getStudentPortalData } from "@/lib/repositories/student-portal";
import { StudentClient } from "./student-client";

export const metadata: Metadata = { title: "Student account" };

export default async function StudentPage() {
  await requirePageRole("student");
  let data: StudentPortalData;

  try {
    const { studentId } = await requireStudentContext();
    data = getStudentPortalData(studentId);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/login");
    if (
      (error instanceof AuthError && error.status === 403) ||
      (error instanceof Error && error.message === "Student account is unavailable")
    ) {
      redirect("/student/pending");
    }
    throw error;
  }

  return <StudentClient initialData={data} />;
}
