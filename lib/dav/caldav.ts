import { DAVClient } from "tsdav";
import { getDavConfig, getCalendarUrl, type DavConfig } from "./config";

export type CalendarEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: string;       // ISO datetime
  dtend: string;         // ISO datetime
  allDay: boolean;
  recurrence?: string;   // RRULE string
  etag?: string;
  url?: string;
};

function createClient(config: DavConfig): DAVClient {
  return new DAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password
    },
    authMethod: "Basic",
    defaultAccountType: "caldav"
  });
}

function parseIcsDate(value: string, params?: Record<string, string>): { date: string; allDay: boolean } {
  const allDay = params?.VALUE === "DATE" || (!value.includes("T") && value.length === 8);

  if (allDay && value.length === 8) {
    return {
      date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
      allDay: true
    };
  }

  // Parse datetime: 20240115T093000Z or 20240115T093000
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (match) {
    const [, y, m, d, h, min, s] = match;
    const isUtc = value.endsWith("Z");
    const dateStr = isUtc
      ? `${y}-${m}-${d}T${h}:${min}:${s}Z`
      : `${y}-${m}-${d}T${h}:${min}:${s}`;
    return { date: dateStr, allDay: false };
  }

  return { date: value, allDay: false };
}

function parseIcs(ics: string): Partial<CalendarEvent> {
  const event: Partial<CalendarEvent> = {};
  const lines = ics.split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trim();

    // Extract params from key (e.g., DTSTART;VALUE=DATE:20240115)
    const [propName, ...paramParts] = key.split(";");
    const params: Record<string, string> = {};
    for (const part of paramParts) {
      const [pk, pv] = part.split("=");
      if (pk && pv) params[pk] = pv;
    }

    switch (propName) {
      case "UID":
        event.uid = value;
        break;
      case "SUMMARY":
        event.summary = value;
        break;
      case "DESCRIPTION":
        event.description = value.replace(/\\n/g, "\n").replace(/\\,/g, ",");
        break;
      case "LOCATION":
        event.location = value;
        break;
      case "DTSTART": {
        const { date, allDay } = parseIcsDate(value, params);
        event.dtstart = date;
        event.allDay = allDay;
        break;
      }
      case "DTEND": {
        const { date } = parseIcsDate(value, params);
        event.dtend = date;
        break;
      }
      case "RRULE":
        event.recurrence = value;
        break;
    }
  }

  return event;
}

function formatIcsDate(isoDate: string, allDay: boolean): string {
  if (allDay) {
    return isoDate.replace(/-/g, "").slice(0, 8);
  }

  const d = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}Z`;
}

function buildIcs(event: Partial<CalendarEvent>, uid?: string): string {
  const uidStr = uid || event.uid || crypto.randomUUID();
  const now = formatIcsDate(new Date().toISOString(), false);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BNIX Webmail//EN",
    "BEGIN:VEVENT",
    `UID:${uidStr}`,
    `DTSTAMP:${now}`,
  ];

  if (event.dtstart) {
    lines.push(`DTSTART${event.allDay ? ";VALUE=DATE" : ""}:${formatIcsDate(event.dtstart, event.allDay || false)}`);
  }
  if (event.dtend) {
    lines.push(`DTEND${event.allDay ? ";VALUE=DATE" : ""}:${formatIcsDate(event.dtend, event.allDay || false)}`);
  }

  lines.push(`SUMMARY:${event.summary || ""}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${event.description.replace(/\n/g, "\\n").replace(/,/g, "\\,")}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${event.location}`);
  }
  if (event.recurrence) {
    lines.push(`RRULE:${event.recurrence}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export async function listEvents(
  email: string,
  password: string,
  start?: Date,
  end?: Date
): Promise<CalendarEvent[]> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);
  const calendarUrl = getCalendarUrl(config);

  try {
    const calendars = await client.fetchCalendars();
    const calendar = calendars.find((cal) => cal.url.includes(email)) || calendars[0];

    if (!calendar) {
      return [];
    }

    const objects = await client.fetchCalendarObjects({
      calendar,
      timeRange: start && end
        ? { start: start.toISOString(), end: end.toISOString() }
        : undefined
    });

    return objects
      .map((obj) => {
        const parsed = parseIcs(obj.data || "");
        return {
          uid: parsed.uid || "",
          summary: parsed.summary || "(No title)",
          description: parsed.description,
          location: parsed.location,
          dtstart: parsed.dtstart || "",
          dtend: parsed.dtend || "",
          allDay: parsed.allDay || false,
          recurrence: parsed.recurrence,
          etag: obj.etag || undefined,
          url: obj.url || undefined
        };
      })
      .filter((e) => e.uid && e.dtstart)
      .sort((a, b) => a.dtstart.localeCompare(b.dtstart));
  } catch (error) {
    console.error("CalDAV list error:", error);
    return [];
  }
}

export async function createEvent(
  email: string,
  password: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent | null> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);
  const calendarUrl = getCalendarUrl(config);
  const uid = event.uid || crypto.randomUUID();
  const ics = buildIcs(event, uid);

  try {
    const calendars = await client.fetchCalendars();
    const calendar = calendars.find((cal) => cal.url.includes(email)) || calendars[0];

    if (!calendar) {
      throw new Error("No calendar found");
    }

    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString: ics
    });

    return {
      uid,
      summary: event.summary || "",
      description: event.description,
      location: event.location,
      dtstart: event.dtstart || "",
      dtend: event.dtend || "",
      allDay: event.allDay || false,
      recurrence: event.recurrence
    };
  } catch (error) {
    console.error("CalDAV create error:", error);
    return null;
  }
}

export async function updateEvent(
  email: string,
  password: string,
  event: CalendarEvent
): Promise<boolean> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);
  const ics = buildIcs(event, event.uid);

  try {
    await client.updateCalendarObject({
      calendarObject: {
        url: event.url || `${getCalendarUrl(config)}/${event.uid}.ics`,
        data: ics,
        etag: event.etag || ""
      }
    });
    return true;
  } catch (error) {
    console.error("CalDAV update error:", error);
    return false;
  }
}

export async function deleteEvent(
  email: string,
  password: string,
  event: CalendarEvent
): Promise<boolean> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);

  try {
    await client.deleteCalendarObject({
      calendarObject: {
        url: event.url || `${getCalendarUrl(config)}/${event.uid}.ics`,
        etag: event.etag || ""
      }
    });
    return true;
  } catch (error) {
    console.error("CalDAV delete error:", error);
    return false;
  }
}
