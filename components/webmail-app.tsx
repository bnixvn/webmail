"use client";

import {
  Archive,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronLeft,
  Circle,
  Code2,
  FilePenLine,
  Folder,
  FolderPlus,
  Forward,
  Inbox,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  Minimize2,
  MoreVertical,
  Paperclip,
  PencilLine,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Underline,
  X
} from "lucide-react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Account = {
  email: string;
  domain: string;
};

type Mailbox = {
  path: string;
  name: string;
  specialUse?: string;
  total: number;
  unseen: number;
  depth: number;
};

type Address = {
  name?: string;
  address?: string;
};

type Contact = {
  name: string;
  email: string;
};

type MessageSummary = {
  uid: number;
  subject: string;
  from: Address[];
  to: Address[];
  date?: string;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  snippet: string;
};

type MessageDetail = MessageSummary & {
  cc: Address[];
  bcc: Address[];
  html?: string;
  text?: string;
  attachments: Array<{
    filename?: string;
    contentType?: string;
    size?: number;
    cid?: string;
  }>;
};

type AttachmentDraft = {
  filename: string;
  contentType?: string;
  contentBase64: string;
};

type ComposeDraft = {
  fromName?: string;
  replyTo?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  html: string;
  attachments: AttachmentDraft[];
};

type SignatureSettings = {
  displayName: string;
  email: string;
  organization: string;
  replyTo: string;
  bcc: string;
  defaultEnabled: boolean;
  html: string;
  text: string;
};

type AvatarSources = {
  bimiUrl: string | null;
  gravatarUrl: string;
};

const appName = process.env.NEXT_PUBLIC_WEBMAIL_NAME || "BNIX WEBMAIL";
const maxAttachmentMb = Number(process.env.NEXT_PUBLIC_MAX_ATTACHMENT_MB || 10);
const avatarSourcesCache = new Map<string, AvatarSources>();
const avatarSourcesPending = new Map<string, Promise<AvatarSources>>();

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed.");
  }

  return response.json();
}

function displayName(addresses: Address[]) {
  const first = addresses[0];
  return first?.name || first?.address || "Unknown";
}

function displayEmail(addresses: Address[]) {
  return addresses[0]?.address || "";
}

function initials(value: string) {
  const parts = value
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);

  if (!parts.length) {
    return "??";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizeEmailKey(email?: string) {
  return email?.trim().toLowerCase() || "";
}

function formatTime(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    return `${Math.max(1, Math.round(diff / minute))}m ago`;
  }

  if (diff < day) {
    return `${Math.round(diff / hour)}h ago`;
  }

  if (diff < 7 * day) {
    return `${Math.round(diff / day)}d ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function fullDate(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function useAvatarSources(email?: string) {
  const normalizedEmail = useMemo(() => normalizeEmailKey(email), [email]);
  const [sources, setSources] = useState<AvatarSources | null>(() =>
    normalizedEmail ? avatarSourcesCache.get(normalizedEmail) || null : null
  );

  useEffect(() => {
    if (!normalizedEmail) {
      setSources(null);
      return;
    }

    const cached = avatarSourcesCache.get(normalizedEmail);

    if (cached) {
      setSources(cached);
      return;
    }

    setSources(null);

    let active = true;
    let pending = avatarSourcesPending.get(normalizedEmail);

    if (!pending) {
      pending = api<AvatarSources>(`/api/avatar?email=${encodeURIComponent(normalizedEmail)}`)
        .then((payload) => {
          avatarSourcesCache.set(normalizedEmail, payload);
          return payload;
        })
        .finally(() => {
          avatarSourcesPending.delete(normalizedEmail);
        });
      avatarSourcesPending.set(normalizedEmail, pending);
    }

    pending
      .then((payload) => {
        if (active) {
          setSources(payload);
        }
      })
      .catch(() => {
        if (active) {
          setSources(null);
        }
      });

    return () => {
      active = false;
    };
  }, [normalizedEmail]);

  return sources;
}

function AvatarBadge({
  email,
  name,
  sizeClass,
  fallbackClassName,
  textClassName
}: {
  email?: string;
  name?: string;
  sizeClass: string;
  fallbackClassName: string;
  textClassName: string;
}) {
  const normalizedEmail = useMemo(() => normalizeEmailKey(email), [email]);
  const sources = useAvatarSources(normalizedEmail);
  const [stage, setStage] = useState<"initials" | "bimi" | "gravatar">("initials");
  const label = name || email || "Avatar";
  const fallback = initials(name || email || "");

  useEffect(() => {
    if (sources?.bimiUrl) {
      setStage("bimi");
      return;
    }

    if (sources?.gravatarUrl) {
      setStage("gravatar");
      return;
    }

    setStage("initials");
  }, [normalizedEmail, sources?.bimiUrl, sources?.gravatarUrl]);

  const wrapperClassName = `flex shrink-0 items-center justify-center overflow-hidden rounded-full ${
    stage === "initials" ? fallbackClassName : "bg-slate-100"
  } ${sizeClass}`;

  if (stage === "bimi" && sources?.bimiUrl) {
    return (
      <div className={wrapperClassName} title={label}>
        <img
          src={sources.bimiUrl}
          alt={label}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setStage(sources.gravatarUrl ? "gravatar" : "initials")}
        />
      </div>
    );
  }

  if (stage === "gravatar" && sources?.gravatarUrl) {
    return (
      <div className={wrapperClassName} title={label}>
        <img
          src={sources.gravatarUrl}
          alt={label}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setStage("initials")}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClassName} title={label}>
      <span className={textClassName}>{fallback || "?"}</span>
    </div>
  );
}

function emptyCompose(): ComposeDraft {
  return {
    fromName: "",
    replyTo: "",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    text: "",
    html: "",
    attachments: []
  };
}

function emptySignature(email = ""): SignatureSettings {
  return {
    displayName: "",
    email,
    organization: "",
    replyTo: "",
    bcc: "",
    defaultEnabled: true,
    html: "",
    text: ""
  };
}

function quoteText(message: MessageDetail) {
  const author = displayName(message.from);
  const date = fullDate(message.date);
  const body = message.text || message.snippet || "";

  return `\n\nOn ${date}, ${author} wrote:\n${body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}`;
}

function textToHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function htmlToText(value: string) {
  if (typeof document === "undefined") {
    return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  }

  const container = document.createElement("div");
  container.innerHTML = value;
  return container.innerText || "";
}

function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pathMatches(path: string, alias: string) {
  const normalizedPath = foldText(path);
  const normalizedAlias = foldText(alias);
  return (
    normalizedPath === normalizedAlias ||
    normalizedPath.endsWith(`.${normalizedAlias}`) ||
    normalizedPath.endsWith(`/${normalizedAlias}`) ||
    normalizedPath.endsWith(` ${normalizedAlias}`)
  );
}

function mailboxMatches(mailbox: Mailbox, values: string[]) {
  const path = foldText(mailbox.path);
  const name = foldText(mailbox.name);
  const specialUse = foldText(mailbox.specialUse || "");

  return values.some((value) => {
    const alias = foldText(value);
    return specialUse === alias || pathMatches(path, alias) || name === alias;
  });
}

type FolderKind = "inbox" | "drafts" | "sent" | "junk" | "trash" | "custom";

function getMailboxKind(mailbox: Mailbox): FolderKind {
  const specialUse = mailbox.specialUse || "";

  if (specialUse === "\\Inbox" || mailboxMatches(mailbox, ["inbox", "hộp thư", "hop thu"])) {
    return "inbox";
  }

  if (specialUse === "\\Drafts" || mailboxMatches(mailbox, ["drafts", "draft", "thư nháp", "thu nhap"])) {
    return "drafts";
  }

  if (specialUse === "\\Sent" || mailboxMatches(mailbox, ["sent", "sent items", "sent mail", "đã gửi", "da gui"])) {
    return "sent";
  }

  if (
    specialUse === "\\Junk" ||
    mailboxMatches(mailbox, ["junk", "spam", "thư rác", "thu rac"])
  ) {
    return "junk";
  }

  if (
    specialUse === "\\Trash" ||
    mailboxMatches(mailbox, ["trash", "thùng rác", "thung rac", "deleted items", "deleted"])
  ) {
    return "trash";
  }

  return "custom";
}

function getMailboxLabel(mailbox: Mailbox) {
  switch (getMailboxKind(mailbox)) {
    case "inbox":
      return "Inbox";
    case "drafts":
      return "Drafts";
    case "sent":
      return "Sent";
    case "junk":
      return "Spam";
    case "trash":
      return "Trash";
    default:
      return mailbox.name;
  }
}

function getMailboxIcon(kind: FolderKind, active: boolean) {
  const className = active ? "h-4 w-4 text-blue-600" : "h-4 w-4 text-slate-900";

  switch (kind) {
    case "inbox":
      return <Inbox className={className} />;
    case "drafts":
      return <FilePenLine className={className} />;
    case "sent":
      return <Send className={className} />;
    case "junk":
      return <ShieldAlert className={className} />;
    case "trash":
      return <Trash2 className={className} />;
    default:
      return <Folder className={className} />;
  }
}

function folderKindScore(mailbox: Mailbox, kind: FolderKind, currentPath: string) {
  const expectedSpecialUse: Partial<Record<FolderKind, string>> = {
    inbox: "\\Inbox",
    drafts: "\\Drafts",
    sent: "\\Sent",
    junk: "\\Junk",
    trash: "\\Trash"
  };
  const aliases: Record<FolderKind, string[]> = {
    inbox: ["inbox", "hộp thư", "hop thu"],
    drafts: ["drafts", "draft", "thư nháp", "thu nhap"],
    sent: ["sent", "sent items", "sent mail", "đã gửi", "da gui"],
    junk: ["junk", "spam", "thư rác", "thu rac"],
    trash: ["trash", "thùng rác", "thung rac", "deleted items", "deleted"],
    custom: []
  };
  const path = foldText(mailbox.path);
  const name = foldText(mailbox.name);
  let score = 0;

  if (mailbox.path === currentPath) score -= 1000;
  if (mailbox.specialUse === expectedSpecialUse[kind]) score -= 200;
  if (aliases[kind].some((alias) => foldText(alias) === path || foldText(alias) === name)) score -= 100;
  if (mailboxMatches(mailbox, aliases[kind])) score -= 50;
  if (path.startsWith("inbox.") || path.startsWith("inbox/")) score += 20;

  return score;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function splitRecipientValues(value: string) {
  const recipients: string[] = [];
  let current = "";
  let inQuote = false;
  let inAngle = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && inQuote) {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (!inQuote) {
      if (char === "<") {
        inAngle = true;
      } else if (char === ">") {
        inAngle = false;
      }

      if (!inAngle && /[,;\r\n]/.test(char)) {
        if (current.trim()) {
          recipients.push(current.trim());
        }
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    recipients.push(current.trim());
  }

  const looseEmails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (recipients.length <= 1 && looseEmails.length > recipients.length) {
    return looseEmails;
  }

  return recipients;
}

function getRecipientEmail(value: string) {
  const angleMatch = value.match(/<\s*([^>]+?)\s*>/);
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (angleMatch?.[1] || emailMatch?.[0] || value).trim().toLowerCase();
}

function isRecipientEmailValid(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(getRecipientEmail(value));
}

function hasValidRecipients(...values: string[]) {
  return values.some((value) => splitRecipientValues(value).some(isRecipientEmailValid));
}

function hasSignatureContent(signature: SignatureSettings) {
  return Boolean(signature.defaultEnabled && (signature.html.trim() || signature.text.trim()));
}

function contactValue(contact: Contact) {
  return contact.email;
}

function uniqueRecipients(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = getRecipientEmail(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(isRecipientEmailValid(value) ? normalized : value.trim());
  }

  return result;
}

function addAddressContacts(target: Map<string, Contact>, addresses: Address[]) {
  for (const address of addresses) {
    if (!address.address) {
      continue;
    }

    const email = address.address.trim();
    const key = email.toLowerCase();

    if (!target.has(key)) {
      target.set(key, {
        email,
        name: address.name?.trim() || email.split("@")[0] || email
      });
    }
  }
}

function RecipientInput({
  label,
  value,
  onChange,
  contacts,
  autoFocus,
  actions
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  contacts: Contact[];
  autoFocus?: boolean;
  actions?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recipients = useMemo(() => splitRecipientValues(value), [value]);
  const selectedEmails = useMemo(
    () => new Set(recipients.map((recipient) => getRecipientEmail(recipient))),
    [recipients]
  );
  const suggestions = useMemo(() => {
    const query = foldText(draft);

    if (!query) {
      return [];
    }

    return contacts
      .filter((contact) => !selectedEmails.has(contact.email.toLowerCase()))
      .filter((contact) => {
        const haystack = foldText(`${contact.name} ${contact.email}`);
        return haystack.includes(query);
      })
      .slice(0, 6);
  }, [contacts, draft, selectedEmails]);

  function commit(nextValue: string) {
    const values = uniqueRecipients([...recipients, ...splitRecipientValues(nextValue)]);
    onChange(values.join(", "));
    setDraft("");
    setActiveIndex(0);
  }

  function removeRecipient(index: number) {
    onChange(recipients.filter((_, itemIndex) => itemIndex !== index).join(", "));
  }

  function selectContact(contact: Contact) {
    commit(contactValue(contact));
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === ";") {
      if (!draft.trim()) {
        return;
      }

      event.preventDefault();
      if ((event.key === "Enter" || event.key === "Tab") && suggestions[activeIndex]) {
        selectContact(suggestions[activeIndex]);
      } else {
        commit(draft);
      }
      return;
    }

    if (event.key === "Backspace" && !draft && recipients.length) {
      removeRecipient(recipients.length - 1);
    }
  }

  return (
    <div className="relative grid min-h-12 w-full grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-2 px-3 py-1.5 sm:gap-3 sm:px-5">
      <span className="mt-2.5 text-sm text-slate-700">{label}</span>
      <div
        className={`flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1 pr-20 shadow-sm transition sm:pr-24 ${
          focused ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-300"
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {recipients.map((recipient, index) => {
          const email = getRecipientEmail(recipient);
          const valid = isRecipientEmailValid(recipient);

          return (
            <span
              key={`${recipient}-${index}`}
              className={`flex h-7 max-w-full items-center gap-1 rounded-[3px] border px-2 text-sm ${
                valid
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-red-300 bg-red-50 text-red-700"
              }`}
              title={email}
            >
              <span className="max-w-[240px] truncate">{email}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  removeRecipient(index);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] hover:bg-slate-200"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            if (/[,;\r\n]/.test(nextDraft)) {
              commit(nextDraft);
              return;
            }

            setDraft(nextDraft);
            setActiveIndex(0);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (splitRecipientValues(pasted).length > 1) {
              event.preventDefault();
              commit(pasted);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 150);
            if (draft.trim()) {
              commit(draft);
            }
          }}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          inputMode="email"
          autoComplete="email"
          className="h-7 min-w-[120px] flex-1 bg-transparent text-sm outline-none sm:min-w-[160px]"
        />
      </div>
      {actions ? (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-3 bg-white pl-2 sm:right-5">
          {actions}
        </div>
      ) : null}

      {focused && suggestions.length ? (
        <div className="absolute left-3 right-3 top-[calc(100%-2px)] z-30 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-soft sm:left-[100px] sm:right-auto sm:w-[min(360px,calc(100vw-136px))]">
          {suggestions.map((contact, index) => (
            <button
              type="button"
              key={contact.email}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectContact(contact)}
              className={`block w-full px-3 py-2 text-left ${
                index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <span className="block truncate text-sm font-medium text-slate-900">{contact.email}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WebmailApp() {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loginError, setLoginError] = useState("");
  const [error, setError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [sending, setSending] = useState(false);
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [composeId, setComposeId] = useState(0);
  const [composeFullPage, setComposeFullPage] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedUids, setSelectedUids] = useState<number[]>([]);
  const [messageMenuOpen, setMessageMenuOpen] = useState(false);
  const [quickReply, setQuickReply] = useState("");
  const [quickSending, setQuickSending] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [signature, setSignature] = useState<SignatureSettings>(emptySignature());
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const mobileFolderInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const signatureEditorRef = useRef<HTMLDivElement | null>(null);

  const currentMailbox = useMemo(
    () => mailboxes.find((mailbox) => mailbox.path === folder) || null,
    [folder, mailboxes]
  );
  const mainFolders = useMemo(
    () => {
      const order: FolderKind[] = ["inbox", "drafts", "sent", "junk", "trash"];
      const byKind = new Map<FolderKind, Mailbox>();

      for (const mailbox of mailboxes) {
        const kind = getMailboxKind(mailbox);

        if (kind === "custom") {
          continue;
        }

        const current = byKind.get(kind);
        if (!current || folderKindScore(mailbox, kind, folder) < folderKindScore(current, kind, folder)) {
          byKind.set(kind, mailbox);
        }
      }

      return order.map((kind) => byKind.get(kind)).filter((mailbox): mailbox is Mailbox => Boolean(mailbox));
    },
    [folder, mailboxes]
  );
  const customFolders = useMemo(
    () => mailboxes.filter((mailbox) => getMailboxKind(mailbox) === "custom"),
    [mailboxes]
  );
  const inboxFolder = useMemo(
    () => mainFolders.find((mailbox) => getMailboxKind(mailbox) === "inbox") || null,
    [mainFolders]
  );
  const archiveFolder = useMemo(
    () => mailboxes.find((mailbox) => mailboxMatches(mailbox, ["\\Archive", "archive", "archives"])),
    [mailboxes]
  );
  const spamFolder = useMemo(
    () => mainFolders.find((mailbox) => getMailboxKind(mailbox) === "junk") || null,
    [mainFolders]
  );
  const isSpamFolder = getMailboxKind(currentMailbox || { path: folder, name: folder, total: 0, unseen: 0, depth: 0 }) === "junk";
  const spamActionLabel = isSpamFolder ? "Not spam" : "Mark as spam";
  const SpamActionIcon = isSpamFolder ? ShieldCheck : ShieldAlert;
  const spamDestination = isSpamFolder ? inboxFolder?.path || "INBOX" : spamFolder?.path || "";

  const filteredMessages = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return messages;
    }

    return messages.filter((message) => {
      const haystack = [
        message.subject,
        message.snippet,
        displayName(message.from),
        displayEmail(message.from)
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [messages, query]);

  const visibleUids = useMemo(() => filteredMessages.map((message) => message.uid), [filteredMessages]);
  const allVisibleSelected = visibleUids.length > 0 && visibleUids.every((uid) => selectedUids.includes(uid));
  const contactSuggestions = useMemo(() => {
    const contacts = new Map<string, Contact>();

    for (const message of messages) {
      addAddressContacts(contacts, message.from);
      addAddressContacts(contacts, message.to);
    }

    if (selectedMessage) {
      addAddressContacts(contacts, selectedMessage.from);
      addAddressContacts(contacts, selectedMessage.to);
      addAddressContacts(contacts, selectedMessage.cc);
      addAddressContacts(contacts, selectedMessage.bcc);
    }

    if (account?.email) {
      contacts.delete(account.email.toLowerCase());
    }

    return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [account?.email, messages, selectedMessage]);
  const canSendCompose = compose ? hasValidRecipients(compose.to, compose.cc, compose.bcc) : false;

  async function loadMailboxes() {
    const payload = await api<{ mailboxes: Mailbox[] }>("/api/mailboxes");
    setMailboxes(payload.mailboxes);
  }

  async function loadMessages(nextFolder = folder) {
    setLoadingMessages(true);
    setError("");

    try {
      const payload = await api<{ messages: MessageSummary[] }>(
        `/api/messages?folder=${encodeURIComponent(nextFolder)}&limit=60`
      );
      setMessages(payload.messages);
      setSelectedUids([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot load messages.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function openMessage(uid: number) {
    setMobileSidebarOpen(false);
    setSelectedUid(uid);
    setLoadingMessage(true);
    setError("");

    try {
      const payload = await api<{ message: MessageDetail }>(
        `/api/messages/${uid}?folder=${encodeURIComponent(folder)}`
      );
      const message = {
        ...payload.message,
        seen: true,
        flags: [...new Set([...payload.message.flags, "\\Seen"])]
      };
      setSelectedMessage(message);
      setMessageMenuOpen(false);
      setMessages((current) =>
        current.map((message) =>
          message.uid === uid ? { ...message, seen: true, flags: [...new Set([...message.flags, "\\Seen"])] } : message
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot open message.");
    } finally {
      setLoadingMessage(false);
    }
  }

  async function bootstrap() {
    await loadMailboxes();
    await loadMessages("INBOX");
  }

  async function loadSignatureSettings(email: string) {
    const payload = await api<{ settings: SignatureSettings }>("/api/settings/signature");
    setSignature({
      ...emptySignature(email),
      ...payload.settings,
      email
    });
  }

  function applySignatureToDraft(draft: ComposeDraft, mode: "new" | "quoted" = "new") {
    if (!signature.defaultEnabled) {
      return draft;
    }

    let nextDraft = {
      ...draft,
      fromName: signature.displayName.trim(),
      replyTo: signature.replyTo.trim()
    };

    if (signature.bcc.trim()) {
      nextDraft = {
        ...nextDraft,
        bcc: uniqueRecipients([...splitRecipientValues(nextDraft.bcc), ...splitRecipientValues(signature.bcc)]).join(", ")
      };
    }

    if (hasSignatureContent(signature)) {
      const html = signature.html.trim() || textToHtml(signature.text.trim());
      const text = signature.text.trim() || htmlToText(signature.html).trim();

      nextDraft = {
        ...nextDraft,
        html: mode === "quoted" ? `<br><br>${html}${nextDraft.html}` : `<br><br>${html}`,
        text: mode === "quoted" ? `\n\n${text}${nextDraft.text}` : `\n\n${text}`
      };
    }

    return nextDraft;
  }

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const payload = await api<Account & { authenticated: boolean }>("/api/auth/me");

        if (!active) {
          return;
        }

        setAccount({
          email: payload.email,
          domain: payload.domain
        });
        await loadSignatureSettings(payload.email).catch(() => undefined);
        setReady(true);

        try {
          await bootstrap();
        } catch (err) {
          if (!active) {
            return;
          }

          const message = err instanceof Error ? err.message : "Cannot restore saved session.";
          await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          setAccount(null);
          setMailboxes([]);
          setMessages([]);
          setSelectedUid(null);
          setSelectedMessage(null);
          setSelectedUids([]);
          setSignature(emptySignature());
          setLoginError(`${message} Please sign in again.`);
        }
      } catch {
        if (active) {
          setReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    const form = new FormData(event.currentTarget);

    try {
      const payload = await api<Account>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          remember: form.get("remember") === "on"
        })
      });

      setAccount(payload);
      setFolder("INBOX");
      setSelectedUid(null);
      setSelectedMessage(null);
      await loadSignatureSettings(payload.email).catch(() => setSignature(emptySignature(payload.email)));
      await bootstrap();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Sign in failed.");
    }
  }

  async function onLogout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccount(null);
    setMailboxes([]);
    setMessages([]);
    setSelectedUid(null);
    setSelectedMessage(null);
    setSelectedUids([]);
    setCompose(null);
    setSignature(emptySignature());
    setSignatureOpen(false);
    setMobileSidebarOpen(false);
  }

  function openCompose(draft = emptyCompose(), signatureMode: "new" | "quoted" | false = "new") {
    const nextDraft = signatureMode ? applySignatureToDraft(draft, signatureMode) : draft;

    setCompose(nextDraft);
    setComposeId((value) => value + 1);
    setShowCc(Boolean(nextDraft.cc));
    setShowBcc(Boolean(nextDraft.bcc));
    setMessageMenuOpen(false);
    setMobileSidebarOpen(false);
  }

  async function selectFolder(nextFolder: string) {
    setMobileSidebarOpen(false);
    setFolder(nextFolder);
    setSelectedUid(null);
    setSelectedMessage(null);
    setSelectedUids([]);
    await loadMessages(nextFolder);
  }

  function replyTo(message: MessageDetail) {
    openCompose({
      to: displayEmail(message.from),
      cc: "",
      bcc: "",
      subject: message.subject.toLowerCase().startsWith("re:")
        ? message.subject
        : `Re: ${message.subject}`,
      text: quoteText(message),
      html: textToHtml(quoteText(message)),
      attachments: []
    }, "quoted");
  }

  function replyAll(message: MessageDetail) {
    const recipients = [...message.from, ...message.to]
      .map((item) => item.address)
      .filter((address): address is string => Boolean(address && address !== account?.email));

    openCompose({
      to: [...new Set(recipients)].join(", "),
      cc: message.cc.map((item) => item.address).filter(Boolean).join(", "),
      bcc: "",
      subject: message.subject.toLowerCase().startsWith("re:")
        ? message.subject
        : `Re: ${message.subject}`,
      text: quoteText(message),
      html: textToHtml(quoteText(message)),
      attachments: []
    }, "quoted");
  }

  function forwardMessage(message: MessageDetail) {
    const text = `\n\n---------- Forwarded message ----------\nFrom: ${displayName(message.from)} <${displayEmail(
      message.from
    )}>\nDate: ${fullDate(message.date)}\nSubject: ${message.subject}\nTo: ${message.to
      .map((item) => item.address || item.name)
      .filter(Boolean)
      .join(", ")}\n\n${message.text || message.snippet || ""}`;

    openCompose({
      to: "",
      cc: "",
      bcc: "",
      subject: message.subject.toLowerCase().startsWith("fwd:")
        ? message.subject
        : `Fwd: ${message.subject}`,
      text,
      html: textToHtml(text),
      attachments: []
    }, "quoted");
  }

  async function onAttach(files: FileList | null) {
    if (!files?.length || !compose) {
      return;
    }

    const nextAttachments: AttachmentDraft[] = [];

    for (const file of Array.from(files)) {
      if (file.size > maxAttachmentMb * 1024 * 1024) {
        setError(`${file.name} is larger than ${maxAttachmentMb}MB.`);
        continue;
      }

      nextAttachments.push({
        filename: file.name,
        contentType: file.type || undefined,
        contentBase64: await fileToBase64(file)
      });
    }

    setCompose({
      ...compose,
      attachments: [...compose.attachments, ...nextAttachments]
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function sendCompose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!compose) {
      return;
    }

    if (!hasValidRecipients(compose.to, compose.cc, compose.bcc)) {
      setError("Enter at least one valid recipient.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const html = editorRef.current?.innerHTML || compose.html || textToHtml(compose.text);
      const text = editorRef.current?.innerText || compose.text;

      await api("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          ...compose,
          text,
          html
        })
      });

      setCompose(null);
      await loadMailboxes();
      await loadMessages(folder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot send message.");
    } finally {
      setSending(false);
    }
  }

  function toggleSelectAllVisible() {
    setSelectedUids(allVisibleSelected ? [] : visibleUids);
  }

  function toggleMessageSelection(uid: number) {
    setSelectedUids((current) =>
      current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
    );
  }

  async function setReadState(uids: number[], seen: boolean) {
    if (!uids.length) {
      return;
    }

    await Promise.all(
      uids.map((uid) =>
        api(`/api/messages/${uid}/flags`, {
          method: "PATCH",
          body: JSON.stringify({
            folder,
            flag: "\\Seen",
            enabled: seen
          })
        })
      )
    );

    setMessages((current) =>
      current.map((message) =>
        uids.includes(message.uid)
          ? {
              ...message,
              seen,
              flags: seen
                ? [...new Set([...message.flags, "\\Seen"])]
                : message.flags.filter((flag) => flag !== "\\Seen")
            }
          : message
      )
    );

    if (selectedMessage && uids.includes(selectedMessage.uid)) {
      setSelectedMessage({
        ...selectedMessage,
        seen,
        flags: seen
          ? [...new Set([...selectedMessage.flags, "\\Seen"])]
          : selectedMessage.flags.filter((flag) => flag !== "\\Seen")
      });
    }

    await loadMailboxes();
  }

  async function toggleSelectedReadState() {
    const selected = messages.filter((message) => selectedUids.includes(message.uid));
    const shouldMarkRead = selected.some((message) => !message.seen);
    await setReadState(selectedUids, shouldMarkRead);
  }

  async function toggleCurrentReadState() {
    if (!selectedMessage) {
      return;
    }

    await setReadState([selectedMessage.uid], !selectedMessage.seen);
  }

  async function archiveMessages(uids: number[]) {
    if (!uids.length) {
      return;
    }

    if (!archiveFolder) {
      setError("Archive mailbox not found.");
      return;
    }

    await Promise.all(
      uids.map((uid) =>
        api(`/api/messages/${uid}/move`, {
          method: "POST",
          body: JSON.stringify({
            folder,
            destination: archiveFolder.path
          })
        })
      )
    );

    if (selectedUid && uids.includes(selectedUid)) {
      setSelectedUid(null);
      setSelectedMessage(null);
    }

    setSelectedUids([]);
    await loadMailboxes();
    await loadMessages(folder);
  }

  async function markSpamMessages(uids: number[]) {
    if (!uids.length) {
      return;
    }

    if (!spamDestination) {
      setError("Spam mailbox not found.");
      return;
    }

    await Promise.all(
      uids.map((uid) =>
        api(`/api/messages/${uid}/move`, {
          method: "POST",
          body: JSON.stringify({
            folder,
            destination: spamDestination
          })
        })
      )
    );

    if (selectedUid && uids.includes(selectedUid)) {
      setSelectedUid(null);
      setSelectedMessage(null);
    }

    setSelectedUids([]);
    await loadMailboxes();
    await loadMessages(folder);
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const path = newFolderName.trim();
    if (!path) {
      return;
    }

    setError("");

    try {
      await api("/api/mailboxes", {
        method: "POST",
        body: JSON.stringify({ path })
      });
      setNewFolderName("");
      await loadMailboxes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot create folder.");
    }
  }

  async function deleteMessages(uids: number[]) {
    if (!uids.length) {
      return;
    }

    await Promise.all(
      uids.map((uid) =>
        api(`/api/messages/${uid}?folder=${encodeURIComponent(folder)}`, {
          method: "DELETE"
        })
      )
    );

    if (selectedUid && uids.includes(selectedUid)) {
      setSelectedUid(null);
      setSelectedMessage(null);
    }

    setSelectedUids([]);
    await loadMailboxes();
    await loadMessages(folder);
  }

  async function deleteSelected() {
    const uids = selectedUids.length ? selectedUids : selectedUid ? [selectedUid] : [];
    await deleteMessages(uids);
  }

  async function toggleStar() {
    if (!selectedMessage) {
      return;
    }

    const enabled = !selectedMessage.flagged;
    await api(`/api/messages/${selectedMessage.uid}/flags`, {
      method: "PATCH",
      body: JSON.stringify({
        folder,
        flag: "\\Flagged",
        enabled
      })
    });

    setSelectedMessage({ ...selectedMessage, flagged: enabled });
    setMessages((current) =>
      current.map((message) =>
        message.uid === selectedMessage.uid ? { ...message, flagged: enabled } : message
      )
    );
  }

  async function sendQuickReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMessage || !quickReply.trim()) {
      return;
    }

    setQuickSending(true);
    setError("");

    try {
      const signatureHtml = signature.html.trim() || textToHtml(signature.text.trim());
      const signatureText = signature.text.trim() || htmlToText(signature.html).trim();
      const quickText = hasSignatureContent(signature) ? `${quickReply}\n\n${signatureText}` : quickReply;
      const quickHtml = hasSignatureContent(signature)
        ? `${textToHtml(quickReply)}<br><br>${signatureHtml}`
        : textToHtml(quickReply);

      await api("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          fromName: signature.defaultEnabled ? signature.displayName.trim() : "",
          replyTo: signature.defaultEnabled ? signature.replyTo.trim() : "",
          to: displayEmail(selectedMessage.from),
          cc: "",
          bcc: signature.defaultEnabled ? signature.bcc.trim() : "",
          subject: selectedMessage.subject.toLowerCase().startsWith("re:")
            ? selectedMessage.subject
            : `Re: ${selectedMessage.subject}`,
          text: quickText,
          html: quickHtml,
          attachments: []
        })
      });

      setQuickReply("");
      await loadMailboxes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot send quick reply.");
    } finally {
      setQuickSending(false);
    }
  }

  function runContentCommand(ref: { current: HTMLDivElement | null }, command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
  }

  function runEditorCommand(command: string, value?: string) {
    runContentCommand(editorRef, command, value);
  }

  function addEditorLink() {
    const url = window.prompt("URL");

    if (!url) {
      return;
    }

    runEditorCommand("createLink", url);
  }

  function addSignatureLink() {
    const url = window.prompt("URL");

    if (!url) {
      return;
    }

    runContentCommand(signatureEditorRef, "createLink", url);
  }

  async function saveSignatureSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!account) {
      return;
    }

    const html = signatureEditorRef.current?.innerHTML || signature.html;
    const text = signatureEditorRef.current?.innerText || htmlToText(html);

    setSignatureSaving(true);
    setSignatureSaved(false);
    setError("");

    try {
      const payload = await api<{ settings: SignatureSettings }>("/api/settings/signature", {
        method: "PUT",
        body: JSON.stringify({
          ...signature,
          email: account.email,
          html,
          text
        })
      });

      setSignature(payload.settings);
      setSignatureSaved(true);
      window.setTimeout(() => setSignatureSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot save signature settings.");
    } finally {
      setSignatureSaving(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </main>
    );
  }

  if (!account) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-white">
        <form
          onSubmit={onLogin}
          className="flex min-h-[412px] w-full max-w-[528px] flex-col bg-[#284f7d] px-8 py-14 sm:px-[75px] sm:py-16"
        >
          <div className="mb-9 flex justify-start">
            <img
              src="/brand/bnix-light.png"
              alt="BNIX Webmail"
              className="h-auto w-[260px] max-w-full"
            />
          </div>

          <div className="space-y-4">
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Email address"
              className="h-10 w-full rounded-[3px] border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-[#68b7ff] focus:ring-2 focus:ring-[#68b7ff]/30"
              required
            />
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              className="h-10 w-full rounded-[3px] border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-[#68b7ff] focus:ring-2 focus:ring-[#68b7ff]/30"
              required
            />
            <div className="flex items-center justify-between gap-4 pt-4 text-sm">
              <label className="flex items-center gap-2 text-white">
                <input
                  name="remember"
                  type="checkbox"
                  defaultChecked
                  className="h-3.5 w-3.5 rounded border-white/70 accent-[#2d8cff]"
                />
                Stay signed in
              </label>
            </div>
            {loginError ? (
              <p className="rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {loginError}
              </p>
            ) : null}
            <button
              type="submit"
              className="mt-1 h-10 w-[170px] rounded-[3px] bg-[#3d83bd] text-sm font-medium text-white shadow-sm transition hover:bg-[#4f9ade] focus:outline-none focus:ring-2 focus:ring-[#68b7ff]/40"
            >
              Sign in
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] overflow-hidden bg-slate-50 text-slate-900 md:h-screen">
      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close menu"
          />
          <aside className="relative flex h-full w-[min(86vw,340px)] flex-col border-r border-slate-200 bg-slate-100 shadow-2xl">
            <div className="flex h-16 shrink-0 items-center gap-3 px-4">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md text-slate-900 hover:bg-white"
                onClick={() => setMobileSidebarOpen(false)}
                title="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-950">{appName}</p>
                <p className="truncate text-xs text-slate-500">{account.email}</p>
              </div>
            </div>

            <div className="px-4 pb-3">
              <button
                type="button"
                onClick={() => openCompose(emptyCompose())}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-4 font-medium text-white shadow-soft hover:bg-blue-600"
              >
                <PencilLine className="h-4 w-4" />
                Compose
              </button>
            </div>

            <div className="px-4 pb-3">
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-slate-500">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search mail..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                />
              </label>
            </div>

            <nav className="mail-scroll flex-1 overflow-y-auto py-1">
              <section className="pb-2">
                <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Main
                </div>
                <div className="space-y-1">
                  {mainFolders.map((mailbox) => {
                    const active = mailbox.path === folder;
                    const kind = getMailboxKind(mailbox);

                    return (
                      <button
                        type="button"
                        key={mailbox.path}
                        onClick={() => selectFolder(mailbox.path)}
                        title={getMailboxLabel(mailbox)}
                        className={`flex h-10 w-full items-center gap-3 px-5 text-left text-sm font-medium ${
                          active ? "bg-blue-100 text-blue-700" : "text-slate-900 hover:bg-white"
                        }`}
                      >
                        {getMailboxIcon(kind, active)}
                        <span className="min-w-0 flex-1 truncate">{getMailboxLabel(mailbox)}</span>
                        {mailbox.unseen ? (
                          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                            {mailbox.unseen}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="border-t border-slate-200 pt-2">
                <div className="flex items-center justify-between px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Folders</span>
                  <button
                    type="button"
                    onClick={() => mobileFolderInputRef.current?.focus()}
                    className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-white"
                    title="Create folder"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Create
                  </button>
                </div>

                <form onSubmit={createFolder} className="px-4 pb-3">
                  <div className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
                    <Folder className="h-4 w-4 text-slate-500" />
                    <input
                      ref={mobileFolderInputRef}
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      placeholder="New folder name"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      Create
                    </button>
                  </div>
                </form>

                <div className="space-y-1">
                  {customFolders.map((mailbox) => {
                    const active = mailbox.path === folder;
                    const kind = getMailboxKind(mailbox);

                    return (
                      <button
                        type="button"
                        key={mailbox.path}
                        onClick={() => selectFolder(mailbox.path)}
                        title={mailbox.name}
                        style={{ paddingLeft: `${20 + mailbox.depth * 12}px` }}
                        className={`flex h-10 w-full items-center gap-3 text-left text-sm font-medium ${
                          active ? "bg-blue-100 text-blue-700" : "text-slate-900 hover:bg-white"
                        }`}
                      >
                        {getMailboxIcon(kind, active)}
                        <span className="min-w-0 flex-1 truncate">{mailbox.name}</span>
                        {mailbox.unseen ? (
                          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                            {mailbox.unseen}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            </nav>

            <div className="border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => {
                  setSignatureOpen(true);
                  setSignatureSaved(false);
                  setMobileSidebarOpen(false);
                }}
                className="mb-2 flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-slate-700 hover:bg-white"
                title="Signature settings"
              >
                <Settings className="h-4 w-4" />
                <span className="truncate">Signature settings</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-slate-700 hover:bg-white"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="truncate">Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-16"
        } hidden shrink-0 border-r border-slate-200 bg-slate-100 transition-all md:flex md:flex-col`}
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-slate-900 hover:bg-white"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {sidebarOpen ? (
            <button
              type="button"
              onClick={() => openCompose(emptyCompose())}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-blue-500 px-4 font-medium text-white shadow-soft hover:bg-blue-600"
            >
              <PencilLine className="h-4 w-4" />
              Compose
            </button>
          ) : null}
        </div>

        {sidebarOpen ? (
          <div className="px-4 pb-3">
            <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search mail..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
              />
            </label>
          </div>
        ) : null}

        <nav className="mail-scroll flex-1 overflow-y-auto py-1">
          {sidebarOpen ? (
            <>
              <section className="pb-2">
                <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Main
                </div>
                <div className="space-y-1">
                  {mainFolders.map((mailbox) => {
                    const active = mailbox.path === folder;
                    const kind = getMailboxKind(mailbox);

                    return (
                      <button
                        type="button"
                        key={mailbox.path}
                        onClick={() => selectFolder(mailbox.path)}
                        title={getMailboxLabel(mailbox)}
                        className={`flex h-9 w-full items-center gap-3 px-5 text-left text-sm font-medium ${
                          active ? "bg-blue-100 text-blue-700" : "text-slate-900 hover:bg-white"
                        }`}
                      >
                        {getMailboxIcon(kind, active)}
                        <span className="min-w-0 flex-1 truncate">{getMailboxLabel(mailbox)}</span>
                        {mailbox.unseen ? (
                          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                            {mailbox.unseen}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="border-t border-slate-200 pt-2">
                <div className="flex items-center justify-between px-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Folders</span>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.focus()}
                    className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-white"
                    title="Create folder"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Create
                  </button>
                </div>

                <form onSubmit={createFolder} className="px-4 pb-3">
                  <div className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
                    <Folder className="h-4 w-4 text-slate-500" />
                    <input
                      ref={folderInputRef}
                      value={newFolderName}
                      onChange={(event) => setNewFolderName(event.target.value)}
                      placeholder="New folder name"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      Create
                    </button>
                  </div>
                </form>

                <div className="space-y-1">
                  {customFolders.map((mailbox) => {
                    const active = mailbox.path === folder;
                    const kind = getMailboxKind(mailbox);

                    return (
                      <button
                        type="button"
                        key={mailbox.path}
                        onClick={() => selectFolder(mailbox.path)}
                        title={mailbox.name}
                        style={{ paddingLeft: `${20 + mailbox.depth * 12}px` }}
                        className={`flex h-9 w-full items-center gap-3 text-left text-sm font-medium ${
                          active ? "bg-blue-100 text-blue-700" : "text-slate-900 hover:bg-white"
                        }`}
                      >
                        {getMailboxIcon(kind, active)}
                        <span className="min-w-0 flex-1 truncate">{mailbox.name}</span>
                        {mailbox.unseen ? (
                          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                            {mailbox.unseen}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <div className="space-y-1 py-1">
              {[...mainFolders, ...customFolders].map((mailbox) => {
                const active = mailbox.path === folder;
                const kind = getMailboxKind(mailbox);

                return (
                  <button
                    type="button"
                    key={mailbox.path}
                    onClick={() => selectFolder(mailbox.path)}
                    title={getMailboxLabel(mailbox)}
                    className={`flex h-9 w-full items-center justify-center ${active ? "bg-blue-100 text-blue-700" : "text-slate-900 hover:bg-white"}`}
                  >
                    {getMailboxIcon(kind, active)}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() => {
              setSignatureOpen(true);
              setSignatureSaved(false);
            }}
            className="mb-2 flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-slate-700 hover:bg-white"
            title="Signature settings"
          >
            <Settings className="h-4 w-4" />
            {sidebarOpen ? <span className="truncate">Signature settings</span> : null}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-slate-700 hover:bg-white"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            {sidebarOpen ? <span className="truncate">{account.email}</span> : null}
          </button>
        </div>
      </aside>

      <section
        className={`${selectedUid ? "hidden md:flex" : "flex"} w-full min-w-0 md:w-96 md:shrink-0 md:border-r md:border-slate-200`}
      >
        <div className="flex w-full flex-col bg-white">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3 sm:px-4 md:h-12">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 md:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              title="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 md:flex"
              onClick={() => loadMessages(folder)}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loadingMessages ? "animate-spin" : ""}`} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  allVisibleSelected ? "border-blue-600 bg-blue-600" : "border-slate-500 bg-white"
                }`}
                title="Select all"
              >
                {allVisibleSelected ? <span className="h-1.5 w-1.5 rounded-sm bg-white" /> : null}
              </button>
              {selectedUids.length ? (
                <div className="flex min-w-0 items-center gap-1">
                  <span className="mr-2 truncate">{selectedUids.length} selected</span>
                  <button
                    type="button"
                    onClick={() => archiveMessages(selectedUids)}
                    className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
                    title="Archive selected"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleSelectedReadState}
                    className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
                    title="Mark read/unread"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => markSpamMessages(selectedUids)}
                    className="flex h-8 items-center gap-1 rounded-md px-2 hover:bg-slate-100"
                    title={spamActionLabel}
                  >
                    <SpamActionIcon className="h-4 w-4" />
                    <span className="hidden lg:inline">{spamActionLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
                    title="Delete selected"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <span className="truncate">
                  {currentMailbox ? getMailboxLabel(currentMailbox) : folder} - {filteredMessages.length}
                </span>
              )}
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 md:hidden"
              onClick={() => loadMessages(folder)}
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loadingMessages ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 md:hidden"
              onClick={() => openCompose(emptyCompose())}
              title="Compose"
            >
              <PencilLine className="h-5 w-5 text-blue-600" />
            </button>
          </header>

          <div className="border-b border-slate-200 px-3 py-2 md:hidden">
            <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search mail..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
              />
            </label>
          </div>

          {error ? (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mail-scroll flex-1 overflow-y-auto">
            {loadingMessages ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : filteredMessages.length ? (
              filteredMessages.map((message) => {
                const active = selectedUid === message.uid;
                const unread = !message.seen;

                return (
                  <div
                    key={message.uid}
                    onClick={() => openMessage(message.uid)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openMessage(message.uid);
                      }
                    }}
                    className={`grid w-full grid-cols-[20px_40px_minmax(0,1fr)_auto] gap-3 border-b border-slate-200 px-4 py-3 text-left transition ${
                      active
                        ? "bg-blue-100"
                        : unread
                          ? "bg-emerald-50 hover:bg-emerald-100"
                          : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMessageSelection(message.uid);
                      }}
                      className={`mt-3 flex h-4 w-4 items-center justify-center rounded border ${
                        selectedUids.includes(message.uid)
                          ? "border-blue-600 bg-blue-600"
                          : "border-slate-400 bg-white"
                      }`}
                      title="Select message"
                    >
                      {selectedUids.includes(message.uid) ? (
                        <span className="h-1.5 w-1.5 rounded-sm bg-white" />
                      ) : null}
                    </button>
                    <div className="relative">
                      {!message.seen ? (
                        <span className="absolute -left-2 top-6 h-2 w-2 rounded-full bg-blue-600" />
                      ) : null}
                      <AvatarBadge
                        key={message.uid}
                        email={displayEmail(message.from)}
                        name={displayName(message.from)}
                        sizeClass="h-10 w-10"
                        fallbackClassName="bg-lime-400 text-white"
                        textClassName="text-sm font-semibold text-white"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p
                          className={`min-w-0 truncate text-sm ${
                            unread ? "font-bold text-slate-950" : "font-medium text-slate-600"
                          }`}
                        >
                          {displayName(message.from)}
                        </p>
                        {message.flagged ? (
                          <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
                        ) : null}
                      </div>
                      <p className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>
                        {message.subject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                        {message.snippet || "No preview available"}
                      </p>
                    </div>
                    <span className={`text-xs ${unread ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                      {formatTime(message.date)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="flex h-64 flex-col items-center justify-center px-8 text-center text-slate-500">
                <Mail className="mb-4 h-10 w-10 text-slate-300" />
                <p className="font-medium text-slate-700">No conversations</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={`${selectedUid ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-slate-50`}>
        {!selectedUid ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-soft">
              <Mail className="h-10 w-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-bold">No conversation selected</h2>
            <p className="mt-3 max-w-sm text-base leading-6 text-slate-500">
              Choose a conversation from the list to read it here
            </p>
          </div>
        ) : loadingMessage ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : selectedMessage ? (
          <>
            <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:px-6 md:py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUid(null);
                      setSelectedMessage(null);
                      setMessageMenuOpen(false);
                    }}
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 md:hidden"
                    title="Back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold tracking-normal md:text-2xl">
                      {selectedMessage.subject}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 md:mt-2">{fullDate(selectedMessage.date)}</p>
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-2 md:flex">
                  <button
                    type="button"
                    onClick={() => archiveMessages([selectedMessage.uid])}
                    className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                    title="Archive"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => markSpamMessages([selectedMessage.uid])}
                    className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                    title={spamActionLabel}
                  >
                    <SpamActionIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMessages([selectedMessage.uid])}
                    className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleStar}
                    className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                    title="Star"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        selectedMessage.flagged ? "fill-amber-400 text-amber-400" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={toggleCurrentReadState}
                    className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                    title={selectedMessage.seen ? "Mark as unread" : "Mark as read"}
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMessageMenuOpen(!messageMenuOpen)}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                      title="More actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {messageMenuOpen ? (
                      <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-soft">
                        <button
                          type="button"
                          onClick={() => replyAll(selectedMessage)}
                          className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                        >
                          Reply all
                        </button>
                        <button
                          type="button"
                          onClick={() => forwardMessage(selectedMessage)}
                          className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                        >
                          Forward
                        </button>
                        <button
                          type="button"
                          onClick={toggleCurrentReadState}
                          className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                        >
                          {selectedMessage.seen ? "Mark unread" : "Mark read"}
                        </button>
                        <button
                          type="button"
                          onClick={() => archiveMessages([selectedMessage.uid])}
                          className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => markSpamMessages([selectedMessage.uid])}
                          className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                        >
                          {spamActionLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMessages([selectedMessage.uid])}
                          className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1 md:hidden">
                <button
                  type="button"
                  onClick={() => archiveMessages([selectedMessage.uid])}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                  title="Archive"
                >
                  <Archive className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => markSpamMessages([selectedMessage.uid])}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                  title={spamActionLabel}
                >
                  <SpamActionIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteMessages([selectedMessage.uid])}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleStar}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                  title="Star"
                >
                  <Star
                    className={`h-4 w-4 ${
                      selectedMessage.flagged ? "fill-amber-400 text-amber-400" : ""
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={toggleCurrentReadState}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                  title={selectedMessage.seen ? "Mark as unread" : "Mark as read"}
                >
                  <Circle className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMessageMenuOpen(!messageMenuOpen)}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                    title="More actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {messageMenuOpen ? (
                    <div className="absolute left-0 top-10 z-20 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-soft">
                      <button
                        type="button"
                        onClick={() => replyAll(selectedMessage)}
                        className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        Reply all
                      </button>
                      <button
                        type="button"
                        onClick={() => forwardMessage(selectedMessage)}
                        className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        Forward
                      </button>
                      <button
                        type="button"
                        onClick={toggleCurrentReadState}
                        className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        {selectedMessage.seen ? "Mark unread" : "Mark read"}
                      </button>
                      <button
                        type="button"
                        onClick={() => archiveMessages([selectedMessage.uid])}
                        className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        onClick={() => markSpamMessages([selectedMessage.uid])}
                        className="block w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        {spamActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMessages([selectedMessage.uid])}
                        className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 md:mt-5 md:gap-4">
                <AvatarBadge
                  key={selectedMessage.uid}
                  email={displayEmail(selectedMessage.from)}
                  name={displayName(selectedMessage.from)}
                  sizeClass="h-12 w-12"
                  fallbackClassName="bg-lime-400 text-white"
                  textClassName="text-sm font-semibold text-white"
                />
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {displayName(selectedMessage.from)}
                    {displayEmail(selectedMessage.from) ? (
                      <span className="ml-2 font-normal text-slate-500">
                        &lt;{displayEmail(selectedMessage.from)}&gt;
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    To: {selectedMessage.to.map((item) => item.name || item.address).join(", ") || account.email}
                  </p>
                </div>
              </div>
            </header>

            <div className="mail-scroll flex-1 overflow-y-auto p-4 md:p-6">
              <article className="rounded-md border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                {selectedMessage.html ? (
                  <div
                    className="email-html text-sm leading-7"
                    dangerouslySetInnerHTML={{ __html: selectedMessage.html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7 text-slate-900">
                    {selectedMessage.text || ""}
                  </pre>
                )}
              </article>

              {selectedMessage.attachments.length ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-sm font-semibold">Attachments</p>
                  <div className="grid gap-2">
                    {selectedMessage.attachments.map((attachment, index) => (
                      <div
                        key={`${attachment.filename}-${index}`}
                        className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm"
                      >
                        <Paperclip className="h-4 w-4 text-slate-500" />
                        <span className="min-w-0 flex-1 truncate">
                          {attachment.filename || "attachment"}
                        </span>
                        {attachment.size ? (
                          <span className="text-xs text-slate-500">
                            {Math.round(attachment.size / 1024)} KB
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => replyTo(selectedMessage)}
                  className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  title="Reply"
                >
                  <Reply className="h-4 w-4" />
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => replyAll(selectedMessage)}
                  className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  title="Reply all"
                >
                  <ReplyAll className="h-4 w-4" />
                  Reply all
                </button>
                <button
                  type="button"
                  onClick={() => forwardMessage(selectedMessage)}
                  className="flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  title="Forward"
                >
                  <Forward className="h-4 w-4" />
                  Forward
                </button>
              </div>

              <form
                className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm md:gap-3 md:p-4"
                onSubmit={sendQuickReply}
              >
                <AvatarBadge
                  key={account.email}
                  email={account.email}
                  name={account.email}
                  sizeClass="h-9 w-9"
                  fallbackClassName="bg-red-500 text-white"
                  textClassName="text-xs font-bold text-white"
                />
                <input
                  name="quickReply"
                  value={quickReply}
                  onChange={(event) => setQuickReply(event.target.value)}
                  placeholder="Write a quick reply..."
                  className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={quickSending || !quickReply.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500 text-white hover:bg-blue-600"
                  title="Send"
                >
                  {quickSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </>
        ) : null}
      </section>

      {!compose && !signatureOpen && !mobileSidebarOpen ? (
        <button
          type="button"
          onClick={() => openCompose(emptyCompose())}
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xl hover:bg-blue-600 md:hidden"
          title="Compose"
          aria-label="Compose"
        >
          <PencilLine className="h-6 w-6" />
        </button>
      ) : null}

      {signatureOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <form
            onSubmit={saveSignatureSettings}
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl"
          >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
              <h2 className="text-lg font-bold">Signature settings</h2>
              <button
                type="button"
                onClick={() => setSignatureOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="mail-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3">
                <label className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium text-slate-700">Display name</span>
                  <input
                    value={signature.displayName}
                    onChange={(event) => setSignature({ ...signature, displayName: event.target.value })}
                    className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium text-slate-700">Email address</span>
                  <input
                    value={account.email}
                    readOnly
                    className="h-9 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 outline-none"
                  />
                </label>

                <label className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium text-slate-700">Organization</span>
                  <input
                    value={signature.organization}
                    onChange={(event) => setSignature({ ...signature, organization: event.target.value })}
                    className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium text-slate-700">Reply-To</span>
                  <input
                    type="email"
                    value={signature.replyTo}
                    onChange={(event) => setSignature({ ...signature, replyTo: event.target.value })}
                    className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm font-medium text-slate-700">Blind copy</span>
                  <input
                    value={signature.bcc}
                    onChange={(event) => setSignature({ ...signature, bcc: event.target.value })}
                    placeholder="email@example.com, another@example.com"
                    className="h-9 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium text-slate-700">Use by default</span>
                  <span>
                    <input
                      type="checkbox"
                      checked={signature.defaultEnabled}
                      onChange={(event) => setSignature({ ...signature, defaultEnabled: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-500"
                    />
                  </span>
                </label>
              </div>

              <div className="mt-6">
                <h3 className="mb-3 text-base font-bold text-slate-900">Signature</h3>
                <div className="overflow-hidden rounded-md border border-slate-300">
                  <div className="flex h-10 flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-100 px-2">
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runContentCommand(signatureEditorRef, "bold");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runContentCommand(signatureEditorRef, "italic");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runContentCommand(signatureEditorRef, "underline");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Underline"
                    >
                      <Underline className="h-4 w-4" />
                    </button>
                    <div className="mx-1 h-6 w-px bg-slate-300" />
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runContentCommand(signatureEditorRef, "justifyLeft");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Align left"
                    >
                      <AlignLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runContentCommand(signatureEditorRef, "justifyCenter");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Align center"
                    >
                      <AlignCenter className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        runContentCommand(signatureEditorRef, "justifyRight");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Align right"
                    >
                      <AlignRight className="h-4 w-4" />
                    </button>
                    <div className="mx-1 h-6 w-px bg-slate-300" />
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addSignatureLink();
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"
                      title="Insert link"
                    >
                      <Link className="h-4 w-4" />
                    </button>
                  </div>
                  <div
                    key={`${signature.email}-${signature.html}`}
                    ref={signatureEditorRef}
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder="Create your signature..."
                    className="signature-editor min-h-[300px] bg-white px-4 py-4 text-sm leading-6 outline-none"
                    dangerouslySetInnerHTML={{ __html: signature.html }}
                  />
                </div>
              </div>
            </div>

            <footer className="flex h-16 shrink-0 items-center justify-between border-t border-slate-200 px-5">
              <span className="text-sm text-emerald-600">{signatureSaved ? "Saved" : ""}</span>
              <button
                type="submit"
                disabled={signatureSaving}
                className="flex h-10 items-center gap-2 rounded-md bg-blue-500 px-5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signatureSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </footer>
          </form>
        </div>
      ) : null}

      {compose ? (
        <div
          className={`fixed inset-0 z-50 flex ${
            composeFullPage
              ? "items-stretch justify-stretch bg-white"
              : "items-stretch justify-stretch bg-white sm:items-center sm:justify-center sm:bg-black/45 sm:px-4"
          }`}
        >
          <form
            onSubmit={sendCompose}
            className={`flex flex-col overflow-hidden bg-white ${
              composeFullPage
                ? "h-full w-full rounded-none"
                : "h-full w-full rounded-none sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-md sm:shadow-2xl"
            }`}
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-5">
              <h2 className="text-lg font-bold">New Message</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setComposeFullPage(!composeFullPage)}
                  className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-slate-100"
                  title={composeFullPage ? "Exit full page" : "Full page"}
                >
                  {composeFullPage ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setCompose(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-slate-100"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="mail-scroll min-h-0 flex-1 overflow-y-auto">
              <div className="grid min-h-12 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 border-b border-slate-200 px-3 sm:gap-3 sm:px-5">
                <span className="text-sm text-slate-500">From:</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{account.email}</span>
              </div>

              <RecipientInput
                label="To"
                value={compose.to}
                onChange={(value) => setCompose({ ...compose, to: value })}
                contacts={contactSuggestions}
                autoFocus
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCc(!showCc)}
                      className="text-sm font-medium text-slate-700"
                    >
                      Cc
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBcc(!showBcc)}
                      className="text-sm font-medium text-slate-700"
                    >
                      Bcc
                    </button>
                  </>
                }
              />

              {showCc ? (
                <RecipientInput
                  label="Cc"
                  value={compose.cc}
                  onChange={(value) => setCompose({ ...compose, cc: value })}
                  contacts={contactSuggestions}
                />
              ) : null}

              {showBcc ? (
                <RecipientInput
                  label="Bcc"
                  value={compose.bcc}
                  onChange={(value) => setCompose({ ...compose, bcc: value })}
                  contacts={contactSuggestions}
                />
              ) : null}

              <div className="grid min-h-14 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 border-b border-slate-200 px-3 sm:gap-3 sm:px-5">
                <span className="text-sm text-slate-500">Subject:</span>
                <input
                  value={compose.subject}
                  onChange={(event) => setCompose({ ...compose, subject: event.target.value })}
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>

              <div className="mail-scroll flex h-12 items-center gap-1 overflow-x-auto border-b border-slate-200 px-3 sm:px-5">
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runEditorCommand("bold");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runEditorCommand("italic");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runEditorCommand("underline");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Underline"
                >
                  <Underline className="h-4 w-4" />
                </button>
                <div className="mx-1 h-6 w-px bg-slate-200" />
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runEditorCommand("insertUnorderedList");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Bulleted list"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runEditorCommand("insertOrderedList");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Numbered list"
                >
                  <ListOrdered className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runEditorCommand("formatBlock", "pre");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Code block"
                >
                  <Code2 className="h-4 w-4" />
                </button>
                <div className="mx-1 h-6 w-px bg-slate-200" />
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addEditorLink();
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                  title="Insert link"
                >
                  <Link className="h-4 w-4" />
                </button>
              </div>

              <div
                key={composeId}
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Write your message..."
                className={`compose-editor w-full border-b border-slate-200 px-3 py-4 text-sm leading-7 outline-none sm:px-5 ${
                  composeFullPage ? "min-h-[calc(100dvh-320px)]" : "min-h-[calc(100dvh-320px)] sm:min-h-56"
                }`}
                dangerouslySetInnerHTML={{
                  __html: compose.html || textToHtml(compose.text)
                }}
              />

              {compose.attachments.length ? (
                <div className="grid gap-2 border-b border-slate-200 px-3 py-3 sm:px-5">
                  {compose.attachments.map((attachment, index) => (
                    <div
                      key={`${attachment.filename}-${index}`}
                      className="flex h-10 items-center gap-3 rounded-md bg-slate-100 px-3 text-sm"
                    >
                      <Paperclip className="h-4 w-4 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCompose({
                            ...compose,
                            attachments: compose.attachments.filter((_, itemIndex) => itemIndex !== index)
                          })
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <footer className="flex h-16 shrink-0 items-center justify-between px-3 sm:px-5">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => onAttach(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  <Paperclip className="h-4 w-4" />
                  Attach
                </button>
              </div>
              <button
                type="submit"
                disabled={sending || !canSendCompose}
                className="flex h-10 items-center gap-2 rounded-md bg-blue-500 px-5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
