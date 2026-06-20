import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { listContacts, createContact } from "@/lib/dav/carddav";

export async function GET() {
  try {
    const session = await requireSession();
    const contacts = await listContacts(session.email, session.password);
    return NextResponse.json({ contacts });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();

    const contact = await createContact(session.email, session.password, {
      fn: body.fn || body.name || "",
      email: body.email || "",
      phone: body.phone || undefined,
      organization: body.organization || undefined,
      title: body.title || undefined,
      note: body.note || undefined
    });

    if (!contact) {
      return NextResponse.json({ error: "Failed to create contact." }, { status: 500 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    return jsonError(error);
  }
}
