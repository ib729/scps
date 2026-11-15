"use client";

import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/currency";
import { Check, Copy } from "@/lib/icons";
import type { StudentPaymentRequest } from "@/lib/models";

const configuredQrPath = process.env.NEXT_PUBLIC_WCP_QR_IMAGE_URL?.trim();
const qrImageCandidates = [
  // Root-relative paths keep merchant images on this origin, including behind a proxy.
  configuredQrPath?.startsWith("/") &&
  !configuredQrPath.startsWith("//") &&
  !/[\u0000-\u0020\u007f\\]/.test(configuredQrPath)
    ? configuredQrPath
    : undefined,
  "/wechat-pay-qr.png",
  "/wechat-pay-qr.jpg",
  "/wechat-pay-qr.jpeg",
  "/wechat-pay-qr.webp",
].filter((value, index, values): value is string =>
  Boolean(value) && values.indexOf(value) === index,
);

const expiryWarning =
  "After expiry, do not pay. If already sent, contact an administrator with this request ID.";

function timestamp(value: string) {
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
}

function formatDateTime(value: string) {
  return new Date(timestamp(value)).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  });
}

export function WechatPaymentDialog({
  request,
  open,
  onOpenChange,
  onPaid,
  submitting,
  error,
}: {
  request: StudentPaymentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: (requestId: number) => void;
  submitting: boolean;
  error?: string;
}) {
  const [now, setNow] = React.useState(Date.now);
  const [qrImageIndex, setQrImageIndex] = React.useState(0);
  const [loadedQrSrc, setLoadedQrSrc] = React.useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = React.useState("");
  const activeQrImageSrc = qrImageCandidates[qrImageIndex];
  const qrLoaded = Boolean(activeQrImageSrc && loadedQrSrc === activeQrImageSrc);
  const expired = Boolean(request && (
    request.status === "expired" ||
    !Number.isFinite(timestamp(request.expires_at)) ||
    now >= timestamp(request.expires_at)
  ));
  const canShow = Boolean(request && !request.claimed_at &&
    (request.status === "pending" || request.status === "expired"));

  React.useEffect(() => {
    if (open && !canShow) onOpenChange(false);
  }, [open, canShow, onOpenChange]);

  React.useEffect(() => {
    setQrImageIndex(0);
    setLoadedQrSrc(null);
    setCopyFeedback("");
  }, [request?.id, open]);

  React.useEffect(() => {
    if (!open || !canShow) return;
    const checkExpiry = () => setNow(Date.now());
    checkExpiry();
    const intervalId = window.setInterval(checkExpiry, 1000);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [open, canShow, request?.id]);

  React.useEffect(() => {
    if (!copyFeedback) return;
    const timeoutId = window.setTimeout(() => setCopyFeedback(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [copyFeedback]);

  const copyPayableAmount = async () => {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(formatCurrency(request.payable_amount));
      setCopyFeedback("Amount copied.");
    } catch {
      setCopyFeedback("Could not copy. Enter the exact payable amount manually.");
    }
  };

  const handlePaid = () => {
    if (!request || !qrLoaded || submitting || request.status !== "pending" || request.claimed_at) return;
    if (Date.now() >= timestamp(request.expires_at) || !Number.isFinite(timestamp(request.expires_at))) {
      setNow(Date.now());
      return;
    }
    onPaid(request.id);
  };

  return (
    <Dialog open={open && canShow} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{expired ? "Payment request expired" : "Complete WeChat Payment"}</DialogTitle>
          <DialogDescription>
            {expired
              ? "Payment instructions are no longer available for this request."
              : "Pay the exact amount below, then confirm once the transfer is sent."}
          </DialogDescription>
        </DialogHeader>

        {request && canShow ? (
          <div className="space-y-5">
            {expired ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <p>{expiryWarning}</p>
                  <p>Request ID: #{request.id}</p>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Pay Exactly</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="break-all text-4xl font-semibold">¥{formatCurrency(request.payable_amount)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyPayableAmount}
                      className="h-9 w-9 p-0"
                      aria-label="Copy exact payable amount"
                    >
                      {copyFeedback === "Amount copied." ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-sm" role="status">{copyFeedback}</p>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <div>Account credit after approval: ¥{formatCurrency(request.requested_amount)}</div>
                    <div>Request ID: #{request.id}</div>
                    <div>Created: {formatDateTime(request.created_at)}</div>
                    <div>Pay before: {formatDateTime(request.expires_at)}</div>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="rounded-2xl border bg-white p-4">
                    {activeQrImageSrc ? (
                      <>
                        <img
                          key={`${request.id}:${activeQrImageSrc}`}
                          src={activeQrImageSrc}
                          alt="WeChat Pay merchant QR code"
                          className="mx-auto h-52 w-full max-w-52 rounded-lg object-contain"
                          onLoad={(event) => {
                            if (event.currentTarget.naturalWidth > 0) setLoadedQrSrc(activeQrImageSrc);
                          }}
                          onError={() => {
                            setLoadedQrSrc(null);
                            setQrImageIndex((index) => index + 1);
                          }}
                        />
                        {!qrLoaded ? <p className="mt-2 text-center text-sm text-slate-500" role="status">Loading merchant QR…</p> : null}
                      </>
                    ) : (
                      <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
                        Merchant QR image unavailable
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    <div className="space-y-3">
                      <p className="font-medium text-foreground">Scan with WeChat and enter the exact payable amount.</p>
                      <p>This static QR does not prefill the amount.</p>
                      <p>1. Scan the QR code.</p>
                      <p>2. Enter exactly ¥{formatCurrency(request.payable_amount)}.</p>
                      <p>3. After the payment is sent, tap the confirmation button below.</p>
                    </div>
                    <div className="mt-auto pt-4">
                      <Button type="button" onClick={handlePaid} disabled={submitting || !qrLoaded} className="h-12 w-full rounded-xl text-base font-semibold">
                        {submitting ? "Saving..." : "I've Paid"}
                      </Button>
                    </div>
                  </div>
                </div>

                {!activeQrImageSrc ? (
                  <Alert variant="destructive">
                    <AlertDescription className="break-words">
                      <p>Merchant QR configuration is missing or could not be loaded. Do not pay until an administrator fixes it.</p>
                      <p>Put the merchant QR image in <span className="font-mono">web-next/public/wechat-pay-qr.png</span> (or .jpg, .jpeg, .webp), or set <span className="font-mono">NEXT_PUBLIC_WCP_QR_IMAGE_URL</span> to a same-origin root-relative public path such as <span className="font-mono">/merchant-qr.png</span>, then rebuild the app.</p>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Alert><AlertDescription>{expiryWarning}</AlertDescription></Alert>
              </>
            )}
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
