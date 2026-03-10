import { AuthError } from "@/lib/auth-session";
import { isTrustedOrigin } from "@/lib/trusted-origins";

function getOriginFromHeader(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function requireTrustedRequestOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const isAllowedOrigin = (origin: string) =>
    origin === requestOrigin || isTrustedOrigin(origin);

  const originHeader = getOriginFromHeader(request.headers.get("origin"));
  if (originHeader) {
    if (isAllowedOrigin(originHeader)) {
      return;
    }

    throw new AuthError("Forbidden", 403);
  }

  const refererOrigin = getOriginFromHeader(request.headers.get("referer"));
  if (refererOrigin) {
    if (isAllowedOrigin(refererOrigin)) {
      return;
    }

    throw new AuthError("Forbidden", 403);
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (request.method === "GET" && (secFetchSite === "same-origin" || secFetchSite === "none")) {
    return;
  }

  throw new AuthError("Forbidden", 403);
}
