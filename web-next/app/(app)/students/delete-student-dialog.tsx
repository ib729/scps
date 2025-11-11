"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { deleteStudentAction } from "@/app/actions/students";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DeleteStudentDialogProps {
  studentId: number;
  studentName: string;
}

export function DeleteStudentDialog({
  studentId,
  studentName,
}: DeleteStudentDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setError("");
    setLoading(true);

    const result = await deleteStudentAction(studentId);

    if (result.success) {
      setOpen(false);
    } else {
      setError(result.error || "Failed to delete student");
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Student</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{studentName}</strong>? This
            will also delete all associated cards, transactions, and account
            data. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
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
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

