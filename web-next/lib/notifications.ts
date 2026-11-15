import { formatCurrency } from "./currency";
import type { WechatTopupRequestWithCustomer } from "./models";


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
      signal: AbortSignal.timeout(5000),
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


function formatRequestSummary(request: WechatTopupRequestWithCustomer) {
  const lines = [
    `Request #${request.id}`,
    `Customer: ${request.customer_name}`,
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
  request: WechatTopupRequestWithCustomer,
  title: string,
) {
  return [title, ...formatRequestSummary(request)].join("\n");
}

export async function sendTelegramMessage(text: string) {
  const chatId = getTelegramNotificationChatId();
  const botToken = getTelegramBotToken();

  if (!chatId || !botToken) {
    return false;
  }

  await telegramApiRequest("sendMessage", {
    chat_id: chatId,
    text,
  });

  return true;
}


export async function notifyWechatTopupRequestApproved(
  request: WechatTopupRequestWithCustomer,
) {
  await sendTelegramMessage(
    formatWechatTopupNotificationText(request, "WCP request approved"),
  );
}

export async function notifyWechatTopupRequestClaimed(
  request: WechatTopupRequestWithCustomer,
) {
  const reviewUrl = new URL("/admin/payments", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").toString();
  await sendTelegramMessage(
    `${formatWechatTopupNotificationText(request, "WCP request marked paid")}\nReview in SCPS: ${reviewUrl}`,
  );
}

export async function notifyWechatTopupRequestRejected(
  request: WechatTopupRequestWithCustomer,
) {
  await sendTelegramMessage(
    formatWechatTopupNotificationText(request, "WCP request rejected"),
  );
}
