"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthContext } from "@/lib/auth-session";
import { toDbValue } from "@/lib/currency";
import {
  notifyWechatTopupRequestApproved,
  notifyWechatTopupRequestClaimed,
  notifyWechatTopupRequestRejected,
} from "@/lib/notifications";
import {
  approveWechatTopupRequest,
  createWechatTopupRequest,
  listWechatTopupRequests,
  markWechatTopupRequestClaimed,
  rejectWechatTopupRequest,
} from "@/lib/repositories/wechat-topup-requests";

const createWechatTopupRequestSchema = z.object({
  student_id: z.number().int().positive(),
  amount: z.number().positive(),
  internal_note: z.string().trim().max(500).optional(),
});

const reviewWechatTopupRequestSchema = z.object({
  request_id: z.number().int().positive(),
  review_note: z.string().trim().max(500).optional(),
});

export async function createWechatTopupRequestAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();
    const validated = createWechatTopupRequestSchema.parse(data);

    const request = createWechatTopupRequest({
      studentId: validated.student_id,
      requestedAmount: toDbValue(validated.amount),
      createdByUserId: user.id,
      createdByName: user.name,
      internalNote: validated.internal_note,
    });

    revalidatePath("/wcp");

    return { success: true, data: request };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create request",
    };
  }
}

export async function approveWechatTopupRequestAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();
    const validated = reviewWechatTopupRequestSchema.parse(data);

    const result = approveWechatTopupRequest({
      requestId: validated.request_id,
      reviewedByUserId: user.id,
      reviewedByName: user.name,
      reviewNote: validated.review_note,
    });

    try {
      await notifyWechatTopupRequestApproved(result.request);
    } catch (notificationError) {
      console.error("Failed to send WCP approval notification", notificationError);
    }

    revalidatePath("/wcp");
    revalidatePath("/topup");
    revalidatePath("/transactions");
    revalidatePath("/customers");
    revalidatePath(`/customers/${result.request.student_id}`);
    revalidatePath("/dashboard");

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to approve request",
    };
  }
}

export async function markWechatTopupRequestClaimedAction(data: unknown) {
  try {
    await requireAuthContext();
    const validated = reviewWechatTopupRequestSchema.parse(data);

    const request = markWechatTopupRequestClaimed(validated.request_id);

    try {
      await notifyWechatTopupRequestClaimed(request);
    } catch (notificationError) {
      console.error("Failed to send WCP claimed notification", notificationError);
    }

    revalidatePath("/wcp");

    return { success: true, data: request };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark request as paid",
    };
  }
}

export async function rejectWechatTopupRequestAction(data: unknown) {
  try {
    const { user } = await requireAuthContext();
    const validated = reviewWechatTopupRequestSchema.parse(data);

    const request = rejectWechatTopupRequest({
      requestId: validated.request_id,
      reviewedByUserId: user.id,
      reviewedByName: user.name,
      reviewNote: validated.review_note,
    });

    try {
      await notifyWechatTopupRequestRejected(request);
    } catch (notificationError) {
      console.error("Failed to send WCP rejection notification", notificationError);
    }

    revalidatePath("/wcp");

    return { success: true, data: request };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reject request",
    };
  }
}

export async function getWechatTopupRequestsAction(limit = 50) {
  try {
    await requireAuthContext();
    return { success: true, data: listWechatTopupRequests(limit) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load requests",
    };
  }
}
