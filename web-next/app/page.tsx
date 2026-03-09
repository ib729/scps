import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-session";

export default async function HomePage() {
  const session = await getAuthContext();

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
