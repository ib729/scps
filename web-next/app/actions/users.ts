"use server";

import { getDb } from "@/lib/db";
import { UsersRepository } from "@/lib/repositories";
import {
  createUserSchema,
  updateUserProfileSchema,
  updateUserPasswordSchema,
} from "@/lib/models";
import { revalidatePath } from "next/cache";

export async function getCurrentUser() {
  try {
    const db = getDb();
    const usersRepo = new UsersRepository(db);
    
    // For now, return the first user or create a default one
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
    
    // No users exist, create a default one
    const defaultUser = usersRepo.create({
      name: "Ivan Belousov",
      email: "hello@ivanbelousov.com",
      password: "password123", // Default password
    });
    
    return {
      success: true,
      user: {
        id: defaultUser.id,
        name: defaultUser.name,
        email: defaultUser.email,
        avatar: defaultUser.avatar || undefined,
      },
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

export async function updateUserPassword(
  userId: number,
  data: { current_password: string; new_password: string }
) {
  try {
    const validated = updateUserPasswordSchema.parse(data);
    const db = getDb();
    const usersRepo = new UsersRepository(db);
    
    const success = usersRepo.updatePassword(userId, validated);
    
    if (!success) {
      return { success: false, error: "Current password is incorrect" };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update password:", error);
    return { success: false, error: error.message || "Failed to update password" };
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

