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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCardAction } from "@/app/actions/cards";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddCardDialogProps {
  studentId: number;
}

export function AddCardDialog({ studentId }: AddCardDialogProps) {
  const [open, setOpen] = useState(false);
  const [cardUid, setCardUid] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await createCardAction({
      card_uid: cardUid,
      student_id: studentId,
      status: "active",
    });

    if (result.success) {
      setOpen(false);
      setCardUid("");
    } else {
      setError(result.error || "Failed to create card");
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add Card</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Card</DialogTitle>
            <DialogDescription>
              Register a new card for this student
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="card_uid">Card UID</Label>
              <Input
                id="card_uid"
                value={cardUid}
                onChange={(e) => setCardUid(e.target.value)}
                placeholder="Enter card UID"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

