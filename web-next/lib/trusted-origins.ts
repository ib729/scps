const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://192.168.50.195:3000",
] as const;

export function getTrustedOrigins() {
  const configuredOrigins = [
    process.env.BETTER_AUTH_TRUSTED_ORIGINS,
    process.env.TRUSTED_ORIGINS,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .flatMap((value) => (value ? value.split(",") : []))
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_TRUSTED_ORIGINS, ...configuredOrigins]));
}

export function isTrustedOrigin(origin: string) {
  return new Set(getTrustedOrigins()).has(origin);
}
