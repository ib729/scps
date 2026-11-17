import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomerSignOutButton } from "@/app/(customer)/customer/customer-controls";
import { requirePageAuthContext } from "@/lib/auth-session";

export default async function PendingPage() {
  const { user } = await requirePageAuthContext();
  if (user.role !== "customer") redirect("/admin");

  return (
    <Card className="w-full shadow-lg">
      <CardHeader><CardTitle>Awaiting staff access</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Ask an administrator to approve your account and grant staff access in Accounts.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/">Check access</Link></Button>
          <CustomerSignOutButton />
        </div>
      </CardContent>
    </Card>
  );
}
