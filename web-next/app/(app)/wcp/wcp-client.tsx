"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { approveWechatTopupRequestAction, rejectWechatTopupRequestAction } from "@/app/actions/wcp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import type { WechatTopupRequestWithCustomer } from "@/lib/models";

function formatDateTime(value: string) {
  return new Date(`${value}Z`).toLocaleString();
}

export function WcpClient({ pending, recent }: { pending: WechatTopupRequestWithCustomer[]; recent: WechatTopupRequestWithCustomer[] }) {
  const router = useRouter();
  const [review, setReview] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const current = pending.find(request => request.id === review?.id);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") router.refresh(); };
    const interval = window.setInterval(refreshVisible, 3000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [router]);

  async function submitReview() {
    if (!review || !current) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = review.action === "approve"
        ? await approveWechatTopupRequestAction({ request_id: review.id, receipt_confirmed: confirmed, review_note: note || undefined })
        : await rejectWechatTopupRequestAction({ request_id: review.id, review_note: note || undefined });
      if (!result.success) setError(result.error || "Review failed. Refresh to check the current result.");
      else { setMessage(`Request #${review.id} ${review.action === "approve" ? "approved" : "rejected"}.`); setReview(null); }
    } catch { setError("Unable to save review. Refresh to check the current result before retrying."); }
    finally { setBusy(false); router.refresh(); }
  }

  return <div className="space-y-6 overflow-auto pb-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Payment review</h1><p className="text-muted-foreground">Compare the real WeChat receipt amount, time and customer/request identity before crediting an account.</p></div><Button variant="outline" onClick={() => router.refresh()}>Refresh</Button></header>
    <p className="text-sm text-muted-foreground">The exact amount is a reconciliation hint, not proof of payment. After expiry, do not pay. If already sent, contact an administrator with this request ID. Investigate late transfers manually; never match them automatically to a newer request. Rejection does not refund WeChat.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {message && <p role="status">{message}</p>}
    {[{ title: "Pending requests", requests: pending }, { title: "Recent history", requests: recent }].map(section => <Card key={section.title}>
      <CardHeader><CardTitle>{section.title}</CardTitle><CardDescription>{section.title === "Pending requests" ? "All active reservations, with paid claims first." : "Up to 50 recently resolved requests."}</CardDescription></CardHeader>
      <CardContent className="space-y-3">{!section.requests.length && <p className="text-sm text-muted-foreground">No requests.</p>}{section.requests.map(request => <article key={request.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">#{request.id} · {request.customer_name}</h2><Badge variant="outline">{request.status === "pending" ? request.claimed_at ? "Awaiting review" : "Awaiting payment" : request.status}</Badge></div>
          <p>Credit: ¥{formatCurrency(request.requested_amount)} · Exact payable: ¥{formatCurrency(request.payable_amount)}</p>
          <div className="space-y-1 text-sm text-muted-foreground"><p>Customer #{request.customer_id} · Created: {formatDateTime(request.created_at)}</p><p>Deadline: {formatDateTime(request.expires_at)}</p>{request.claimed_at && <p>Marked sent: {formatDateTime(request.claimed_at)}</p>}{request.internal_note && <p>Internal note: {request.internal_note}</p>}{request.review_note && <p>Review note: {request.review_note}</p>}{request.reviewed_at && <p>Reviewed: {formatDateTime(request.reviewed_at)} by {request.reviewed_by_name || request.reviewed_by_user_id}</p>}{request.approved_transaction_id && <p>Transaction #{request.approved_transaction_id}</p>}</div>
        </div>{request.status === "pending" && <div className="flex gap-2">{request.claimed_at && <Button disabled={busy} onClick={() => { setReview({ id: request.id, action: "approve" }); setConfirmed(false); setNote(""); setError(""); }}>Approve</Button>}<Button variant="outline" disabled={busy} onClick={() => { setReview({ id: request.id, action: "reject" }); setConfirmed(false); setNote(""); setError(""); }}>Reject</Button></div>}</div>
      </article>)}</CardContent>
    </Card>)}
    <Dialog open={!!review} onOpenChange={open => { if (!open && !busy) setReview(null); }}><DialogContent><DialogHeader><DialogTitle>{review?.action === "approve" ? "Approve verified payment" : "Reject request"} #{review?.id}</DialogTitle><DialogDescription>{current ? `${current.customer_name}: payable ¥${formatCurrency(current.payable_amount)}, account credit ¥${formatCurrency(current.requested_amount)}.` : "This request is no longer pending. Close this dialog and inspect its current result in Recent history."}</DialogDescription></DialogHeader>
      {review?.action === "approve" && <div className="flex items-center gap-2"><Input type="checkbox" className="h-4 w-4" id="receipt-confirmed" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || !current?.claimed_at} /><Label htmlFor="receipt-confirmed">I verified the transfer in WeChat</Label></div>}
      <div className="space-y-2"><Label htmlFor="review-note">{review?.action === "reject" ? "Reason shown to the customer (optional)" : "Review note shown to the customer (optional)"}</Label><Textarea id="review-note" maxLength={500} value={note} onChange={e => setNote(e.target.value)} disabled={busy || !current} /></div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button><Button disabled={busy || !current || (review?.action === "approve" && (!confirmed || !current.claimed_at))} onClick={() => void submitReview()}>{busy ? "Saving…" : review?.action === "approve" ? "Approve and credit account" : "Reject request"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
