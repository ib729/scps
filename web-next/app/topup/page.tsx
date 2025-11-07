import { getAllStudents } from "@/lib/repositories/students";
import { TopupForm } from "./topup-form";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const students = getAllStudents();

  return <TopupForm students={students} />;
}

