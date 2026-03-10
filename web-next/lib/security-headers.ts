import { getTrustedOrigins } from "./trusted-origins";

function toWebSocketOrigin(origin: string) {
  if (origin.startsWith("https://")) {
    return origin.replace("https://", "wss://");
  }

  if (origin.startsWith("http://")) {
    return origin.replace("http://", "ws://");
  }

  return origin;
}

export function getContentSecurityPolicy() {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (process.env.NODE_ENV !== "production") {
    scriptSources.push("'unsafe-eval'");
  }

  const connectSources = Array.from(
    new Set([
      "'self'",
      ...getTrustedOrigins(),
      ...getTrustedOrigins().map(toWebSocketOrigin),
    ]),
  );

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
