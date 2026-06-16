import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireSession } from "@/lib/api";
import { createMailbox, listMailboxes } from "@/lib/mail/imap";

const createMailboxSchema = z.object({
  path: z.string().trim().min(1).max(255)
});

export async function GET() {
  try {
    const session = await requireSession();
    const mailboxes = await listMailboxes(session);

    return NextResponse.json({ mailboxes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = createMailboxSchema.parse(await request.json());
    const result = await createMailbox(session, input.path);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
