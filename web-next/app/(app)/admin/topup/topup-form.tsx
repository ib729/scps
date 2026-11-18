"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check } from "@/lib/icons";

import { getCustomerByIdAction } from "@/app/actions/customers";
import {
  topupAction,
  topupAndPayAction,
} from "@/app/actions/topup";
import { CustomerSearchField } from "@/components/customer-search-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, LOW_BALANCE_THRESHOLD } from "@/lib/currency";
import type { CustomerWithAccount } from "@/lib/models";
import {
  OTHER_PAYMENT_METHOD_MAX_LENGTH,
  PAYMENT_METHOD_VALUES,
  type PaymentMethod,
} from "@/lib/payment-methods";

interface TopupFormProps {
  customerIdsWithTransactions: number[];
  userName: string;
}

type ReceiptItem = {
  id: number;
  label: string;
};

export function TopupForm({ customerIdsWithTransactions, userName }: TopupFormProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [otherPaymentMethod, setOtherPaymentMethod] = useState("");
  const [description, setDescription] = useState("");
  const [staff, setStaff] = useState(userName || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [copiedTransactionId, setCopiedTransactionId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithAccount | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const customerFromUrl = searchParams.get("customer");
    if (!customerFromUrl || selectedCustomer) {
      return;
    }

    const customerId = Number.parseInt(customerFromUrl, 10);
    if (!Number.isFinite(customerId)) {
      router.replace("/admin/topup");
      return;
    }

    void (async () => {
      const result = await getCustomerByIdAction(customerId);
      if (result.success && result.data) {
        setSelectedCustomer(result.data);
      }
      router.replace("/admin/topup");
    })();
  }, [searchParams, selectedCustomer, router]);

  const copyTransactionId = async (txId: number) => {
    await navigator.clipboard.writeText(txId.toString());
    setCopiedTransactionId(txId);
    setTimeout(
      () => setCopiedTransactionId((current) => (current === txId ? null : current)),
      2000,
    );
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      return;
    }

    setError("");
    setSuccess("");
    setReceiptItems([]);
    setCopiedTransactionId(null);
    setLoading(true);

    const result = await topupAction({
      customer_id: selectedCustomer.id,
      amount: parseFloat(amount),
      payment_method: paymentMethod as PaymentMethod,
      other_payment_method: paymentMethod === "Other" ? otherPaymentMethod : undefined,
      description: description || undefined,
    });

    if (result.success && result.data) {
      setSuccess(
        `Successfully added ¥${amount} to ${selectedCustomer.name}. New balance: ¥${formatCurrency(
          result.data.newBalance,
        )}`,
      );
      setReceiptItems([
        {
          id: result.data.transaction.id,
          label: "Top-up Transaction ID",
        },
      ]);
      setSelectedCustomer({
        ...selectedCustomer,
        balance: result.data.newBalance,
      });
      setAmount("");
      setPaymentMethod("");
      setOtherPaymentMethod("");
      setDescription("");
    } else {
      setError(result.error || "Failed to process top-up");
    }

    setLoading(false);
  };

  const handleTopupAndPay = async () => {
    if (!selectedCustomer) {
      return;
    }

    setError("");
    setSuccess("");
    setReceiptItems([]);
    setCopiedTransactionId(null);
    setCombinedLoading(true);

    const result = await topupAndPayAction({
      customer_id: selectedCustomer.id,
      amount: parseFloat(amount),
      payment_method: paymentMethod as PaymentMethod,
      other_payment_method: paymentMethod === "Other" ? otherPaymentMethod : undefined,
      description: description || undefined,
    });

    if (result.success && result.data) {
      setSuccess(
        `Successfully added and deducted ¥${amount} for ${selectedCustomer.name}. Balance remains: ¥${formatCurrency(
          result.data.newBalance,
        )}`,
      );
      setReceiptItems([
        {
          id: result.data.topupTransaction.id,
          label: "Top-up Transaction ID",
        },
        {
          id: result.data.paymentTransaction.id,
          label: "Payment Transaction ID",
        },
      ]);
      setSelectedCustomer({
        ...selectedCustomer,
        balance: result.data.newBalance,
      });
      setAmount("");
      setPaymentMethod("");
      setOtherPaymentMethod("");
      setDescription("");
    } else {
      setError(result.error || "Failed to process top-up and payment");
    }

    setCombinedLoading(false);
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleTopup} className="grid gap-x-6 gap-y-3 sm:grid-cols-2 sm:gap-y-4">
            {error ? (
              <Alert variant="destructive" className="col-span-full">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert className="col-span-full">
                <AlertDescription>
                  <div className="space-y-2">
                    <div>{success}</div>
                    {receiptItems.map((item) => (
                      <div key={item.id} className="mt-2 flex items-center gap-2">
                        <span className="min-w-0 wrap-anywhere text-sm text-muted-foreground">
                          {item.label}: <span className="font-mono font-medium">{item.id}</span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyTransactionId(item.id)}
                          className="h-6 w-6 shrink-0 p-0"
                        >
                          {copiedTransactionId === item.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="col-span-full min-w-0">
              <CustomerSearchField
                id="customer"
                label="Customer"
                placeholder="Search customers by name"
                selectedCustomer={selectedCustomer}
                onSelect={setSelectedCustomer}
              />
            </div>

            {selectedCustomer ? (
              <div className="col-span-full space-y-2 rounded-lg bg-muted px-3 py-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Current Balance:</span>
                  <span
                    className={`font-bold ${
                      selectedCustomer.balance < 0
                        ? "text-red-600"
                        : selectedCustomer.balance <= LOW_BALANCE_THRESHOLD &&
                            customerIdsWithTransactions.includes(selectedCustomer.id)
                          ? "text-orange-600"
                          : ""
                    }`}
                  >
                    ¥{formatCurrency(selectedCustomer.balance)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-base font-medium">
                Amount (¥)
              </Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (e.g., 5.50)"
                className="h-12 text-base md:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method" className="text-base font-medium">
                Payment Method
              </Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => {
                  const nextValue = value as PaymentMethod;
                  setPaymentMethod(nextValue);
                  if (nextValue !== "Other") {
                    setOtherPaymentMethod("");
                  }
                }}
              >
                <SelectTrigger
                  id="payment-method"
                  className="data-[size=default]:h-12 w-full text-base md:text-base"
                >
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_VALUES.filter((method) => method !== "Bitcoin").map((method) => (
                    <SelectItem key={method} value={method} className="text-base md:text-base">
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "Other" ? (
              <div className="col-span-full space-y-2">
                <Label htmlFor="other-payment-method" className="text-base font-medium">
                  Other Payment Method
                </Label>
                <Input
                  id="other-payment-method"
                  value={otherPaymentMethod}
                  onChange={(e) => setOtherPaymentMethod(e.target.value)}
                  placeholder="Enter payment method"
                  className="h-12 text-base md:text-base"
                  maxLength={OTHER_PAYMENT_METHOD_MAX_LENGTH}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Up to {OTHER_PAYMENT_METHOD_MAX_LENGTH} characters.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-medium">
                Notes (Optional)
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about the top-up"
                className="h-12 min-h-12 text-base md:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff" className="text-base font-medium">
                Staff Name
              </Label>
              <Input
                id="staff"
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
                placeholder="Your name"
                className="h-12 text-base md:text-base"
                disabled
              />
            </div>

            <div className="col-span-full grid gap-3 pt-2 sm:grid-cols-2">
              <Button
                type="submit"
                disabled={
                  loading ||
                  combinedLoading ||
                  !selectedCustomer ||
                  !amount ||
                  !paymentMethod ||
                  (paymentMethod === "Other" && !otherPaymentMethod.trim())
                }
                className="h-auto min-h-11 w-full whitespace-normal text-base font-semibold"
              >
                {loading ? "Processing..." : `Add ¥${amount || "0"}`}
              </Button>
              <Button
                type="button"
                disabled={
                  loading ||
                  combinedLoading ||
                  !selectedCustomer ||
                  !amount ||
                  !paymentMethod ||
                  (paymentMethod === "Other" && !otherPaymentMethod.trim())
                }
                onClick={() => void handleTopupAndPay()}
                className="h-auto min-h-11 w-full whitespace-normal text-base font-semibold"
              >
                {combinedLoading ? "Processing..." : `Add and deduct ¥${amount || "0"}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
