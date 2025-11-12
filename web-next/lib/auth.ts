import { betterAuth } from "better-auth";
import { getDb } from "./db";

export const auth = betterAuth({
  database: getDb(),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
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
  trustedOrigins: [
    "http://localhost:3000",
    "https://stuco.ivanbelousov.com",
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 60 minutes (1 hour) - reduces page refresh frequency
    },
  },
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
