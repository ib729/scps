import { betterAuth } from "better-auth";
import { getDb } from "./db";

export const auth = betterAuth({
  database: getDb(),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
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
});
