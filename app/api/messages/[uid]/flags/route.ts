import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireSession } from "@/lib/api";
import { setMessageFlag } from "@/lib/mail/imap";

type Context = {
  params: Promise<{
    uid: string;
  }>;
};

const flagSchema = z.object({
  folder: z.string().min(1).default("INBOX"),
  flag: z.enum(["\\Seen", "\\Flagged"]),
  enabled: z.boolean()
});

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;
    const input = flagSchema.parse(await request.json());

    await setMessageFlag(session, input.folder, Number(uid), input.flag, input.enabled);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
