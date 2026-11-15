"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteCustomerAction } from "@/app/actions/customers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

interface DeleteCustomerDialogProps {
  customerId: number;
  customerName: string;
}

export function DeleteCustomerDialog({
  customerId,
  customerName,
}: DeleteCustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setError("");
    setLoading(true);

    const result = await deleteCustomerAction(customerId);

    if (result.success) {
      setOpen(false);
      toast.success(result.message || "Customer deleted successfully");
    } else {
      setError(result.error || "Failed to delete customer");
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-[460px]">
        <DialogHeader className="gap-3">
          <DialogTitle>Delete Customer</DialogTitle>
          <DialogDescription>
            Delete <strong>{customerName}</strong> from the active customer list.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-red-200 bg-red-50/70 p-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300">
          Customers with transaction history will be archived instead of permanently removed.
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Processing..." : "Delete / Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
