"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function RefreshStatusButton() {
  const router = useRouter();
  const [refreshing, startRefresh] = React.useTransition();

  return (
    <Button variant="outline" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
      {refreshing ? "Refreshing…" : "Refresh status"}
    </Button>
  );
}

export function StudentSignOutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const signOut = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message || "Failed to sign out. Try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Failed to sign out. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={submitting} onClick={signOut}>
        {submitting ? "Signing out…" : "Sign out"}
      </Button>
      {error && <p role="alert" className="max-w-xs text-sm text-destructive">{error}</p>}
    </div>
  );
}
