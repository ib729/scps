import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { TapAlert } from "@/components/tap-alert";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { NFCReaderProvider } from "@/lib/nfc-reader-context";
import { getAuthContext } from "@/lib/auth-session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthContext();

  if (!session) {
    redirect("/login");
  }

  return (
    <NFCReaderProvider>
      <SidebarProvider>
        <AppSidebar user={session.user} />
        <SidebarInset className="min-h-svh overflow-hidden">
          <header className="flex h-14 shrink-0 items-center px-4 md:hidden">
            <SidebarTrigger className="-ml-1" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:p-6 lg:p-8">
            <TapAlert />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NFCReaderProvider>
  );
}
