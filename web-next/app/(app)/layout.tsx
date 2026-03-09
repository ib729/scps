import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { TapAlert } from "@/components/tap-alert";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
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
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <Separator orientation="vertical" className="mr-2 h-4 md:hidden" />
            <PageHeader />
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
            <TapAlert />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NFCReaderProvider>
  );
}
