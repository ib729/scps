import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError, requirePageRole, requireCustomerContext } from "@/lib/auth-session";
import type { CustomerPortalData } from "@/lib/models";
import { getCustomerPortalData } from "@/lib/repositories/customer-portal";
import { CustomerClient } from "./customer-client";

export const metadata: Metadata = { title: "Customer account" };

export default async function CustomerPage() {
  await requirePageRole("customer");
  let data: CustomerPortalData;

  try {
    const { customerId } = await requireCustomerContext();
    data = getCustomerPortalData(customerId);
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/login");
    if (
      (error instanceof AuthError && error.status === 403) ||
      (error instanceof Error && error.message === "Customer account is unavailable")
    ) {
      redirect("/customer/pending");
    }
    throw error;
  }

  return <CustomerClient initialData={data} />;
}
