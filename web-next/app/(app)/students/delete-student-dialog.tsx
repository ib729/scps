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
import { deleteStudentAction } from "@/app/actions/students";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

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

  const handleDelete = async () => {
    setError("");
    setLoading(true);

    const result = await deleteStudentAction(studentId);

    if (result.success) {
      setOpen(false);
      toast.success(result.message || "Student deleted successfully");
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
            Are you sure you want to delete <strong>{studentName}</strong>?
            <br /><br />
            If the student has no transactions, they will be permanently deleted.
            <br />
            If the student has transactions, they will be <strong>archived</strong> instead to preserve financial history.
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
            {loading ? "Processing..." : "Delete / Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

