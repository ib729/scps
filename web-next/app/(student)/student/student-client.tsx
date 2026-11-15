"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createWechatTopupRequestAction,
  markWechatTopupRequestClaimedAction,
} from "@/app/actions/wcp";
import { WechatPaymentDialog } from "@/components/wechat-payment-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import type { StudentPaymentRequest, StudentPortalData } from "@/lib/models";
import { RefreshStatusButton } from "./student-controls";

function formatDateTime(value: string) {
  return new Date(`${value}Z`).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
    timeZoneName: "short",
  });
}

function PaymentRequestCard({
  request,
  onPay,
  disabled,
}: {
  request: StudentPaymentRequest;
  onPay: (requestId: number) => void;
  disabled: boolean;
}) {
  const awaitingPayment = request.status === "pending" && !request.claimed_at;
  const statusLabel = request.status === "pending"
    ? request.claimed_at ? "Awaiting review" : "Awaiting payment"
    : request.status.charAt(0).toUpperCase() + request.status.slice(1);

  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">Request #{request.id}</h4>
        <Badge variant={request.status === "rejected" ? "destructive" : request.status === "pending" ? "secondary" : "outline"}>
          {statusLabel}
        </Badge>
      </div>
      <p className="text-sm font-medium tabular-nums">
        {awaitingPayment ? "Pay" : "Payable amount:"} ¥{formatCurrency(request.payable_amount)};
        {" "}{awaitingPayment ? "account credit after approval:" : "base amount:"} ¥{formatCurrency(request.requested_amount)}
      </p>
      <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div><dt className="inline">Created: </dt><dd className="inline">{formatDateTime(request.created_at)}</dd></div>
        <div><dt className="inline">{request.claimed_at ? "Original payment deadline: " : "Payment deadline: "}</dt><dd className="inline">{formatDateTime(request.expires_at)}</dd></div>
        {request.claimed_at && <div><dt className="inline">Marked sent: </dt><dd className="inline">{formatDateTime(request.claimed_at)}</dd></div>}
        {request.reviewed_at && <div><dt className="inline">Resolved: </dt><dd className="inline">{formatDateTime(request.reviewed_at)}</dd></div>}
      </dl>
      {request.status === "pending" && request.claimed_at && (
        <p className="text-sm text-muted-foreground">Your payment is awaiting administrator review. Only approval adds the base amount to your balance.</p>
      )}
      {request.status === "approved" && (
        <p className="text-sm">Account credited: ¥{formatCurrency(request.requested_amount)}{request.approved_transaction_id ? ` · Transaction #${request.approved_transaction_id}` : ""}</p>
      )}
      {request.review_note && (
        <p className="whitespace-pre-wrap break-words text-sm">
          <span className="font-medium">{request.status === "rejected" ? "Reason" : "Review note"}: </span>{request.review_note}
        </p>
      )}
      {request.status === "rejected" && <p className="text-sm text-muted-foreground">No account credit was added. Rejection does not refund a WeChat transfer; contact an administrator if you sent it.</p>}
      {(awaitingPayment || request.status === "expired") && (
        <p className="text-sm text-muted-foreground">
          After expiry, do not pay. If already sent, contact an administrator with this request ID.
        </p>
      )}
      {awaitingPayment && (
        <Button variant="outline" disabled={disabled} onClick={() => onPay(request.id)}>
          Payment instructions
        </Button>
      )}
    </li>
  );
}

export function StudentClient({ initialData }: { initialData: StudentPortalData }) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [claiming, setClaiming] = React.useState(false);
  const [selectedRequestId, setSelectedRequestId] = React.useState<number | null>(null);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const latestData = React.useRef(initialData);
  const [requestUpdate, setRequestUpdate] = React.useState<{
    request: StudentPaymentRequest;
    source: StudentPortalData;
  } | null>(null);

  React.useEffect(() => {
    latestData.current = initialData;
  }, [initialData]);

  const serverRequests = [...initialData.pendingRequests, ...initialData.recentRequests];
  // An action DTO bridges only the current snapshot; the next server refresh is authoritative.
  const localRequest = requestUpdate?.source === initialData ? requestUpdate.request : null;
  const serverRequest = localRequest && serverRequests.find((request) => request.id === localRequest.id);
  const useLocalRequest = localRequest && (!serverRequest || (serverRequest.status === "pending" && !serverRequest.claimed_at));
  const requests = useLocalRequest
    ? [localRequest, ...serverRequests.filter((request) => request.id !== localRequest.id)]
    : serverRequests;
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const recentRequests = requests.filter((request) => request.status !== "pending");
  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null;
  const hasPendingRequests = pendingRequests.length > 0;

  React.useEffect(() => {
    if (!hasPendingRequests) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [hasPendingRequests, router]);

  React.useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [router]);

  React.useEffect(() => {
    if (!selectedRequest || selectedRequest.status !== "pending" || selectedRequest.claimed_at) {
      setPaymentOpen(false);
    }
  }, [selectedRequest]);

  const createRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const result = await createWechatTopupRequestAction({ amount });
      if (!result.success || !result.data) {
        setError(result.error || "Failed to create payment request. Try again.");
        return;
      }
      setRequestUpdate({ request: result.data, source: latestData.current });
      setSelectedRequestId(result.data.id);
      setPaymentOpen(true);
      setAmount("");
      router.refresh();
    } catch {
      setError("Failed to create payment request. Refresh status before trying again.");
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const markPaid = async (requestId: number) => {
    setError("");
    setClaiming(true);
    try {
      const result = await markWechatTopupRequestClaimedAction({ request_id: requestId });
      if (!result.success || !result.data) {
        setError(result.error || "Failed to mark payment as sent. Refresh status and try again.");
        router.refresh();
        return;
      }
      setRequestUpdate({ request: result.data, source: latestData.current });
      setPaymentOpen(false);
      router.refresh();
    } catch {
      setError("Failed to mark payment as sent. Refresh status before trying again.");
      router.refresh();
    } finally {
      setClaiming(false);
    }
  };

  const openPayment = (requestId: number) => {
    setError("");
    setSelectedRequestId(requestId);
    setPaymentOpen(true);
  };

  const changePaymentOpen = (open: boolean) => {
    setPaymentOpen(open);
    if (!open && selectedRequest?.status === "pending" && !selectedRequest.claimed_at && Date.now() >= Date.parse(`${selectedRequest.expires_at}Z`)) {
      setError(`Request #${selectedRequest.id} expired. After expiry, do not pay. If already sent, contact an administrator with this request ID.`);
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-2xl font-semibold tracking-tight">{initialData.student.name}&apos;s account</h2>
        <RefreshStatusButton />
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle><h3>Available balance</h3></CardTitle>
            <CardDescription>Your account balance, including approved top-ups.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="break-all text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">¥{formatCurrency(initialData.student.balance)}</p>
            <p className="mt-4 text-sm text-muted-foreground">Requesting a top-up or marking a payment sent does not change your balance.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle><h3>Request a WeChat top-up</h3></CardTitle>
            <CardDescription>Choose the base amount to credit. Pay the exact amount assigned to your request, then wait for administrator approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topup-amount">Base amount (¥)</Label>
                <Input id="topup-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="30.00" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={creating || claiming} required aria-describedby="topup-amount-help" />
                <p id="topup-amount-help" className="text-xs text-muted-foreground">Use a positive amount with at most two decimal places. The payable amount will be 1–99 cents higher.</p>
              </div>
              <Button type="submit" disabled={creating || claiming || !amount.trim()} className="w-full sm:w-auto">{creating ? "Creating request…" : "Request top-up"}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle><h3>Pending payment requests</h3></CardTitle>
          <CardDescription>Awaiting payment or administrator review. Status and balance refresh every 3 seconds while this page is visible.</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRequests.length ? (
            <ul className="space-y-3">{pendingRequests.map((request) => <PaymentRequestCard key={request.id} request={request} onPay={openPayment} disabled={creating || claiming} />)}</ul>
          ) : <p className="text-sm text-muted-foreground">No pending payment requests. Request a top-up above when you need to add funds.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle><h3>Recent payment history</h3></CardTitle>
          <CardDescription>Up to 50 recent resolved requests. Only approved requests add their base amount to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRequests.length ? (
            <ul className="space-y-3">{recentRequests.map((request) => <PaymentRequestCard key={request.id} request={request} onPay={openPayment} disabled={creating || claiming} />)}</ul>
          ) : <p className="text-sm text-muted-foreground">No resolved payment requests yet.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle><h3>Transaction history</h3></CardTitle>
          <CardDescription>Your account transactions. Pending payment requests are not transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          {initialData.transactions.length ? (
            <Table aria-label="Your transaction history">
              <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Payment method</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {initialData.transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-mono">#{transaction.id}</TableCell>
                    <TableCell>{formatDateTime(transaction.created_at)}</TableCell>
                    <TableCell>{{ TOPUP: "Top-up", DEBIT: "Purchase", ADJUST: "Adjustment" }[transaction.type]}</TableCell>
                    <TableCell>{transaction.payment_method || "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{transaction.amount > 0 ? "+" : transaction.amount < 0 ? "−" : ""}¥{formatCurrency(Math.abs(transaction.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No transactions yet.</p>}
        </CardContent>
      </Card>
      <WechatPaymentDialog request={selectedRequest} open={paymentOpen && selectedRequest?.status === "pending" && !selectedRequest.claimed_at} onOpenChange={changePaymentOpen} onPaid={markPaid} submitting={claiming} error={error || undefined} />
    </>
  );
}
