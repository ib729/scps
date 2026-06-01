import type { Metadata } from "next";

import { requirePageAuthContext } from "@/lib/auth-session";
import { listWechatTopupRequests } from "@/lib/repositories/wechat-topup-requests";
import { WcpClient } from "./wcp-client";

export const metadata: Metadata = {
  title: "WCP",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function WcpPage() {
  await requirePageAuthContext();
  const initialRequests = listWechatTopupRequests(60);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <WcpClient initialRequests={initialRequests} />
    </div>
  );
}
