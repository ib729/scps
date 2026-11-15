"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getAuthContext,
  getUserRoleById,
  requireRole,
} from "@/lib/auth-session";
import { consumeSignupAttempt } from "@/lib/signup-rate-limit";
import { approveCustomerRegistration, listUserAccess, setUserRole } from "@/lib/repositories/account-access";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  password: z.string().min(8).max(128),
}).strict();

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().optional(),
  image: z.string().trim().url().nullable().optional(),
});

function getSignupRateLimitKey(headerList: Headers): string {
  return headerList.get("x-scps-client-ip")?.trim().toLowerCase() || "unknown";
}

export async function signupAction(data: unknown) {
  try {
    const requestHeaders = await headers();
    const rateLimitKey = getSignupRateLimitKey(requestHeaders);

    if (!consumeSignupAttempt(rateLimitKey)) {
      return {
        success: false,
        error: "Too many signup attempts. Please wait and try again.",
      };
    }
    const validated = signupSchema.parse(data);

    await auth.api.signUpEmail({
      headers: requestHeaders,
      body: {
        name: validated.name,
        email: validated.email,
        password: validated.password,
      },
    });

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
          SELECT id, name, email, image, emailVerified, createdAt, updatedAt, role
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

export async function createUser(data: unknown) {
  try {
    const { user: actor } = await requireRole("admin");
    const validated = signupSchema.extend({
      image: z.string().url().nullable().optional(),
      role: z.enum(["admin", "staff", "customer"]),
    }).parse(data);
    const result = await auth.api.signUpEmail({
      headers: await headers(),
      body: { name: validated.name, email: validated.email, password: validated.password, image: validated.image ?? undefined },
    });
    setUserRole(actor.id, result.user.id, validated.role);
    revalidatePath("/admin/users");
    return { success: true, data: { id: result.user.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create user" };
  }
}

export async function listUserAccessAction() {
  try {
    await requireRole("admin");
    return { success: true, data: listUserAccess() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to list accounts" };
  }
}

export async function approveCustomerRegistrationAction(data: unknown) {
  try {
    const { user } = await requireRole("admin");
    const input = z.object({ user_id: z.string().min(1), customer_id: z.number().int().positive() }).strict().parse(data);
    approveCustomerRegistration(user.id, input.user_id, input.customer_id);
    revalidatePath("/admin/users");
    revalidatePath("/customer");
    revalidatePath("/customer/pending");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to approve registration" };
  }
}

export async function setUserRoleAction(data: unknown) {
  try {
    const { user } = await requireRole("admin");
    const input = z.object({ user_id: z.string().min(1), role: z.enum(["admin", "staff", "customer"]) }).strict().parse(data);
    setUserRole(user.id, input.user_id, input.role);
    revalidatePath("/admin/users");
    revalidatePath("/customer");
    revalidatePath("/admin/payments");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to change role" };
  }
}
