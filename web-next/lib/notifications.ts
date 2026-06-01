import { formatCurrency } from "./currency";
import type { WechatTopupRequestWithStudent } from "./models";

type TelegramReplyMarkup = {
  inline_keyboard: Array<
    Array<{
      text: string;
      callback_data?: string;
      url?: string;
    }>
  >;
};

function getTelegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

function getTelegramNotificationChatId() {
  return process.env.WCP_TELEGRAM_CHAT_ID?.trim() || null;
}

async function telegramApiRequest(method: string, payload: Record<string, unknown>) {
  const botToken = getTelegramBotToken();
  if (!botToken) {
    throw new Error("Telegram bot token is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const body = (await response.json().catch(() => null)) as
    | { description?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      `Telegram API ${method} failed with ${response.status}${body?.description ? `: ${body.description}` : ""}`,
    );
  }

  return body;
}

export function buildWechatTopupReviewKeyboard(requestId: number): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `wcp:approve:${requestId}` },
        { text: "❌ Reject", callback_data: `wcp:reject:${requestId}` },
      ],
    ],
  };
}

function formatRequestSummary(request: WechatTopupRequestWithStudent) {
  const lines = [
    `Request #${request.id}`,
    `Customer: ${request.student_name}`,
    `Status: ${request.status}`,
    `Base: ¥${formatCurrency(request.requested_amount)}`,
    `Payable: ¥${formatCurrency(request.payable_amount)}`,
    `Created by: ${request.created_by_name || request.created_by_user_id}`,
    `Created: ${request.created_at} UTC`,
    `Expires: ${request.expires_at} UTC`,
  ];

  if (request.claimed_at) {
    lines.push(`Marked paid: ${request.claimed_at} UTC`);
  }

  if (request.internal_note) {
    lines.push(`Internal note: ${request.internal_note}`);
  }

  if (request.reviewed_by_name) {
    lines.push(`Reviewed by: ${request.reviewed_by_name}`);
  }

  if (request.reviewed_at) {
    lines.push(`Reviewed: ${request.reviewed_at} UTC`);
  }

  if (request.review_note) {
    lines.push(`Review note: ${request.review_note}`);
  }

  if (request.approved_transaction_id) {
    lines.push(`Transaction ID: ${request.approved_transaction_id}`);
  }

  return lines;
}

export function formatWechatTopupNotificationText(
  request: WechatTopupRequestWithStudent,
  title: string,
) {
  return [title, ...formatRequestSummary(request)].join("\n");
}

export async function sendTelegramMessage(
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const chatId = getTelegramNotificationChatId();
  const botToken = getTelegramBotToken();

  if (!chatId || !botToken) {
    return false;
  }

  await telegramApiRequest("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  return true;
}

export async function editTelegramMessageText(params: {
  chatId: number | string;
  messageId: number;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
}) {
  await telegramApiRequest("editMessageText", {
    chat_id: params.chatId,
    message_id: params.messageId,
    text: params.text,
    ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
  });
}

export async function answerTelegramCallbackQuery(params: {
  callbackQueryId: string;
  text: string;
  showAlert?: boolean;
}) {
  await telegramApiRequest("answerCallbackQuery", {
    callback_query_id: params.callbackQueryId,
    text: params.text,
    show_alert: params.showAlert ?? false,
  });
}

export async function notifyWechatTopupRequestCreated(
  request: WechatTopupRequestWithStudent,
) {
  await sendTelegramMessage(
    formatWechatTopupNotificationText(request, "New WCP request"),
  );
}

export async function notifyWechatTopupRequestApproved(
  request: WechatTopupRequestWithStudent,
) {
  await sendTelegramMessage(
    formatWechatTopupNotificationText(request, "WCP request approved"),
  );
}

export async function notifyWechatTopupRequestClaimed(
  request: WechatTopupRequestWithStudent,
) {
  await sendTelegramMessage(
    formatWechatTopupNotificationText(request, "WCP request marked paid"),
    buildWechatTopupReviewKeyboard(request.id),
  );
}

export async function notifyWechatTopupRequestRejected(
  request: WechatTopupRequestWithStudent,
) {
  await sendTelegramMessage(
    formatWechatTopupNotificationText(request, "WCP request rejected"),
  );
}
