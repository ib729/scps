"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireCustomerContext } from "@/lib/auth-session";
import { notifyWechatTopupRequestApproved, notifyWechatTopupRequestClaimed, notifyWechatTopupRequestRejected } from "@/lib/notifications";
import { approveWechatTopupRequest, createWechatTopupRequest, getWechatTopupRequestById, listWechatTopupRequests, markWechatTopupRequestClaimed, parseWechatTopupAmount, rejectWechatTopupRequest, toCustomerPaymentRequest } from "@/lib/repositories/wechat-topup-requests";

const requestSchema = z.object({ request_id: z.number().int().positive() }).strict();
const reviewSchema = requestSchema.extend({ review_note: z.string().trim().max(500).optional() });

export async function createWechatTopupRequestAction(data: unknown) {
  try {
    const { user, customerId } = await requireCustomerContext();
    const input = z.object({ amount: z.string() }).strict().parse(data);
    const request = createWechatTopupRequest({ customerId, requestedAmount: parseWechatTopupAmount(input.amount), createdByUserId: user.id, createdByName: user.name });
    revalidatePath("/customer"); revalidatePath("/admin/payments");
    return { success: true, data: toCustomerPaymentRequest(request) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create request" };
  }
}

export async function markWechatTopupRequestClaimedAction(data: unknown) {
  try {
    const { customerId } = await requireCustomerContext();
    const input = requestSchema.parse(data);
    const owned = getWechatTopupRequestById(input.request_id);
    if (!owned || owned.customer_id !== customerId) throw new Error("Request not found");
    const { request, newlyClaimed } = markWechatTopupRequestClaimed(input.request_id);
    revalidatePath("/customer"); revalidatePath("/admin/payments");
    if (newlyClaimed) {
      try { await notifyWechatTopupRequestClaimed(request); }
      catch (error) { console.error("Failed to send optional WCP claim notification", error); }
    }
    return { success: true, data: toCustomerPaymentRequest(request) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to mark request as paid" };
  }
}

export async function approveWechatTopupRequestAction(data: unknown) {
  try {
    const { user } = await requireRole("admin");
    const input = reviewSchema.extend({ receipt_confirmed: z.literal(true) }).parse(data);
    const result = approveWechatTopupRequest({ requestId: input.request_id, reviewedByUserId: user.id, reviewedByName: user.name, reviewNote: input.review_note });
    for (const path of ["/customer", "/admin/payments", "/admin/topup", "/admin/transactions", "/admin/customers", `/admin/customers/${result.request.customer_id}`, "/admin"]) revalidatePath(path);
    try { await notifyWechatTopupRequestApproved(result.request); }
    catch (error) { console.error("Failed to send optional WCP approval notification", error); }
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to approve request" };
  }
}

export async function rejectWechatTopupRequestAction(data: unknown) {
  try {
    const { user } = await requireRole("admin");
    const input = reviewSchema.parse(data);
    const request = rejectWechatTopupRequest({ requestId: input.request_id, reviewedByUserId: user.id, reviewedByName: user.name, reviewNote: input.review_note });
    revalidatePath("/customer"); revalidatePath("/admin/payments");
    try { await notifyWechatTopupRequestRejected(request); }
    catch (error) { console.error("Failed to send optional WCP rejection notification", error); }
    return { success: true, data: request };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to reject request" };
  }
}

export async function getWechatTopupRequestsAction() {
  try {
    await requireRole("admin");
    return { success: true, data: { pending: listWechatTopupRequests({ pendingOnly: true }), recent: listWechatTopupRequests() } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to list requests" };
  }
}
