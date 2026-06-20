import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { updateEvent, deleteEvent, listEvents } from "@/lib/dav/caldav";
import type { CalendarEvent } from "@/lib/dav/caldav";

type Context = {
  params: Promise<{ uid: string }>;
};

export async function PUT(request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;
    const body = await request.json();

    const events = await listEvents(session.email, session.password);
    const existing = events.find((e) => e.uid === uid);

    if (!existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const updated: CalendarEvent = {
      ...existing,
      summary: body.summary || body.title || existing.summary,
      description: body.description ?? existing.description,
      location: body.location ?? existing.location,
      dtstart: body.dtstart || body.start || existing.dtstart,
      dtend: body.dtend || body.end || existing.dtend,
      allDay: body.allDay ?? existing.allDay,
      recurrence: body.recurrence ?? existing.recurrence
    };

    const ok = await updateEvent(session.email, session.password, updated);
    return NextResponse.json({ ok, event: ok ? updated : null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await requireSession();
    const { uid } = await context.params;

    const events = await listEvents(session.email, session.password);
    const existing = events.find((e) => e.uid === uid);

    if (!existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const ok = await deleteEvent(session.email, session.password, existing);
    return NextResponse.json({ ok });
  } catch (error) {
    return jsonError(error);
  }
}
