import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export type UserRole = "admin" | "staff";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: UserRole;
};

export type AuthContext = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  user: AuthenticatedUser;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function normalizeUserRole(role: unknown): UserRole {
  return role === "admin" ? "admin" : "staff";
}

export function getUserRoleById(userId: string): UserRole {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COALESCE(role, 'staff') AS role FROM user WHERE id = ? LIMIT 1",
    )
    .get(userId) as { role?: string } | undefined;

  return normalizeUserRole(row?.role);
}

async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  return {
    session,
    user: {
      ...session.user,
      role: getUserRoleById(session.user.id),
    },
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new AuthError("Unauthorized", 401);
  }
  return context;
}

export async function requireRole(role: UserRole): Promise<AuthContext> {
  const context = await requireAuthContext();
  if (context.user.role !== role) {
    throw new AuthError("Forbidden", 403);
  }
  return context;
}

export async function requirePageAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    redirect("/login");
  }
  return context;
}

export async function requirePageRole(role: UserRole): Promise<AuthContext> {
  const context = await requirePageAuthContext();
  if (context.user.role !== role) {
    redirect("/dashboard");
  }
  return context;
}

export function getAuthErrorDetails(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return {
      status: error.status,
      message: error.message,
    };
  }

  return {
    status: 500,
    message: fallback,
  };
}
