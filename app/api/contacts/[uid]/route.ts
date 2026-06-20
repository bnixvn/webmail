import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { updateContact, deleteContact, listContacts } from "@/lib/dav/carddav";
import type { Contact } from "@/lib/dav/carddav";

type Context = {
  params: Promise<{ uid: string }>;
};

export async function PUT(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;
    const body = await request.json();

    // Find existing contact to get etag/url
    const contacts = await listContacts(session.email, session.password);
    const existing = contacts.find((c) => c.uid === uid);

    if (!existing) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const updated: Contact = {
      ...existing,
      fn: body.fn || body.name || existing.fn,
      email: body.email || existing.email,
      phone: body.phone ?? existing.phone,
      organization: body.organization ?? existing.organization,
      title: body.title ?? existing.title,
      note: body.note ?? existing.note
    };

    const ok = await updateContact(session.email, session.password, updated);
    return NextResponse.json({ ok, contact: ok ? updated : null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;

    const contacts = await listContacts(session.email, session.password);
    const existing = contacts.find((c) => c.uid === uid);

    if (!existing) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const ok = await deleteContact(session.email, session.password, existing);
    return NextResponse.json({ ok });
  } catch (error) {
    return jsonError(error);
  }
}
