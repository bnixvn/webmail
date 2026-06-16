import { NextResponse } from "next/server";
import { ApiError, jsonError, requireSession } from "@/lib/api";
import { deleteMessage, getMessage } from "@/lib/mail/imap";

type Context = {
  params: Promise<{
    uid: string;
  }>;
};

function getFolder(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("folder") || "INBOX";
}

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;
    const message = await getMessage(session, getFolder(request), Number(uid));

    if (!message) {
      throw new ApiError(404, "Message not found.");
    }

    return NextResponse.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;

    await deleteMessage(session, getFolder(request), Number(uid));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
