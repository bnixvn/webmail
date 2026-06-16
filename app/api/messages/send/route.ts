import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { sendMail, sendMailSchema } from "@/lib/mail/smtp";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = sendMailSchema.parse(await request.json());
    const result = await sendMail(session, input);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
