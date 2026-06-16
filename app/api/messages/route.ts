import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { listMessages } from "@/lib/mail/imap";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const folder = url.searchParams.get("folder") || "INBOX";
    const limit = Number(url.searchParams.get("limit") || 40);
    const messages = await listMessages(session, folder, limit);

    return NextResponse.json({ messages });
  } catch (error) {
    return jsonError(error);
  }
}
