"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  approveWechatTopupRequestAction,
  createWechatTopupRequestAction,
  markWechatTopupRequestClaimedAction,
  rejectWechatTopupRequestAction,
} from "@/app/actions/wcp";
import { StudentSearchField } from "@/components/student-search-field";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/currency";
import type {
  StudentWithAccount,
  WechatTopupRequestWithStudent,
} from "@/lib/models";
import { Check, Copy } from "@/lib/icons";

const qrImageCandidates = [
  process.env.NEXT_PUBLIC_WCP_QR_IMAGE_URL?.trim(),
  "/wechat-pay-qr.png",
  "/wechat-pay-qr.jpg",
  "/wechat-pay-qr.jpeg",
  "/wechat-pay-qr.webp",
].filter((value, index, values): value is string =>
  Boolean(value) && values.indexOf(value) === index,
);

function formatDateTime(value: string) {
  return new Date(`${value}Z`).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  });
}

function RequestStatusBadge({ request }: { request: WechatTopupRequestWithStudent }) {
  const label =
    request.status === "pending" && request.claimed_at
      ? "awaiting review"
      : request.status;

  const className =
    request.status === "approved"
      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
      : request.status === "rejected"
        ? "border-red-200 bg-red-50 text-red-600 dark:border-red-950 dark:bg-red-950/30 dark:text-red-400"
        : request.status === "expired"
          ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-400"
          : request.claimed_at
            ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-400"
            : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400";

  return <Badge className={className}>{label}</Badge>;
}

export function WcpClient({
  initialRequests,
}: {
  initialRequests: WechatTopupRequestWithStudent[];
}) {
  const router = useRouter();
  const [selectedStudent, setSelectedStudent] =
    React.useState<StudentWithAccount | null>(null);
  const [amount, setAmount] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [latestRequest, setLatestRequest] =
    React.useState<WechatTopupRequestWithStudent | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isSubmitting, startSubmitTransition] = React.useTransition();
  const [requestActionId, setRequestActionId] = React.useState<number | null>(null);
  const [requestError, setRequestError] = React.useState("");
  const [qrImageIndex, setQrImageIndex] = React.useState(0);
  const [showPaymentDialog, setShowPaymentDialog] = React.useState(false);
  const [qrFailed, setQrFailed] = React.useState(false);
  const hasUnresolvedRequests = initialRequests.some(
    (request) => request.status === "pending",
  );

  React.useEffect(() => {
    if (!hasUnresolvedRequests) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasUnresolvedRequests, router]);

  const copyPayableAmount = async (value: number) => {
    await navigator.clipboard.writeText(formatCurrency(value));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent || !amount) {
      return;
    }

    setError("");
    setSuccess("");
    setLatestRequest(null);

    startSubmitTransition(async () => {
      const result = await createWechatTopupRequestAction({
        student_id: selectedStudent.id,
        amount: Number.parseFloat(amount),
        internal_note: internalNote || undefined,
      });

      if (!result.success || !result.data) {
        setError(result.error || "Failed to create request");
        return;
      }

      setLatestRequest(result.data);
      setQrImageIndex(0);
      setQrFailed(false);
      setShowPaymentDialog(true);
      setSuccess(
        `Pending WeChat request created for ${result.data.student_name}. Ask them to pay exactly ¥${formatCurrency(result.data.payable_amount)}.`,
      );
      setAmount("");
      setInternalNote("");
      router.refresh();
    });
  };

  const handleReview = (
    requestId: number,
    action: "approve" | "reject" | "claim",
  ) => {
    setRequestError("");
    setRequestActionId(requestId);

    startSubmitTransition(async () => {
      const result =
        action === "approve"
          ? await approveWechatTopupRequestAction({ request_id: requestId })
          : action === "claim"
            ? await markWechatTopupRequestClaimedAction({ request_id: requestId })
          : await rejectWechatTopupRequestAction({ request_id: requestId });

      if (!result.success) {
        setRequestError(result.error || `Failed to ${action} request`);
        setRequestActionId(null);
        return;
      }

      if (
        action === "claim" &&
        latestRequest?.id === requestId &&
        result.data &&
        !("request" in result.data)
      ) {
        setLatestRequest(result.data);
        setSuccess("Payment marked as sent. We will review it shortly.");
        setShowPaymentDialog(false);
      }

      setRequestActionId(null);
      router.refresh();
    });
  };

  const activeQrImageSrc = qrImageCandidates[qrImageIndex] ?? null;
  const qrAvailable = Boolean(activeQrImageSrc) && !qrFailed;

  return (
    <>
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-3xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>Complete WeChat Payment</DialogTitle>
            <DialogDescription>
              Pay the exact amount below, then confirm once the transfer is sent.
            </DialogDescription>
          </DialogHeader>

          {latestRequest ? (
            <div className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pay Exactly
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-4xl font-semibold">
                    ¥{formatCurrency(latestRequest.payable_amount)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyPayableAmount(latestRequest.payable_amount)}
                    className="h-9 w-9 p-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div>Base amount: ¥{formatCurrency(latestRequest.requested_amount)}</div>
                  <div>Request ID: #{latestRequest.id}</div>
                  <div>Created: {formatDateTime(latestRequest.created_at)}</div>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] md:items-stretch">
                <div className="rounded-2xl border bg-white p-4">
                  {qrAvailable && activeQrImageSrc ? (
                    <img
                      src={activeQrImageSrc}
                      alt="WeChat Pay QR code"
                      className="mx-auto h-52 w-52 rounded-lg object-contain"
                      onError={() => {
                        if (qrImageIndex + 1 < qrImageCandidates.length) {
                          setQrImageIndex(qrImageIndex + 1);
                          return;
                        }

                        setQrFailed(true);
                      }}
                    />
                  ) : (
                    <div className="flex h-52 w-52 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
                      QR image not available yet
                    </div>
                  )}
                </div>

                <div className="flex min-h-[240px] flex-col rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                  <div className="space-y-3">
                    <p className="font-medium text-foreground">
                      Scan with WeChat and enter the exact payable amount.
                    </p>
                    <p>1. Scan the QR code.</p>
                    <p>2. Enter exactly ¥{formatCurrency(latestRequest.payable_amount)}.</p>
                    <p>3. After the payment is sent, tap the confirmation button below.</p>
                  </div>
                  {!qrAvailable ? (
                    <div className="mt-3 rounded-lg border border-dashed p-3 text-sm">
                      Put the QR image in{" "}
                      <span className="font-mono">web-next/public/wechat-pay-qr.png</span>{" "}
                      or set{" "}
                      <span className="font-mono">NEXT_PUBLIC_WCP_QR_IMAGE_URL</span>{" "}
                      to a valid public path, then rebuild the app.
                    </div>
                  ) : null}
                  <div className="mt-auto pt-4">
                  {latestRequest.claimed_at ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-400">
                      Payment marked as sent at {formatDateTime(latestRequest.claimed_at)}.
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => handleReview(latestRequest.id, "claim")}
                      disabled={isSubmitting && requestActionId === latestRequest.id}
                      className="h-12 w-full justify-center rounded-xl px-6 text-base font-semibold"
                    >
                      {isSubmitting && requestActionId === latestRequest.id
                        ? "Saving..."
                        : "I've Paid"}
                    </Button>
                  )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="grid h-full min-h-0 gap-6 overflow-hidden xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>WeChat Request Creator</CardTitle>
          <CardDescription>
            Hidden internal alpha for manual WeChat top-ups.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          <form onSubmit={handleCreateRequest} className="flex min-h-full flex-col gap-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {success ? (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}

            <StudentSearchField
              id="wcp-student"
              label="Customer"
              placeholder="Search customers by name"
              selectedStudent={selectedStudent}
              onSelect={setSelectedStudent}
            />

            <div className="space-y-2">
              <Label htmlFor="wcp-amount" className="text-base font-medium">
                Base Amount (¥)
              </Label>
              <Input
                id="wcp-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Enter requested top-up amount"
                className="h-12 text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wcp-note" className="text-base font-medium">
                Internal Note (Optional)
              </Label>
              <Textarea
                id="wcp-note"
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                placeholder="Anything staff should remember about this request"
                className="min-h-[96px] text-base"
              />
            </div>

            <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
              Create the request, open the payment popup, and let the customer
              tap <span className="font-medium text-foreground">I&apos;ve Paid</span>{" "}
              after they send the transfer.
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !selectedStudent || !amount}
              className="mt-auto h-12 w-full text-base font-semibold"
            >
              {isSubmitting ? "Creating..." : "Create Pending Request"}
            </Button>
          </form>
        </CardContent>
      </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>Request History</CardTitle>
          <CardDescription>
            Customer-side status only. Telegram handles approval and rejection.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
          {requestError ? (
            <Alert variant="destructive">
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          ) : null}

          {initialRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No WeChat requests yet.
            </div>
          ) : (
            <div data-native-scroll className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {initialRequests.map((request) => {
                const isPending = request.status === "pending";
                const isActing = isSubmitting && requestActionId === request.id;

                return (
                  <div
                    key={request.id}
                    className="rounded-xl border p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold">
                            {request.student_name}
                          </span>
                          <RequestStatusBadge request={request} />
                          <span className="text-xs text-muted-foreground">
                            #{request.id}
                          </span>
                        </div>
                        <div className="grid gap-1 text-sm text-muted-foreground">
                          <span>
                            Base amount: ¥{formatCurrency(request.requested_amount)}
                          </span>
                          <span>
                            Pay exactly: ¥{formatCurrency(request.payable_amount)}
                          </span>
                          <span>
                            Created: {formatDateTime(request.created_at)}
                          </span>
                          {request.claimed_at ? (
                            <span>
                              Marked paid: {formatDateTime(request.claimed_at)}
                            </span>
                          ) : null}
                          {request.internal_note ? (
                            <span>Note: {request.internal_note}</span>
                          ) : null}
                          {request.approved_transaction_id ? (
                            <span>
                              Transaction ID:{" "}
                              <span className="font-mono">
                                {request.approved_transaction_id}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground md:text-right">
                        {isPending && !request.claimed_at ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={isActing}
                            onClick={() => handleReview(request.id, "claim")}
                            className="h-10 px-4 font-medium"
                          >
                            {isActing ? "Working..." : "I've Paid"}
                          </Button>
                        ) : null}
                        {!isPending || request.claimed_at ? (
                          <>
                            {request.reviewed_by_name ? (
                              <div>Reviewed by {request.reviewed_by_name}</div>
                            ) : null}
                            {request.reviewed_at ? (
                              <div>{formatDateTime(request.reviewed_at)}</div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
}
