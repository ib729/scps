import { NextResponse, type NextRequest } from "next/server";

const destinations: Record<string, string> = {
  "/dashboard": "/admin",
  "/customers": "/admin/customers",
  "/students": "/admin/customers",
  "/transactions": "/admin/transactions",
  "/pos": "/admin/pos",
  "/topup": "/admin/topup",
  "/wcp": "/admin/payments",
  "/student": "/customer",
};

export function proxy(request: NextRequest) {
  // Redirect pages, never POST server actions or their request bodies.
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const slash = pathname.indexOf("/", 1);
  const destination = destinations[slash < 0 ? pathname : pathname.slice(0, slash)];
  if (!destination) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = destination + (slash < 0 ? "" : pathname.slice(slash));
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/dashboard", "/customers/:path*", "/students/:path*", "/transactions/:path*", "/pos/:path*", "/topup/:path*", "/wcp/:path*", "/student/:path*"],
};
