"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAccountAction } from "@/app/actions/accounts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { StudentWithAccount } from "@/lib/models";

interface UpdateAccountFormProps {
  student: StudentWithAccount;
}

export function UpdateAccountForm({ student }: UpdateAccountFormProps) {
  const [maxOverdraftWeek, setMaxOverdraftWeek] = useState(
    student.max_overdraft_week
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await updateAccountAction(student.id, {
      max_overdraft_week: maxOverdraftWeek,
    });

    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || "Failed to update account");
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="overdraft">Overdraft Limit (¥/week)</Label>
        <Input
          id="overdraft"
          type="number"
          min="0"
          value={maxOverdraftWeek}
          onChange={(e) => setMaxOverdraftWeek(parseInt(e.target.value))}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Updating..." : "Update Overdraft Limit"}
      </Button>
    </form>
  );
}

