import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { listEvents, createEvent } from "@/lib/dav/caldav";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");

    const start = startParam ? new Date(startParam) : undefined;
    const end = endParam ? new Date(endParam) : undefined;

    const events = await listEvents(session.email, session.password, start, end);
    return NextResponse.json({ events });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();

    const event = await createEvent(session.email, session.password, {
      summary: body.summary || body.title || "",
      description: body.description || undefined,
      location: body.location || undefined,
      dtstart: body.dtstart || body.start || "",
      dtend: body.dtend || body.end || "",
      allDay: body.allDay || false,
      recurrence: body.recurrence || undefined
    });

    if (!event) {
      return NextResponse.json({ error: "Failed to create event." }, { status: 500 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    return jsonError(error);
  }
}
