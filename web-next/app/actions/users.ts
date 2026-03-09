"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AuthError,
  getAuthContext,
  getUserRoleById,
  requireRole,
} from "@/lib/auth-session";
import {
  clearSignupAttempts,
  isSignupRateLimited,
  recordSignupAttempt,
} from "@/lib/signup-rate-limit";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  signupCode: z.string().trim().min(1).max(64),
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().optional(),
  image: z.string().trim().url().nullable().optional(),
});

function getSignupRateLimitKey(email: string, headerList: Headers) {
  const clientIp =
    headerList.get("x-real-ip") ||
    headerList
      .get("x-forwarded-for")
      ?.split(",")
      .map((part) => part.trim())
      .find(Boolean) ||
    "unknown";

  return `${clientIp}:${email.toLowerCase()}`;
}

export async function signupAction(data: unknown) {
  const signupCode = process.env.SIGNUP_CODE?.trim();
  if (!signupCode) {
    console.error("SIGNUP_CODE environment variable is not set");
    return {
      success: false,
      error: "Account creation is not available right now.",
    };
  }

  try {
    const validated = signupSchema.parse(data);
    const requestHeaders = await headers();
    const rateLimitKey = getSignupRateLimitKey(validated.email, requestHeaders);

    if (isSignupRateLimited(rateLimitKey)) {
      return {
        success: false,
        error: "Too many signup attempts. Please wait and try again.",
      };
    }

    if (validated.signupCode !== signupCode) {
      recordSignupAttempt(rateLimitKey);
      return {
        success: false,
        error: "Unable to create account with the provided details.",
      };
    }

    await auth.api.signUpEmail({
      headers: requestHeaders,
      body: {
        name: validated.name,
        email: validated.email,
        password: validated.password,
      },
    });

    clearSignupAttempts(rateLimitKey);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Unable to create account with the provided details.",
      };
    }

    console.error("Failed to create account:", error);
    return {
      success: false,
      error: "Unable to create account with the provided details.",
    };
  }
}

export async function getCurrentUser() {
  try {
    const context = await getAuthContext();
    if (!context) {
      return { success: false, error: "Unauthorized" };
    }

    return {
      success: true,
      user: context.user,
    };
  } catch (error) {
    console.error("Failed to get current user:", error);
    return { success: false, error: "Failed to get current user" };
  }
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; email?: string; image?: string | null }
) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return { success: false, error: "Unauthorized" };
    }

    if (context.user.id !== userId && context.user.role !== "admin") {
      return { success: false, error: "Forbidden" };
    }

    const validated = updateProfileSchema.parse(data);
    const db = getDb();

    const existingUser = db
      .prepare("SELECT id FROM user WHERE id = ? LIMIT 1")
      .get(userId) as { id: string } | undefined;

    if (!existingUser) {
      return { success: false, error: "User not found" };
    }

    db.prepare(
      `
        UPDATE user
        SET
          name = COALESCE(?, name),
          email = COALESCE(?, email),
          image = CASE WHEN ? THEN ? ELSE image END,
          updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `,
    ).run(
      validated.name ?? null,
      validated.email ?? null,
      Number(Object.prototype.hasOwnProperty.call(validated, "image")),
      validated.image ?? null,
      userId,
    );

    const updatedUser = db
      .prepare(
        `
          SELECT id, name, email, image, emailVerified, createdAt, updatedAt, COALESCE(role, 'staff') AS role
          FROM user
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(userId) as
      | {
          id: string;
          name: string;
          email: string;
          image: string | null;
          emailVerified: number;
          createdAt: string | number;
          updatedAt: string | number;
          role?: string;
        }
      | undefined;

    revalidatePath("/");
    
    return {
      success: true,
      user: updatedUser
        ? {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            image: updatedUser.image,
            emailVerified: Boolean(updatedUser.emailVerified),
            createdAt: new Date(updatedUser.createdAt),
            updatedAt: new Date(updatedUser.updatedAt),
            role: getUserRoleById(updatedUser.id),
          }
        : null,
    };
  } catch (error) {
    console.error("Failed to update profile:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update profile" };
  }
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  image?: string | null;
}) {
  try {
    await requireRole("admin");
    const validated = signupSchema.extend({
      signupCode: z.string().optional(),
    }).parse({
      ...data,
      signupCode: process.env.SIGNUP_CODE || "admin-created",
    });

    await auth.api.signUpEmail({
      headers: await headers(),
      body: {
        name: validated.name,
        email: validated.email,
        password: validated.password,
        image: data.image ?? undefined,
      },
    });

    revalidatePath("/");
    
    return {
      success: true,
      user: null,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: error.message };
    }
    console.error("Failed to create user:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create user" };
  }
}
