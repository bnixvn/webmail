"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Trash2,
  User,
  X
} from "lucide-react";

type Contact = {
  uid: string;
  fn: string;
  email: string;
  phone?: string;
  organization?: string;
  title?: string;
  note?: string;
  etag?: string;
  url?: string;
};

type ContactDraft = {
  fn: string;
  email: string;
  phone: string;
  organization: string;
  title: string;
  note: string;
};

const emptyDraft: ContactDraft = {
  fn: "",
  email: "",
  phone: "",
  organization: "",
  title: "",
  note: ""
};

function contactToDraft(c: Contact): ContactDraft {
  return {
    fn: c.fn || "",
    email: c.email || "",
    phone: c.phone || "",
    organization: c.organization || "",
    title: c.title || "",
    note: c.note || ""
  };
}

export function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load contacts");
      setContacts(data.contacts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  function selectContact(contact: Contact) {
    setSelected(contact);
    setEditing(false);
    setMobileDetail(true);
  }

  function startNewContact() {
    setSelected(null);
    setDraft(emptyDraft);
    setEditing(true);
    setMobileDetail(true);
  }

  function startEdit(contact: Contact) {
    setDraft(contactToDraft(contact));
    setEditing(true);
  }

  async function saveContact() {
    setSaving(true);
    setError("");
    try {
      const isEdit = !!selected;
      const url = isEdit ? `/api/contacts/${selected.uid}` : "/api/contacts";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save contact");

      await loadContacts();
      if (data.contact) {
        setSelected(data.contact);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(contact: Contact) {
    if (!confirm(`Delete ${contact.fn}?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/contacts/${contact.uid}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete contact");
      }
      setSelected(null);
      setMobileDetail(false);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact");
    }
  }

  const filtered = contacts.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.fn.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.organization || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full w-full">
      {/* Contact list */}
      <div className={`${mobileDetail ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 md:w-80 md:shrink-0`}>
        <header className="flex h-14 items-center gap-2 border-b border-slate-200 px-3 md:h-12">
          <h1 className="flex-1 text-base font-semibold text-slate-900">Contacts</h1>
          <button
            type="button"
            onClick={startNewContact}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-white hover:bg-blue-600"
            title="New contact"
          >
            <Plus className="h-4 w-4" />
          </button>
        </header>
        <div className="px-3 py-2">
          <label className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-slate-500">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts..."
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
            />
          </label>
        </div>
        <div className="mail-scroll flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              {query ? "No contacts found" : "No contacts yet"}
            </div>
          ) : (
            filtered.map((contact) => (
              <button
                type="button"
                key={contact.uid}
                onClick={() => selectContact(contact)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                  selected?.uid === contact.uid ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                  {(contact.fn || contact.email || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{contact.fn || "No name"}</div>
                  <div className="truncate text-xs text-slate-500">{contact.email}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Contact detail / edit */}
      <div className={`${mobileDetail ? "flex" : "hidden md:flex"} flex-1 flex-col bg-white`}>
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!selected && !editing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
            <User className="h-12 w-12" />
            <p className="text-sm">Select a contact or create a new one</p>
          </div>
        ) : editing ? (
          /* Edit mode */
          <>
            <header className="flex h-14 items-center gap-2 border-b border-slate-200 px-3 md:h-12">
              <button
                type="button"
                onClick={() => { setEditing(false); if (!selected) setMobileDetail(false); }}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="flex-1 text-sm font-semibold text-slate-900">
                {selected ? "Edit Contact" : "New Contact"}
              </h2>
              <button
                type="button"
                onClick={saveContact}
                disabled={saving || !draft.fn}
                className="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
            </header>
            <div className="mail-scroll flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-lg space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Full Name *</label>
                  <input
                    value={draft.fn}
                    onChange={(e) => setDraft({ ...draft, fn: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Email *</label>
                  <input
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                  <input
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="+1 234 567 890"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Organization</label>
                  <input
                    value={draft.organization}
                    onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Note</label>
                  <textarea
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Notes about this contact"
                  />
                </div>
              </div>
            </div>
          </>
        ) : selected ? (
          /* Detail view */
          <>
            <header className="flex h-14 items-center gap-2 border-b border-slate-200 px-3 md:h-12">
              <button
                type="button"
                onClick={() => { setSelected(null); setMobileDetail(false); }}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 md:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => startEdit(selected)}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
                title="Edit"
              >
                <PencilLine className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteContact(selected)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </header>
            <div className="mail-scroll flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-lg">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-600">
                    {(selected.fn || selected.email || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{selected.fn || "No name"}</h2>
                    {selected.title && <p className="text-sm text-slate-500">{selected.title}</p>}
                  </div>
                </div>
                <div className="space-y-4">
                  {selected.email && (
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500">Email</div>
                      <a href={`mailto:${selected.email}`} className="text-sm text-blue-600 hover:underline">
                        {selected.email}
                      </a>
                    </div>
                  )}
                  {selected.phone && (
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500">Phone</div>
                      <a href={`tel:${selected.phone}`} className="text-sm text-blue-600 hover:underline">
                        {selected.phone}
                      </a>
                    </div>
                  )}
                  {selected.organization && (
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500">Organization</div>
                      <p className="text-sm text-slate-900">{selected.organization}</p>
                    </div>
                  )}
                  {selected.note && (
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500">Note</div>
                      <p className="whitespace-pre-wrap text-sm text-slate-900">{selected.note}</p>
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
