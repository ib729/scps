import type { Metadata } from "next";

import { requirePageRole } from "@/lib/auth-session";
import { listWechatTopupRequests } from "@/lib/repositories/wechat-topup-requests";
import { PaymentsClient } from "./payments-client";

export const metadata: Metadata = {
  title: "Payment review",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requirePageRole("admin");
  const pending = listWechatTopupRequests({ pendingOnly: true });
  const recent = listWechatTopupRequests();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PaymentsClient pending={pending} recent={recent} />
    </div>
  );
}
