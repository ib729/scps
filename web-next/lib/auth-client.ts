import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  fetchOptions: {
    // Prevent automatic page refreshes on auth errors
    onError(context) {
      // Only log errors in development
      if (process.env.NODE_ENV === "development") {
        console.error("Auth request error:", context.error);
      }
      // Don't throw errors that could trigger page refreshes
      // Errors are handled gracefully by the components
    },
    // Prevent automatic retries that might cause refreshes
    retry: false,
  },
});

