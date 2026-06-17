import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { readSignatureSettings, writeSignatureSettings } from "@/lib/settings/signature";

export async function GET() {
  try {
    const session = await requireSession();
    const settings = await readSignatureSettings(session.email);

    return NextResponse.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    const settings = await writeSignatureSettings(session.email, await request.json());

    return NextResponse.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}
