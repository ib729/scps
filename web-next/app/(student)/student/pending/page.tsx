import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth-session";
import { getLinkedCustomerId } from "@/lib/repositories/account-access";
import { RefreshStatusButton } from "../customer-controls";

export const metadata: Metadata = { title: "Awaiting administrator approval" };

export default async function PendingCustomerPage() {
  const { user } = await requirePageRole("customer");
  if (getLinkedCustomerId(user.id) !== undefined) redirect("/student");

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h2>Awaiting administrator approval</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          An administrator must link your login to your customer account before you can view balances or request top-ups.
        </p>
        <RefreshStatusButton />
      </CardContent>
    </Card>
  );
}
