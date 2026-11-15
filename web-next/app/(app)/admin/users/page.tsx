import { requirePageRole } from "@/lib/auth-session";
import { listUserAccess } from "@/lib/repositories/account-access";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";
export default async function UserAccessPage() {
  await requirePageRole("admin");
  return <UsersClient users={listUserAccess()} />;
}
