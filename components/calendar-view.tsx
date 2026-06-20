"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  Trash2,
  X
} from "lucide-react";

type CalendarEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: string;
  dtend: string;
  allDay: boolean;
  recurrence?: string;
  etag?: string;
  url?: string;
};

type EventDraft = {
  summary: string;
  description: string;
  location: string;
  dtstart: string;
  dtend: string;
  allDay: boolean;
};

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateInput(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function eventToDraft(e: CalendarEvent): EventDraft {
  return {
    summary: e.summary || "",
    description: e.description || "",
    location: e.location || "",
    dtstart: e.allDay ? toLocalDateInput(e.dtstart) : toLocalInput(e.dtstart),
    dtend: e.allDay ? toLocalDateInput(e.dtend) : toLocalInput(e.dtend),
    allDay: e.allDay
  };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EventDraft>({
    summary: "",
    description: "",
    location: "",
    dtstart: "",
    dtend: "",
    allDay: false
  });
  const [saving, setSaving] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [year, month]);

  async function loadEvents() {
    setLoading(true);
    setError("");
    try {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59);
      const res = await fetch(
        `/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load events");
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }

  function selectDay(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedEvent(null);
    setEditing(false);
    setMobileDetail(true);
  }

  function startNewEvent() {
    const startDt = `${selectedDate}T09:00`;
    const endDt = `${selectedDate}T10:00`;
    setSelectedEvent(null);
    setDraft({
      summary: "",
      description: "",
      location: "",
      dtstart: startDt,
      dtend: endDt,
      allDay: false
    });
    setEditing(true);
    setMobileDetail(true);
  }

  function startEdit(event: CalendarEvent) {
    setDraft(eventToDraft(event));
    setEditing(true);
  }

  async function saveEvent() {
    setSaving(true);
    setError("");
    try {
      const isEdit = !!selectedEvent;
      const url = isEdit ? `/api/calendar/${selectedEvent.uid}` : "/api/calendar";
      const method = isEdit ? "PUT" : "POST";

      const body: Record<string, unknown> = {
        summary: draft.summary,
        description: draft.description || undefined,
        location: draft.location || undefined,
        allDay: draft.allDay
      };

      if (draft.allDay) {
        body.dtstart = draft.dtstart;
        body.dtend = draft.dtend || draft.dtstart;
      } else {
        body.dtstart = new Date(draft.dtstart).toISOString();
        body.dtend = new Date(draft.dtend).toISOString();
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save event");

      await loadEvents();
      setEditing(false);
      if (data.event) setSelectedEvent(data.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    if (!confirm(`Delete "${event.summary}"?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/calendar/${event.uid}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete event");
      }
      setSelectedEvent(null);
      setMobileDetail(false);
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event");
    }
  }

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = [];

    // Previous month padding
    const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      days.push({
        day: d,
        dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        isCurrentMonth: false
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        isCurrentMonth: true
      });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 1 : month + 2;
      const y = month === 11 ? year + 1 : year;
      days.push({
        day: d,
        dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        isCurrentMonth: false
      });
    }

    return days;
  }, [year, month]);

  // Events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const dateKey = event.dtstart.slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(event);
    }
    return map;
  }, [events]);

  const dayEvents = eventsByDate.get(selectedDate) || [];

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex h-full w-full">
      {/* Calendar grid + day events */}
      <div className={`${mobileDetail ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 md:w-96 md:shrink-0`}>
        <header className="flex h-14 items-center gap-2 border-b border-slate-200 px-3 md:h-12">
          <h1 className="flex-1 text-base font-semibold text-slate-900">Calendar</h1>
          <button
            type="button"
            onClick={startNewEvent}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white hover:bg-blue-600"
            title="New event"
          >
            <Plus className="h-4 w-4" />
          </button>
        </header>

        {/* Month navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <button type="button" onClick={prevMonth} className="rounded-md p-1 hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-900">
            {MONTH_NAMES[month]} {year}
          </span>
          <button type="button" onClick={nextMonth} className="rounded-md p-1 hover:bg-slate-100">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {DAY_NAMES.map((day) => (
            <div key={day} className="py-2 text-center text-[11px] font-semibold uppercase text-slate-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map(({ day, dateStr, isCurrentMonth }) => {
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;
            const dayEvts = eventsByDate.get(dateStr) || [];

            return (
              <button
                type="button"
                key={dateStr}
                onClick={() => selectDay(dateStr)}
                className={`relative flex h-12 flex-col items-center justify-start pt-1 text-sm ${
                  isSelected
                    ? "bg-blue-100 text-blue-700"
                    : isToday
                    ? "font-bold text-blue-600"
                    : isCurrentMonth
                    ? "text-slate-900 hover:bg-slate-50"
                    : "text-slate-400"
                }`}
              >
                <span className="text-xs">{day}</span>
                {dayEvts.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5">
                    {dayEvts.slice(0, 3).map((_, i) => (
                      <span key={i} className="h-1 w-1 rounded-full bg-blue-500" />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Day events list */}
        <div className="mail-scroll flex-1 overflow-y-auto border-t border-slate-200">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            </div>
          ) : dayEvents.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No events on this day
            </div>
          ) : (
            dayEvents.map((event) => (
              <button
                type="button"
                key={event.uid}
                onClick={() => { setSelectedEvent(event); setEditing(false); setMobileDetail(true); }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                  selectedEvent?.uid === event.uid ? "bg-blue-50" : ""
                }`}
              >
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{event.summary}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3 w-3" />
                    {event.allDay ? "All day" : `${formatTime(event.dtstart)} – ${formatTime(event.dtend)}`}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      {event.location}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Event detail / edit */}
      <div className={`${mobileDetail ? "flex" : "hidden md:flex"} flex-1 flex-col bg-white`}>
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!selectedEvent && !editing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
            <Clock className="h-12 w-12" />
            <p className="text-sm">Select an event or create a new one</p>
          </div>
        ) : editing ? (
          /* Edit mode */
          <>
            <header className="flex h-14 items-center gap-2 border-b border-slate-200 px-3 md:h-12">
              <button
                type="button"
                onClick={() => { setEditing(false); if (!selectedEvent) setMobileDetail(false); }}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="flex-1 text-sm font-semibold text-slate-900">
                {selectedEvent ? "Edit Event" : "New Event"}
              </h2>
              <button
                type="button"
                onClick={saveEvent}
                disabled={saving || !draft.summary}
                className="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
            </header>
            <div className="mail-scroll flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-lg space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
                  <input
                    value={draft.summary}
                    onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Event title"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allDay"
                    checked={draft.allDay}
                    onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <label htmlFor="allDay" className="text-sm text-slate-700">All day</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Start</label>
                    <input
                      type={draft.allDay ? "date" : "datetime-local"}
                      value={draft.dtstart}
                      onChange={(e) => setDraft({ ...draft, dtstart: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">End</label>
                    <input
                      type={draft.allDay ? "date" : "datetime-local"}
                      value={draft.dtend}
                      onChange={(e) => setDraft({ ...draft, dtend: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Location</label>
                  <input
                    value={draft.location}
                    onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Location"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    rows={4}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Event description"
                  />
                </div>
              </div>
            </div>
          </>
        ) : selectedEvent ? (
          /* Detail view */
          <>
            <header className="flex h-14 items-center gap-2 border-b border-slate-200 px-3 md:h-12">
              <button
                type="button"
                onClick={() => { setSelectedEvent(null); setMobileDetail(false); }}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 md:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => startEdit(selectedEvent)}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
                title="Edit"
              >
                <PencilLine className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteEvent(selectedEvent)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </header>
            <div className="mail-scroll flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-lg">
                <h2 className="mb-4 text-xl font-semibold text-slate-900">{selectedEvent.summary}</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <div>{formatDate(selectedEvent.dtstart)}</div>
                      <div>
                        {selectedEvent.allDay
                          ? "All day"
                          : `${formatTime(selectedEvent.dtstart)} – ${formatTime(selectedEvent.dtend)}`}
                      </div>
                    </div>
                  </div>
                  {selectedEvent.location && (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                      {selectedEvent.location}
                    </div>
                  )}
                  {selectedEvent.description && (
                    <div className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm text-slate-700">
                      {selectedEvent.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
