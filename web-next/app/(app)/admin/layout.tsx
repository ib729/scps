import { AppSidebar } from "@/components/app-sidebar";
import { TapAlert } from "@/components/tap-alert";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { NFCReaderProvider } from "@/lib/nfc-reader-context";
import { requirePageStaffContext } from "@/lib/auth-session";
import { getUserPreferencesByUserId } from "@/lib/repositories/user-preferences";
import { getDb } from "@/lib/db";
import { getSchoolSettings } from "@/lib/school-settings";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageStaffContext();

  const preferences = getUserPreferencesByUserId(session.user.id);

  return (
    <NFCReaderProvider initialSelectedReader={preferences.selected_reader}>
      <SidebarProvider className="h-svh">
        <AppSidebar user={session.user} initialPreferences={preferences} initialSchoolSettings={getSchoolSettings(getDb())} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center px-4 md:hidden">
            <SidebarTrigger className="-ml-1" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4 pt-1 md:px-6 md:pb-6 md:pt-3 lg:px-8 lg:pb-8 lg:pt-5 has-[>[data-workspace-frame]]:px-3 has-[>[data-workspace-frame]]:pb-3 md:has-[>[data-workspace-frame]]:px-4 md:has-[>[data-workspace-frame]]:pb-4 md:has-[>[data-workspace-frame]]:pt-2 lg:has-[>[data-workspace-frame]]:pt-3">
            <TapAlert />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NFCReaderProvider>
  );
}
