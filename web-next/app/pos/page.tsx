import { getAllStudents } from "@/lib/repositories/students";
import { PosForm } from "./pos-form";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const students = getAllStudents();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Point of Sale</h1>
        <p className="text-muted-foreground mt-2">
          Process purchases and debit student accounts
        </p>
      </div>

      <PosForm students={students} />
    </div>
  );
}

