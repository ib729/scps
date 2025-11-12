import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  fetchOptions: {
    // Reduce the frequency of automatic session checks to prevent page refreshes
    onError(context) {
      // Only log errors in development
      if (process.env.NODE_ENV === "development") {
        console.error("Auth request error:", context.error);
      }
    },
  },
});

