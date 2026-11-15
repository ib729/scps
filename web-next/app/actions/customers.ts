"use server";

import { revalidatePath } from "next/cache";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  archiveCustomer,
  hasTransactions,
  searchCustomers,
  getCustomerByName,
} from "@/lib/repositories/customers";
import { createCustomerSchema } from "@/lib/models";
import { requireStaffContext } from "@/lib/auth-session";

export async function getCustomersAction() {
  try {
    await requireStaffContext();
    return { success: true, data: getAllCustomers() };
  } catch {
    return { success: false, error: "Failed to fetch customers" };
  }
}

export async function getCustomerByIdAction(id: number) {
  try {
    await requireStaffContext();
    const customer = getCustomerById(id);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    return { success: true, data: customer };
  } catch {
    return { success: false, error: "Failed to fetch customer" };
  }
}

export async function createCustomerAction(data: unknown) {
  try {
    await requireStaffContext();
    const validated = createCustomerSchema.parse(data);
    const customer = createCustomer(validated);
    revalidatePath("/customers");
    return { success: true, data: customer };
  } catch {
    return { success: false, error: "Failed to create customer" };
  }
}

export async function updateCustomerAction(id: number, data: unknown) {
  try {
    await requireStaffContext();
    const validated = createCustomerSchema.parse(data);
    updateCustomer(id, validated);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update customer" };
  }
}

export async function deleteCustomerAction(id: number) {
  try {
    await requireStaffContext();

    if (hasTransactions(id)) {
      archiveCustomer(id);
      revalidatePath("/customers");
      return { success: true, message: "Customer archived due to existing transactions." };
    }

    deleteCustomer(id);
    revalidatePath("/customers");
    return { success: true, message: "Customer deleted successfully." };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY"
    ) {
      // Fallback if hasTransactions check missed something or race condition
      try {
        archiveCustomer(id);
        revalidatePath("/customers");
        return { success: true, message: "Customer archived due to existing financial history." };
      } catch {
        return {
          success: false,
          error: "Cannot delete or archive customer with existing financial history.",
        };
      }
    }
    return { success: false, error: "Failed to delete customer" };
  }
}

export async function searchCustomersAction(query: string, limit: number = 10) {
  try {
    await requireStaffContext();
    return { success: true, data: searchCustomers(query, limit) };
  } catch {
    return { success: false, error: "Failed to search customers" };
  }
}

export async function getCustomerByNameAction(name: string) {
  try {
    await requireStaffContext();
    const customer = getCustomerByName(name);
    if (!customer) {
      return { success: true, data: null };
    }
    return { success: true, data: customer };
  } catch {
    return { success: false, error: "Failed to fetch customer by name" };
  }
}
