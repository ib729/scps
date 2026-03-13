import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getTransactionNoteHistory,
  getTransactionWithStudentById,
  updateTransactionDescription,
} from "@/lib/repositories/transactions";

function parseTransactionId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requireSession(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const transactionId = parseTransactionId(id);
  if (!transactionId) {
    return NextResponse.json({ success: false, error: "Invalid transaction id" }, { status: 400 });
  }

  const transaction = getTransactionWithStudentById(transactionId);
  if (!transaction) {
    return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      transaction,
      history: getTransactionNoteHistory(transactionId),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const transactionId = parseTransactionId(id);
  if (!transactionId) {
    return NextResponse.json({ success: false, error: "Invalid transaction id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { description?: string | null } | null;
  if (!body || !("description" in body)) {
    return NextResponse.json({ success: false, error: "Description is required" }, { status: 400 });
  }

  const updated = updateTransactionDescription({
    id: transactionId,
    description: body.description ?? null,
    editedBy: session.user.name ?? session.user.email ?? null,
  });

  if (!updated) {
    return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      transaction: updated,
      history: getTransactionNoteHistory(transactionId),
    },
  });
}
