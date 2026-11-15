"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCustomerAction } from "@/app/actions/customers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CustomerWithAccount } from "@/lib/models";

interface UpdateCustomerFormProps {
  customer: CustomerWithAccount;
}

export function UpdateCustomerForm({ customer }: UpdateCustomerFormProps) {
  const [name, setName] = useState(customer.name);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await updateCustomerAction(customer.id, { name });

    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || "Failed to update customer");
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
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Updating..." : "Update Name"}
      </Button>
    </form>
  );
}
