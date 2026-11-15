import { requirePageRole } from "@/lib/auth-session";
import { StudentSignOutButton } from "./student-controls";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requirePageRole("student");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Student Council Payment System</p>
            <h1 className="text-xl font-semibold tracking-tight">Student account</h1>
            <p className="break-words text-sm text-muted-foreground">{user.name}</p>
          </div>
          <StudentSignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
