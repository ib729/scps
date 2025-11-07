import { Suspense } from "react";
import { getAllStudents } from "@/lib/repositories/students";
import { PosForm } from "./pos-form";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const students = getAllStudents();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PosForm students={students} />
    </Suspense>
  );
}

