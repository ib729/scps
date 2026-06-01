import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  approveWechatTopupRequest,
  rejectWechatTopupRequest,
} from "@/lib/repositories/wechat-topup-requests";
import {
  answerTelegramCallbackQuery,
  editTelegramMessageText,
  formatWechatTopupNotificationText,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: {
    message_id: number;
    chat: { id: number | string };
  };
};

type TelegramWebhookVerification =
  | { ok: true }
  | { ok: false; status: number; error: string };

function verifyTelegramWebhook(request: Request): TelegramWebhookVerification {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return {
      ok: false,
      status: 500,
      error: "TELEGRAM_WEBHOOK_SECRET is not configured",
    };
  }

  if (request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

function parseCallbackData(data: string | undefined) {
  if (!data) {
    return null;
  }

  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "wcp") {
    return null;
  }

  const requestId = Number.parseInt(parts[2] ?? "", 10);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return null;
  }

  const action = parts[1];
  if (action !== "approve" && action !== "reject") {
    return null;
  }

  return { action, requestId };
}

function isExpectedTelegramChat(chatId: number | string) {
  const expectedChatId = process.env.WCP_TELEGRAM_CHAT_ID?.trim();
  return !expectedChatId || String(chatId) === expectedChatId;
}

function getAllowedTelegramReviewerIds() {
  return new Set(
    (process.env.WCP_TELEGRAM_ALLOWED_USER_IDS || "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAllowedTelegramReviewer(user: TelegramUser | undefined): user is TelegramUser {
  if (!user || user.is_bot) {
    return false;
  }

  const allowedIds = getAllowedTelegramReviewerIds();
  return allowedIds.size === 0 || allowedIds.has(String(user.id));
}

function getTelegramReviewer(user: TelegramUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const displayName = fullName || user.username || `Telegram user ${user.id}`;
  const usernameSuffix = user.username ? ` (@${user.username})` : "";

  return {
    reviewedByUserId: `telegram:${user.id}`,
    reviewedByName: `${displayName}${usernameSuffix}`,
  };
}

async function answerCallbackSafely(params: {
  callbackQueryId: string;
  text: string;
  showAlert?: boolean;
}) {
  try {
    await answerTelegramCallbackQuery(params);
  } catch (error) {
    console.error("Failed to answer Telegram callback query", error);
  }
}

async function editCallbackMessageSafely(params: {
  callbackQuery: TelegramCallbackQuery;
  text: string;
}) {
  if (!params.callbackQuery.message) {
    return;
  }

  try {
    await editTelegramMessageText({
      chatId: params.callbackQuery.message.chat.id,
      messageId: params.callbackQuery.message.message_id,
      text: params.text,
    });
  } catch (error) {
    console.error("Failed to edit Telegram WCP message", error);
  }
}

export async function POST(request: Request) {
  const verification = verifyTelegramWebhook(request);
  if (!verification.ok) {
    return NextResponse.json(
      { success: false, error: verification.error },
      { status: verification.status },
    );
  }

  const update = (await request.json()) as {
    callback_query?: TelegramCallbackQuery;
  };

  const callbackQuery = update.callback_query;
  if (!callbackQuery) {
    return NextResponse.json({ success: true });
  }

  const parsed = parseCallbackData(callbackQuery.data);
  if (!parsed || !callbackQuery.message) {
    await answerCallbackSafely({
      callbackQueryId: callbackQuery.id,
      text: "Invalid WCP action",
      showAlert: true,
    });

    return NextResponse.json({ success: true });
  }

  if (!isExpectedTelegramChat(callbackQuery.message.chat.id)) {
    await answerCallbackSafely({
      callbackQueryId: callbackQuery.id,
      text: "This WCP action is not allowed from this chat",
      showAlert: true,
    });

    return NextResponse.json({ success: true });
  }

  if (!isAllowedTelegramReviewer(callbackQuery.from)) {
    await answerCallbackSafely({
      callbackQueryId: callbackQuery.id,
      text: "You are not allowed to review WCP requests",
      showAlert: true,
    });

    return NextResponse.json({ success: true });
  }

  const reviewer = getTelegramReviewer(callbackQuery.from);

  try {
    const result =
      parsed.action === "approve"
        ? approveWechatTopupRequest({
            requestId: parsed.requestId,
            ...reviewer,
          }).request
        : rejectWechatTopupRequest({
            requestId: parsed.requestId,
            ...reviewer,
          });

    revalidatePath("/wcp");
    if (parsed.action === "approve") {
      revalidatePath("/topup");
      revalidatePath("/transactions");
      revalidatePath("/customers");
      revalidatePath(`/customers/${result.student_id}`);
      revalidatePath("/dashboard");
    }

    await answerCallbackSafely({
      callbackQueryId: callbackQuery.id,
      text:
        parsed.action === "approve"
          ? "Request approved"
          : "Request rejected",
    });

    await editCallbackMessageSafely({
      callbackQuery,
      text: formatWechatTopupNotificationText(
        result,
        parsed.action === "approve"
          ? "WCP request approved"
          : "WCP request rejected",
      ),
    });
  } catch (error) {
    await answerCallbackSafely({
      callbackQueryId: callbackQuery.id,
      text: error instanceof Error ? error.message : "Action failed",
      showAlert: true,
    });
  }

  return NextResponse.json({ success: true });
}
