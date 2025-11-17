"use server";

import { getDb } from "@/lib/db";
import { UsersRepository } from "@/lib/repositories";
import {
  createUserSchema,
  updateUserProfileSchema,
} from "@/lib/models";
import { revalidatePath } from "next/cache";

/**
 * Verify signup code
 * The code is stored securely in environment variables and never exposed to the client
 */
export async function verifySignupCode(code: string) {
  const validCode = process.env.SIGNUP_CODE;
  
  if (!validCode) {
    console.error("SIGNUP_CODE environment variable is not set");
    return { success: false, error: "Signup verification is not configured" };
  }
  
  if (code === validCode) {
    return { success: true };
  }
  
  return { success: false, error: "Invalid signup code" };
}

export async function getCurrentUser() {
  try {
    const db = getDb();
    const usersRepo = new UsersRepository(db);
    
    // Return the first user if exists
    const users = usersRepo.findAll();
    if (users.length > 0) {
      const user = users[0];
      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar || undefined,
        },
      };
    }
    
    // No users exist - return null to indicate setup is needed
    return {
      success: true,
      user: null,
    };
  } catch (error) {
    console.error("Failed to get current user:", error);
    return { success: false, error: "Failed to get current user" };
  }
}

export async function updateUserProfile(
  userId: number,
  data: { name?: string; email?: string; avatar?: string }
) {
  try {
    const validated = updateUserProfileSchema.parse(data);
    const db = getDb();
    const usersRepo = new UsersRepository(db);
    
    const user = usersRepo.updateProfile(userId, validated);
    
    if (!user) {
      return { success: false, error: "User not found" };
    }
    
    revalidatePath("/");
    
    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || undefined,
      },
    };
  } catch (error: any) {
    console.error("Failed to update profile:", error);
    return { success: false, error: error.message || "Failed to update profile" };
  }
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}) {
  try {
    const validated = createUserSchema.parse(data);
    const db = getDb();
    const usersRepo = new UsersRepository(db);
    
    const user = usersRepo.create(validated);
    
    revalidatePath("/");
    
    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || undefined,
      },
    };
  } catch (error: any) {
    console.error("Failed to create user:", error);
    return { success: false, error: error.message || "Failed to create user" };
  }
}

