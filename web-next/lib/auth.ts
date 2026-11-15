import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getDb } from "./db";
import { getTrustedOrigins } from "./trusted-origins";

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
        defaultValue: "student",
      },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        if (getDb().prepare("SELECT role FROM user WHERE id=?").pluck().get(user.id) === "admin") {
          throw new APIError("BAD_REQUEST", { message: "Demote this administrator before deleting the account" });
        }
      },
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
      enabled: false,
    },
    // Increase updateAge to reduce session refresh frequency
    updateAge: 60 * 60 * 24, // 1 day - only update session expiration once per day
  },
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
