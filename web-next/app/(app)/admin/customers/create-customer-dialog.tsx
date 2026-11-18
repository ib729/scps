"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerAction } from "@/app/actions/customers";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function CreateCustomerDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await createCustomerAction({ name });

    if (result.success) {
      setOpen(false);
      setName("");
    } else {
      setError(result.error || "Failed to create customer");
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Customer</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-sm">
        <DialogTitle className="sr-only">Add Customer</DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Input
            aria-label="Customer name"
            placeholder="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <DialogFooter className="grid grid-cols-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
