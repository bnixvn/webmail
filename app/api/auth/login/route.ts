import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api";
import { verifyLogin } from "@/lib/mail/imap";
import { setSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(true)
});

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const session = {
      email: input.email.toLowerCase().trim(),
      password: input.password,
      createdAt: Date.now()
    };

    await verifyLogin(session);
    await setSession(session, { persistent: input.remember });

    return NextResponse.json({
      email: session.email,
      domain: session.email.split("@")[1]
    });
  } catch (error) {
    return jsonError(error);
  }
}
