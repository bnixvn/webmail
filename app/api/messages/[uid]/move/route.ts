import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireSession } from "@/lib/api";
import { moveMessage } from "@/lib/mail/imap";

type Context = {
  params: Promise<{
    uid: string;
  }>;
};

const moveSchema = z.object({
  folder: z.string().min(1).default("INBOX"),
  destination: z.string().min(1)
});

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;
    const input = moveSchema.parse(await request.json());

    await moveMessage(session, input.folder, Number(uid), input.destination);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
