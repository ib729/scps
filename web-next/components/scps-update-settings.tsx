"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type UpdateStatus = {
  enabled: boolean;
  running: boolean;
  status: { state: string; message: string } | null;
};

export function ScpsUpdateSettings() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    async function poll() {
      try {
        const response = await fetch("/api/system/update", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Update status unavailable");
        setUpdate(await response.json());
        setDisconnected(false);
      } catch {
        if (!controller.signal.aborted) setDisconnected(true);
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  async function queueUpdate() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/system/update", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not queue the update.");
      setUpdate(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not queue the update.");
    } finally { setSubmitting(false); }
  }

  const message = disconnected
    ? "Update status is unavailable. Waiting to reconnect…"
    : update?.running
      ? update.status?.state === "running" ? update.status.message : "Update queued."
      : update?.status?.message ?? (update?.enabled === false ? "Background updates are not configured on this host." : "");

  return (
    <section className="space-y-3" aria-labelledby="scps-update-heading">
      <h3 id="scps-update-heading" className="text-base font-semibold">Application updates</h3>
      <p className="text-sm text-muted-foreground">
        SCPS keeps running during the build. A successful build briefly interrupts service while SCPS restarts.
      </p>
      <Button type="button" variant="outline" onClick={queueUpdate} disabled={!update?.enabled || update.running || submitting || disconnected}>
        {submitting ? "Queuing…" : update?.running ? "Update in progress…" : "Update SCPS"}
      </Button>
      {!update?.running && update?.status?.state === "updated" && !disconnected && (
        <Button type="button" variant="ghost" onClick={() => window.location.reload()}>Reload page</Button>
      )}
      <p role="status" className="text-sm text-muted-foreground empty:hidden">{message}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
