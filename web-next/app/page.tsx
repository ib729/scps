import { redirect } from "next/navigation";
import { getAuthContext, getUserHomePath } from "@/lib/auth-session";

export default async function HomePage() {
  const session = await getAuthContext();

  if (session) {
    redirect(getUserHomePath(session));
  } else {
    redirect("/login");
  }
}
