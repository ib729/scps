import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

const handler = toNextJsHandler(auth);

function isBlockedSignupRequest(request: Request) {
  const pathname = new URL(request.url).pathname;
  return pathname.endsWith("/sign-up/email");
}

export async function GET(request: Request) {
  return handler.GET(request);
}

export async function POST(request: Request) {
  if (isBlockedSignupRequest(request)) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }

  return handler.POST(request);
}
