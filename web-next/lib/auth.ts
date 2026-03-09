import { betterAuth } from "better-auth";
import { getDb } from "./db";

const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://192.168.50.195:3000",
] as const;

function getTrustedOrigins() {
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

export const auth = betterAuth({
  database: getDb(),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "staff",
      },
    },
    deleteUser: {
      enabled: true,
    },
  },
  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && {
    socialProviders: {
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      },
    },
  }),
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  trustedOrigins: getTrustedOrigins(),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 2, // 2 hours - reduces session check frequency and page refresh frequency
    },
    // Increase updateAge to reduce session refresh frequency
    updateAge: 60 * 60 * 24, // 1 day - only update session expiration once per day
  },
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
