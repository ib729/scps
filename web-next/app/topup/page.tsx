import { getAllStudents } from "@/lib/repositories/students";
import { TopupForm } from "./topup-form";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const students = getAllStudents();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Top-up Account</h1>
        <p className="text-muted-foreground mt-2">
          Add funds to student accounts
        </p>
      </div>

      <TopupForm students={students} />
    </div>
  );
}

