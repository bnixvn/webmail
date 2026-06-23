/* ════════════════════════════════════════════════════════════════════════════
   BNIX Webmail — Vanilla JS Application
   ════════════════════════════════════════════════════════════════════════════ */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") el.className = v;
      else if (k === "innerHTML") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

function clear(el) { el.innerHTML = ""; return el; }
function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// ─── Icons (Lucide-style SVGs) ───────────────────────────────────────────────

const I = {
  inbox:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  send:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`,
  file:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  shield:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  trash:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  star:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starFill:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  mail:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  reply:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  replyAll:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>`,
  forward:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>`,
  archive:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
  search:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  menu:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  x:         `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  plus:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  refresh:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  paperclip: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  bold:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>`,
  italic:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>`,
  underline: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>`,
  list:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
  listOrd:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,
  code:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  link:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  max:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`,
  min:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" x2="21" y1="10" y2="3"/><line x1="3" x2="10" y1="21" y2="14"/></svg>`,
  settings:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  logout:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  user:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  calendar:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  contact:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 2v2"/><path d="M7 22v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2"/><circle cx="12" cy="11" r="3"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  chevL:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  chevR:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  more:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  folder:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>`,
  edit:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>`,
  check:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  marker:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
};

function icon(name, cls) {
  const span = document.createElement("span");
  span.innerHTML = I[name] || "";
  if (cls) span.className = cls;
  span.style.display = "inline-flex";
  span.style.alignItems = "center";
  return span;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function displayName(addrs) {
  if (!addrs || !addrs.length) return "Unknown";
  const a = addrs[0];
  return a.name || (a.address ? a.address.split("@")[0] : "Unknown");
}

function displayEmail(addrs) {
  if (!addrs || !addrs.length) return "";
  return addrs[0].address || "";
}

function initialsOf(value) {
  if (!value) return "?";
  const clean = value.replace(/[".><()[\]]/g, "").trim();
  if (!clean) return "?";
  const parts = clean.split(/[@.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date)) return "";
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fullDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function textToHtml(text) {
  if (!text) return "";
  return esc(text).replace(/\n/g, "<br>");
}

const VALID_EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Smart folder matching (supports Vietnamese aliases)
const MAIN_FOLDERS = [
  { match: ["inbox", "hộp thư", "hop thu"], icon: "inbox", label: "Inbox", special: "inbox" },
  { match: ["drafts", "draft", "thư nháp", "thu nhap"], icon: "file", label: "Drafts", special: "drafts" },
  { match: ["sent", "đã gửi", "da gui", "sent mail", "sent messages"], icon: "send", label: "Sent", special: "sent" },
  { match: ["spam", "junk", "thư rác", "thu rac", "bulk"], icon: "shield", label: "Spam", special: "junk" },
  { match: ["trash", "deleted", "thùng rác", "thung rac", "bin"], icon: "trash", label: "Trash", special: "trash" },
];

function classifyFolder(mailbox) {
  const name = (mailbox.name || mailbox.path || "").toLowerCase();
  const special = (mailbox.specialUse || "").toLowerCase();
  for (const f of MAIN_FOLDERS) {
    if (special && (special === f.special || special === "\\" + f.label.toLowerCase())) return f;
    for (const m of f.match) {
      if (name === m || name.includes(m)) return f;
    }
  }
  return null;
}

// ─── Avatar Cache ────────────────────────────────────────────────────────────

const avatarCache = new Map();
const avatarPending = new Map();

async function getAvatarSources(email) {
  if (!email) return null;
  const key = email.toLowerCase().trim();
  if (avatarCache.has(key)) return avatarCache.get(key);
  if (avatarPending.has(key)) return avatarPending.get(key);

  const promise = api(`/api/avatar?email=${encodeURIComponent(key)}`)
    .then(data => { avatarCache.set(key, data); return data; })
    .catch(() => ({ bimiUrl: null, gravatarUrl: null }));
  avatarPending.set(key, promise);
  return promise;
}

function avatarBadge(size, email, sources) {
  const el = h("div", { className: "avatar-badge", style: { width: size + "px", height: size + "px", fontSize: (size * 0.38) + "px", background: "#a3e635" } });
  el.textContent = initialsOf(email);

  if (sources) {
    const src = sources.bimiUrl || sources.gravatarUrl;
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.onload = () => { el.textContent = ""; el.appendChild(img); };
    }
  }
  return el;
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── State ───────────────────────────────────────────────────────────────────

const S = {
  ready: false,
  account: null,
  view: "mail",
  mailboxes: [],
  folder: "INBOX",
  messages: [],
  selectedUid: null,
  selectedMsg: null,
  query: "",
  loginError: "",
  error: "",
  loadingMsgs: false,
  loadingMsg: false,
  sending: false,
  compose: null,
  composeId: 0,
  composeFullPage: false,
  showCc: false,
  showBcc: false,
  sidebarOpen: true,
  mobileSidebar: false,
  selectedUids: [],
  quickReply: "",
  quickSending: false,
  newFolder: "",
  showNewFolder: false,
  signature: null,
  sigOpen: false,
  sigSaving: false,
  sigSaved: false,
  moreMenu: false,
  contacts: [],
  calendarEvents: [],
  calMonth: new Date(),
  calSelected: null,
  calEditing: null,
  contactEditing: null,
};

let _rendering = false;
function set(patch) {
  Object.assign(S, patch);
  if (!_rendering) render();
}

// ─── Login ───────────────────────────────────────────────────────────────────

function renderLogin() {
  return h("main", { className: "flex items-center justify-center min-h-screen bg-white" },
    h("form", {
      className: "w-full max-w-[528px] mx-4 p-8 rounded-lg",
      style: { background: "#284f7d", color: "white" },
      onsubmit: onLogin,
    },
      h("div", { className: "text-center mb-8" },
        h("img", { src: "/brand/bnix-light.png", alt: "BNIX", className: "mx-auto", style: { width: "260px" } }),
      ),
      h("div", { className: "space-y-4" },
        h("input", { name: "email", type: "email", placeholder: "Email address", required: "required", className: "w-full px-4 py-3 rounded-[3px] text-ink text-sm outline-none focus:ring-2 focus:ring-[#68b7ff]" }),
        h("input", { name: "password", type: "password", placeholder: "Password", required: "required", className: "w-full px-4 py-3 rounded-[3px] text-ink text-sm outline-none focus:ring-2 focus:ring-[#68b7ff]" }),
        h("label", { className: "flex items-center gap-2 text-sm opacity-80" },
          h("input", { name: "remember", type: "checkbox", checked: "checked", className: "rounded" }),
          " Stay signed in",
        ),
        S.loginError ? h("p", { className: "text-sm bg-red-500/20 border border-red-400/40 rounded px-3 py-2" }, S.loginError) : null,
        h("button", { type: "submit", className: "w-[170px] py-3 rounded-[3px] text-sm font-medium transition-colors", style: { background: "#3d83bd" }, onmouseover(e) { e.target.style.background = "#4f9ade" }, onmouseout(e) { e.target.style.background = "#3d83bd" } }, "Sign in"),
      ),
    ),
  );
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;
  const remember = form.remember.checked;
  set({ loginError: "" });

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember }),
    });
    set({ account: { email: data.email, domain: data.domain } });
    await bootstrap();
  } catch (err) {
    set({ loginError: err.message || "Login failed" });
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    const [sigData, mbData] = await Promise.all([
      api("/api/settings/signature"),
      api("/api/mailboxes"),
    ]);
    set({
      signature: sigData.settings,
      mailboxes: mbData.mailboxes || [],
      ready: true,
    });
    await loadMessages();
  } catch (err) {
    await doLogout();
    set({ loginError: "Session expired. Please sign in again." });
  }
}

async function loadMessages() {
  set({ loadingMsgs: true, error: "" });
  try {
    const data = await api(`/api/messages?folder=${encodeURIComponent(S.folder)}&limit=60`);
    set({ messages: data.messages || [], loadingMsgs: false });
  } catch (err) {
    set({ error: err.message, loadingMsgs: false });
  }
}

async function loadMessage(uid) {
  set({ loadingMsg: true, selectedUid: uid, selectedMsg: null, quickReply: "" });
  try {
    const data = await api(`/api/messages/${uid}?folder=${encodeURIComponent(S.folder)}`);
    set({ selectedMsg: data.message, loadingMsg: false });
    // Mark as read locally
    const msgs = S.messages.map(m => m.uid === uid ? { ...m, seen: true } : m);
    set({ messages: msgs });
  } catch (err) {
    set({ loadingMsg: false, error: err.message });
  }
}

async function doLogout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  set({
    account: null, ready: false, mailboxes: [], messages: [],
    selectedUid: null, selectedMsg: null, compose: null,
    signature: null, sigOpen: false, loginError: "",
  });
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  const mainFolders = [];
  const customFolders = [];
  for (const mb of S.mailboxes) {
    const info = classifyFolder(mb);
    if (info) mainFolders.push({ ...mb, _info: info });
    else customFolders.push(mb);
  }

  const collapsed = !S.sidebarOpen;
  const w = collapsed ? "w-16" : "w-64";

  const items = [];

  // Header
  items.push(h("div", { className: "flex items-center gap-2 p-3 border-b border-line" },
    h("button", {
      className: "p-1.5 rounded-lg hover:bg-slate-100 text-slate-600",
      onclick() { set({ sidebarOpen: !S.sidebarOpen }); },
      innerHTML: I.menu,
    }),
    !collapsed && S.view === "mail" ? h("button", {
      className: "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover",
      onclick() { openCompose(); },
    }, icon("edit"), "Compose") : null,
  ));

  // View nav
  const views = [
    { key: "mail", icon: "mail", label: "Mail" },
    { key: "contacts", icon: "contact", label: "Contacts" },
    { key: "calendar", icon: "calendar", label: "Calendar" },
  ];
  const viewNav = h("div", { className: "px-2 py-2 space-y-0.5" });
  for (const v of views) {
    const active = S.view === v.key;
    viewNav.appendChild(h("button", {
      className: `folder-item w-full ${active ? "active" : ""} ${collapsed ? "justify-center" : ""}`,
      onclick() {
        set({ view: v.key });
        if (v.key === "contacts" && !S.contacts.length) loadContacts();
        if (v.key === "calendar" && !S.calendarEvents.length) loadCalendarEvents();
      },
    },
      icon(v.icon),
      !collapsed ? h("span", {}, v.label) : null,
    ));
  }
  items.push(viewNav);

  // Folder nav (mail view only)
  if (S.view === "mail") {
    if (!collapsed) {
      // Main folders section
      items.push(h("div", { className: "px-3 pt-3 pb-1" },
        h("div", { className: "text-[11px] font-semibold uppercase text-slate-400 tracking-wider mb-1 px-2" }, "Main"),
      ));
      const mainList = h("div", { className: "px-2 space-y-0.5" });
      for (const mb of mainFolders) {
        const active = S.folder === mb.path;
        mainList.appendChild(h("button", {
          className: `folder-item w-full ${active ? "active" : ""}`,
          onclick() { set({ folder: mb.path, selectedUid: null, selectedMsg: null }); loadMessages(); },
        },
          icon(mb._info.icon),
          h("span", { className: "flex-1 text-left truncate" }, mb._info.label),
          mb.unseen > 0 ? h("span", { className: "bg-blue-500 text-white text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center" }, String(mb.unseen)) : null,
        ));
      }
      items.push(mainList);

      // Custom folders section
      items.push(h("div", { className: "px-3 pt-4 pb-1 flex items-center justify-between" },
        h("div", { className: "text-[11px] font-semibold uppercase text-slate-400 tracking-wider" }, "Folders"),
        h("button", {
          className: "text-slate-400 hover:text-slate-600 p-0.5",
          onclick() { set({ showNewFolder: !S.showNewFolder }); },
          innerHTML: I.plus,
        }),
      ));

      if (S.showNewFolder) {
        const folderForm = h("div", { className: "px-2 pb-2 flex gap-1" });
        const input = h("input", {
          className: "flex-1 px-2 py-1 text-sm border border-line rounded",
          placeholder: "Folder name",
          value: S.newFolder,
        });
        input.addEventListener("input", e => set({ newFolder: e.target.value }));
        input.addEventListener("keydown", e => { if (e.key === "Enter") createFolder(); });
        folderForm.appendChild(input);
        folderForm.appendChild(h("button", {
          className: "px-2 py-1 text-xs bg-brand text-white rounded hover:bg-brand-hover",
          onclick: createFolder,
        }, "Add"));
        items.push(folderForm);
      }

      const custList = h("div", { className: "px-2 space-y-0.5 max-h-[30vh] overflow-y-auto" });
      for (const mb of customFolders) {
        const active = S.folder === mb.path;
        custList.appendChild(h("button", {
          className: `folder-item w-full ${active ? "active" : ""}`,
          style: { paddingLeft: (20 + (mb.depth || 0) * 12) + "px" },
          onclick() { set({ folder: mb.path, selectedUid: null, selectedMsg: null }); loadMessages(); },
        },
          icon("folder"),
          h("span", { className: "flex-1 text-left truncate" }, mb.name || mb.path),
          mb.unseen > 0 ? h("span", { className: "bg-blue-500 text-white text-[11px] font-medium px-1.5 py-0.5 rounded-full" }, String(mb.unseen)) : null,
        ));
      }
      items.push(custList);
    } else {
      // Collapsed folder icons
      const folderIcons = h("div", { className: "px-2 py-2 space-y-1" });
      for (const mb of [...mainFolders, ...customFolders]) {
        const info = mb._info || { icon: "folder" };
        folderIcons.appendChild(h("button", {
          className: `w-full flex justify-center p-2 rounded-lg ${S.folder === mb.path ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`,
          title: mb.name || mb.path,
          onclick() { set({ folder: mb.path, selectedUid: null, selectedMsg: null }); loadMessages(); },
        }, icon(info.icon)));
      }
      items.push(folderIcons);
    }
  }

  // Footer spacer
  items.push(h("div", { className: "flex-1" }));

  // Footer
  const footer = h("div", { className: "border-t border-line p-2 space-y-1" });
  footer.appendChild(h("button", {
    className: `folder-item w-full ${collapsed ? "justify-center" : ""} text-slate-500`,
    onclick() { set({ sigOpen: true }); },
  }, icon("settings"), !collapsed ? h("span", {}, "Signature") : null));
  footer.appendChild(h("button", {
    className: `folder-item w-full ${collapsed ? "justify-center" : ""} text-slate-500`,
    onclick: doLogout,
  }, icon("logout"), !collapsed ? h("span", { className: "truncate text-xs" }, S.account?.email || "Sign out") : null));
  items.push(footer);

  return h("aside", { className: `sidebar-panel ${w} h-full bg-white border-r border-line flex flex-col shrink-0 desktop-only` }, ...items);
}

function renderMobileSidebar() {
  if (!S.mobileSidebar) return h("div", { style: { display: "none" } });

  const overlay = h("div", {
    className: "mobile-overlay fixed inset-0 bg-black/40 z-40 md:hidden",
    onclick() { set({ mobileSidebar: false }); },
  });

  const panel = h("div", { className: "mobile-panel fixed inset-y-0 left-0 z-50 w-[min(86vw,340px)] bg-white shadow-2xl flex flex-col md:hidden" });

  // Header
  panel.appendChild(h("div", { className: "flex items-center justify-between p-4 border-b border-line" },
    h("div", {},
      h("div", { className: "font-semibold text-lg" }, "BNIX Webmail"),
      h("div", { className: "text-xs text-slate-500" }, S.account?.email || ""),
    ),
    h("button", { className: "p-1 rounded hover:bg-slate-100", onclick() { set({ mobileSidebar: false }); }, innerHTML: I.x }),
  ));

  // Compose
  panel.appendChild(h("div", { className: "p-3" },
    h("button", {
      className: "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand text-white text-sm font-medium",
      onclick() { set({ mobileSidebar: false }); openCompose(); },
    }, icon("edit"), "Compose"),
  ));

  // Search
  const searchWrap = h("div", { className: "px-3 pb-2" });
  const searchInput = h("input", {
    className: "w-full px-3 py-2 text-sm border border-line rounded-lg",
    placeholder: "Search messages...",
    value: S.query,
  });
  searchInput.addEventListener("input", e => set({ query: e.target.value }));
  searchWrap.appendChild(searchInput);
  panel.appendChild(searchWrap);

  // View nav
  const views = [
    { key: "mail", icon: "mail", label: "Mail" },
    { key: "contacts", icon: "contact", label: "Contacts" },
    { key: "calendar", icon: "calendar", label: "Calendar" },
  ];
  const viewNav = h("div", { className: "px-2 pb-2 space-y-0.5" });
  for (const v of views) {
    viewNav.appendChild(h("button", {
      className: `folder-item w-full ${S.view === v.key ? "active" : ""}`,
      onclick() {
        set({ view: v.key, mobileSidebar: false });
        if (v.key === "contacts" && !S.contacts.length) loadContacts();
        if (v.key === "calendar" && !S.calendarEvents.length) loadCalendarEvents();
      },
    }, icon(v.icon), h("span", {}, v.label)));
  }
  panel.appendChild(viewNav);

  // Folders (scrollable)
  const folderSection = h("div", { className: "flex-1 overflow-y-auto px-2 pb-2" });
  for (const mb of S.mailboxes) {
    const info = classifyFolder(mb);
    const active = S.folder === mb.path;
    folderSection.appendChild(h("button", {
      className: `folder-item w-full ${active ? "active" : ""}`,
      onclick() {
        set({ folder: mb.path, selectedUid: null, selectedMsg: null, mobileSidebar: false });
        loadMessages();
      },
    },
      icon(info ? info.icon : "folder"),
      h("span", { className: "flex-1 text-left truncate" }, info ? info.label : (mb.name || mb.path)),
      mb.unseen > 0 ? h("span", { className: "bg-blue-500 text-white text-[11px] px-1.5 py-0.5 rounded-full" }, String(mb.unseen)) : null,
    ));
  }
  panel.appendChild(folderSection);

  // Footer
  const footer = h("div", { className: "border-t border-line p-3 space-y-1" });
  footer.appendChild(h("button", {
    className: "folder-item w-full text-slate-500",
    onclick() { set({ sigOpen: true, mobileSidebar: false }); },
  }, icon("settings"), h("span", {}, "Signature")));
  footer.appendChild(h("button", {
    className: "folder-item w-full text-slate-500",
    onclick() { set({ mobileSidebar: false }); doLogout(); },
  }, icon("logout"), h("span", {}, "Sign out")));
  panel.appendChild(footer);

  return h("div", {}, overlay, panel);
}

async function createFolder() {
  const path = S.newFolder.trim();
  if (!path) return;
  try {
    await api("/api/mailboxes", { method: "POST", body: JSON.stringify({ path }) });
    set({ newFolder: "", showNewFolder: false });
    const data = await api("/api/mailboxes");
    set({ mailboxes: data.mailboxes || [] });
  } catch (err) {
    set({ error: err.message });
  }
}

// ─── Message List ────────────────────────────────────────────────────────────

function renderMessageList() {
  const filtered = S.query
    ? S.messages.filter(m =>
        m.subject.toLowerCase().includes(S.query.toLowerCase()) ||
        m.snippet.toLowerCase().includes(S.query.toLowerCase()) ||
        displayName(m.from).toLowerCase().includes(S.query.toLowerCase())
      )
    : S.messages;

  const section = h("section", { className: "flex flex-col h-full bg-white border-r border-line shrink-0 w-full md:w-96" });

  // Header
  const header = h("header", { className: "flex items-center gap-2 h-14 md:h-12 px-3 border-b border-line shrink-0" });

  // Mobile menu
  header.appendChild(h("button", {
    className: "p-1.5 rounded-lg hover:bg-slate-100 md:hidden",
    onclick() { set({ mobileSidebar: true }); },
    innerHTML: I.menu,
  }));

  // Select all / toolbar
  if (S.selectedUids.length > 0) {
    header.appendChild(h("label", { className: "flex items-center gap-2" },
      h("input", {
        type: "checkbox",
        checked: S.selectedUids.length === filtered.length ? "checked" : undefined,
        onchange(e) {
          if (e.target.checked) set({ selectedUids: filtered.map(m => m.uid) });
          else set({ selectedUids: [] });
        },
      }),
    ));
    header.appendChild(h("span", { className: "text-sm text-slate-600 flex-1" }, `${S.selectedUids.length} selected`));

    // Batch actions
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500", title: "Archive",
      onclick: batchArchive, innerHTML: I.archive,
    }));
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500", title: "Delete",
      onclick: batchDelete, innerHTML: I.trash,
    }));
  } else {
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500 desktop-only",
      onclick: loadMessages, innerHTML: I.refresh,
    }));
    header.appendChild(h("div", { className: "flex-1" },
      h("span", { className: "text-sm font-medium" }, S.folder),
      h("span", { className: "text-xs text-slate-400 ml-1" }, `${S.messages.length}`),
    ));
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500 mobile-only",
      onclick: loadMessages, innerHTML: I.refresh,
    }));
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-brand mobile-only",
      onclick: openCompose, innerHTML: I.edit,
    }));
  }

  section.appendChild(header);

  // Mobile search
  const mobileSearch = h("div", { className: "px-3 py-2 border-b border-line mobile-only" });
  const msi = h("input", {
    className: "w-full px-3 py-1.5 text-sm border border-line rounded-lg",
    placeholder: "Search...",
    value: S.query,
  });
  msi.addEventListener("input", e => set({ query: e.target.value }));
  mobileSearch.appendChild(msi);
  section.appendChild(mobileSearch);

  // Error
  if (S.error) {
    section.appendChild(h("div", { className: "bg-red-50 border-b border-red-200 px-3 py-2 text-sm text-red-700" }, S.error));
  }

  // Message list
  const list = h("div", { className: "flex-1 overflow-y-auto" });

  if (S.loadingMsgs) {
    list.appendChild(h("div", { className: "flex items-center justify-center py-12" },
      h("div", { className: "spinner" }),
    ));
  } else if (filtered.length === 0) {
    list.appendChild(h("div", { className: "flex flex-col items-center justify-center py-12 text-slate-400" },
      icon("mail"),
      h("p", { className: "mt-2 text-sm" }, "No conversations"),
    ));
  } else {
    for (const msg of filtered) {
      list.appendChild(renderMessageItem(msg));
    }
  }

  section.appendChild(list);
  return section;
}

function renderMessageItem(msg) {
  const active = S.selectedUid === msg.uid;
  const selected = S.selectedUids.includes(msg.uid);
  const unread = !msg.seen;
  const bg = active ? "bg-blue-100" : unread ? "bg-emerald-50 hover:bg-emerald-100" : "bg-white hover:bg-slate-50";

  const item = h("div", {
    className: `msg-item grid gap-2 px-3 py-2.5 border-b border-line ${bg}`,
    style: { gridTemplateColumns: "20px 40px 1fr auto" },
    onclick(e) {
      if (e.target.type === "checkbox") return;
      loadMessage(msg.uid);
    },
  });

  // Checkbox
  item.appendChild(h("div", { className: "flex items-start pt-2" },
    h("input", {
      type: "checkbox",
      checked: selected ? "checked" : undefined,
      onchange(e) {
        e.stopPropagation();
        if (e.target.checked) set({ selectedUids: [...S.selectedUids, msg.uid] });
        else set({ selectedUids: S.selectedUids.filter(u => u !== msg.uid) });
      },
    }),
  ));

  // Avatar with unseen dot
  const avatarWrap = h("div", { className: "relative" });
  avatarWrap.appendChild(avatarBadge(40, displayEmail(msg.from)));
  if (unread) {
    avatarWrap.appendChild(h("div", {
      className: "absolute -left-2 top-6 w-2 h-2 rounded-full bg-blue-500",
    }));
  }
  item.appendChild(avatarWrap);

  // Content
  const content = h("div", { className: "min-w-0" });
  const fromRow = h("div", { className: "flex items-center gap-1" });
  fromRow.appendChild(h("span", { className: `truncate text-sm ${unread ? "font-semibold" : ""}` }, displayName(msg.from)));
  if (msg.flagged) fromRow.appendChild(h("span", { innerHTML: I.starFill }));
  content.appendChild(fromRow);
  content.appendChild(h("div", { className: `text-sm truncate ${unread ? "font-medium text-ink" : "text-slate-700"}` }, msg.subject || "(No subject)"));
  content.appendChild(h("div", { className: "text-xs text-slate-500 line-clamp-2 mt-0.5" }, msg.snippet || ""));
  item.appendChild(content);

  // Time
  item.appendChild(h("div", { className: "text-xs text-slate-400 whitespace-nowrap pt-1" }, formatTime(msg.date)));

  return item;
}

// ─── Message View ────────────────────────────────────────────────────────────

function renderMessageView() {
  const section = h("section", { className: "flex-1 flex flex-col h-full bg-slate-50 min-w-0" });

  if (!S.selectedUid) {
    section.appendChild(h("div", { className: "flex-1 flex flex-col items-center justify-center text-slate-400" },
      icon("mail"),
      h("p", { className: "mt-2 text-sm" }, "No conversation selected"),
      h("p", { className: "text-xs text-slate-300" }, "Choose a message from the list"),
    ));
    return section;
  }

  if (S.loadingMsg) {
    section.appendChild(h("div", { className: "flex-1 flex items-center justify-center" },
      h("div", { className: "spinner" }),
    ));
    return section;
  }

  const msg = S.selectedMsg;
  if (!msg) return section;

  // Header
  const header = h("header", { className: "bg-white border-b border-line px-4 py-3 shrink-0" });

  // Row 1: Back + Subject + Actions
  const row1 = h("div", { className: "flex items-start gap-3" });

  // Mobile back
  row1.appendChild(h("button", {
    className: "p-1 rounded hover:bg-slate-100 md:hidden mt-0.5",
    onclick() { set({ selectedUid: null, selectedMsg: null }); },
    innerHTML: I.chevL,
  }));

  row1.appendChild(h("h1", { className: "flex-1 text-lg md:text-2xl font-semibold min-w-0 truncate" }, msg.subject || "(No subject)"));

  // Date
  row1.appendChild(h("span", { className: "text-xs text-slate-400 whitespace-nowrap hidden md:block mt-2" }, fullDate(msg.date)));

  // Desktop actions
  const actions = h("div", { className: "hidden md:flex items-center gap-1 shrink-0" });
  actions.appendChild(actionBtn("reply", "Reply", () => openCompose({ replyTo: msg })));
  actions.appendChild(actionBtn("forward", "Forward", () => openCompose({ forward: msg })));
  actions.appendChild(actionBtn("archive", "Archive", () => moveMsg("Archive")));
  actions.appendChild(actionBtn("trash", "Delete", () => deleteMsg()));

  // Star
  actions.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100",
    title: msg.flagged ? "Unstar" : "Star",
    innerHTML: msg.flagged ? I.starFill : I.star,
    onclick() { toggleFlag("\\Flagged", !msg.flagged); },
  }));

  // More menu
  const moreWrap = h("div", { className: "relative" });
  moreWrap.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100 text-slate-500",
    innerHTML: I.more,
    onclick(e) {
      e.stopPropagation();
      set({ moreMenu: !S.moreMenu });
    },
  }));
  if (S.moreMenu) {
    const dropdown = h("div", {
      className: "absolute right-0 top-8 bg-white border border-line rounded-lg shadow-lg py-1 z-50 w-48",
    });
    const menuItems = [
      { label: "Reply All", fn() { openCompose({ replyAll: msg }); } },
      { label: "Forward", fn() { openCompose({ forward: msg }); } },
      { label: msg.seen ? "Mark Unread" : "Mark Read", fn() { toggleFlag("\\Seen", !msg.seen); } },
      { label: "Archive", fn() { moveMsg("Archive"); } },
      { label: "Spam", fn() { moveMsg("Spam"); } },
      { label: "Delete", fn() { deleteMsg(); } },
    ];
    for (const mi of menuItems) {
      dropdown.appendChild(h("button", {
        className: "w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50",
        onclick(e) { e.stopPropagation(); set({ moreMenu: false }); mi.fn(); },
      }, mi.label));
    }
    moreWrap.appendChild(dropdown);
  }
  actions.appendChild(moreWrap);
  row1.appendChild(actions);
  header.appendChild(row1);

  // Mobile actions row
  const mobileActions = h("div", { className: "flex items-center gap-1 mt-2 md:hidden flex-wrap" });
  mobileActions.appendChild(actionBtn("reply", "Reply", () => openCompose({ replyTo: msg })));
  mobileActions.appendChild(actionBtn("forward", "Forward", () => openCompose({ forward: msg })));
  mobileActions.appendChild(actionBtn("archive", "Archive", () => moveMsg("Archive")));
  mobileActions.appendChild(actionBtn("trash", "Delete", () => deleteMsg()));
  mobileActions.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100",
    innerHTML: msg.flagged ? I.starFill : I.star,
    onclick() { toggleFlag("\\Flagged", !msg.flagged); },
  }));
  header.appendChild(mobileActions);

  // Sender info
  const senderRow = h("div", { className: "flex items-center gap-3 mt-3" });
  senderRow.appendChild(avatarBadge(48, displayEmail(msg.from)));
  const senderInfo = h("div", { className: "min-w-0" });
  senderInfo.appendChild(h("div", { className: "font-medium text-sm" }, displayName(msg.from)));
  senderInfo.appendChild(h("div", { className: "text-xs text-slate-500 truncate" }, `<${displayEmail(msg.from)}>`));
  senderInfo.appendChild(h("div", { className: "text-xs text-slate-400" }, `To: ${msg.to ? msg.to.map(a => a.name || a.address).join(", ") : ""}`));
  senderRow.appendChild(senderInfo);
  header.appendChild(senderRow);
  section.appendChild(header);

  // Content
  const content = h("div", { className: "flex-1 overflow-y-auto p-4" });
  const article = h("article", { className: "bg-white rounded-lg border border-line shadow-sm p-6" });

  if (msg.html) {
    const htmlDiv = h("div", { className: "email-html", innerHTML: msg.html });
    article.appendChild(htmlDiv);
  } else if (msg.text) {
    article.appendChild(h("pre", { className: "whitespace-pre-wrap text-sm font-sans" }, msg.text));
  }
  content.appendChild(article);

  // Attachments
  if (msg.attachments && msg.attachments.length > 0) {
    const attSection = h("div", { className: "bg-white rounded-lg border border-line shadow-sm p-4 mt-3" });
    attSection.appendChild(h("h3", { className: "text-sm font-medium mb-2" }, `Attachments (${msg.attachments.length})`));
    const attGrid = h("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2" });
    for (const att of msg.attachments) {
      attGrid.appendChild(h("div", { className: "attachment-item" },
        icon("paperclip"),
        h("span", { className: "flex-1 truncate" }, att.filename || "Untitled"),
        h("span", { className: "text-slate-400 text-xs" }, fileSize(att.size)),
      ));
    }
    attSection.appendChild(attGrid);
    content.appendChild(attSection);
  }

  // Reply actions
  const replyActions = h("div", { className: "flex items-center gap-2 mt-4" });
  replyActions.appendChild(pillBtn("reply", "Reply", () => openCompose({ replyTo: msg })));
  replyActions.appendChild(pillBtn("replyAll", "Reply All", () => openCompose({ replyAll: msg })));
  replyActions.appendChild(pillBtn("forward", "Forward", () => openCompose({ forward: msg })));
  content.appendChild(replyActions);

  // Quick reply
  const qrWrap = h("div", { className: "flex items-center gap-2 mt-4" });
  qrWrap.appendChild(avatarBadge(36, S.account?.email || ""));
  const qrInput = h("input", {
    className: "flex-1 px-3 py-2 text-sm border border-line rounded-full outline-none focus:ring-2 focus:ring-blue-300",
    placeholder: "Write a quick reply...",
    value: S.quickReply,
  });
  qrInput.addEventListener("input", e => set({ quickReply: e.target.value }));
  qrInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuickReply(); } });
  qrWrap.appendChild(qrInput);
  qrWrap.appendChild(h("button", {
    className: "p-2 rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-50",
    disabled: S.quickSending || !S.quickReply.trim() ? "disabled" : undefined,
    onclick: sendQuickReply,
    innerHTML: I.send,
  }));
  content.appendChild(qrWrap);

  section.appendChild(content);
  return section;
}

function actionBtn(iconName, title, fn) {
  return h("button", {
    className: "p-1.5 rounded hover:bg-slate-100 text-slate-500",
    title,
    onclick: fn,
    innerHTML: I[iconName],
  });
}

function pillBtn(iconName, label, fn) {
  return h("button", {
    className: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line text-sm text-slate-600 hover:bg-slate-50",
    onclick: fn,
  }, icon(iconName), label);
}

async function toggleFlag(flag, enabled) {
  if (!S.selectedMsg) return;
  const uid = S.selectedMsg.uid;
  try {
    await api(`/api/messages/${uid}/flags`, {
      method: "PATCH",
      body: JSON.stringify({ folder: S.folder, flag, enabled }),
    });
    if (flag === "\\Seen") {
      set({ selectedMsg: { ...S.selectedMsg, seen: enabled } });
    } else if (flag === "\\Flagged") {
      set({ selectedMsg: { ...S.selectedMsg, flagged: enabled } });
    }
    await loadMessages();
  } catch (err) {
    set({ error: err.message });
  }
}

async function moveMsg(dest) {
  if (!S.selectedMsg) return;
  try {
    await api(`/api/messages/${S.selectedMsg.uid}/move`, {
      method: "POST",
      body: JSON.stringify({ folder: S.folder, destination: dest }),
    });
    set({ selectedUid: null, selectedMsg: null });
    await loadMessages();
  } catch (err) {
    set({ error: err.message });
  }
}

async function deleteMsg() {
  if (!S.selectedMsg) return;
  try {
    await api(`/api/messages/${S.selectedMsg.uid}?folder=${encodeURIComponent(S.folder)}`, { method: "DELETE" });
    set({ selectedUid: null, selectedMsg: null });
    await loadMessages();
  } catch (err) {
    set({ error: err.message });
  }
}

async function batchArchive() {
  for (const uid of S.selectedUids) {
    try {
      await api(`/api/messages/${uid}/move`, {
        method: "POST",
        body: JSON.stringify({ folder: S.folder, destination: "Archive" }),
      });
    } catch {}
  }
  set({ selectedUids: [] });
  await loadMessages();
}

async function batchDelete() {
  for (const uid of S.selectedUids) {
    try {
      await api(`/api/messages/${uid}?folder=${encodeURIComponent(S.folder)}`, { method: "DELETE" });
    } catch {}
  }
  set({ selectedUids: [] });
  await loadMessages();
}

async function sendQuickReply() {
  if (!S.quickReply.trim() || !S.selectedMsg) return;
  set({ quickSending: true });
  try {
    const msg = S.selectedMsg;
    await api("/api/messages/send", {
      method: "POST",
      body: JSON.stringify({
        to: displayEmail(msg.from),
        subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject || ""}`,
        text: S.quickReply,
        html: textToHtml(S.quickReply),
      }),
    });
    set({ quickReply: "", quickSending: false });
  } catch (err) {
    set({ error: err.message, quickSending: false });
  }
}

// ─── Compose ─────────────────────────────────────────────────────────────────

function openCompose(opts = {}) {
  const draft = {
    to: opts.replyTo ? displayEmail(opts.replyTo.from) : opts.replyAll ? [displayEmail(opts.replyAll.from), ...(opts.replyAll.to || []).map(a => a.address)].filter(Boolean).join(", ") : "",
    cc: opts.replyAll ? (opts.replyAll.cc || []).map(a => a.address).filter(Boolean).join(", ") : "",
    bcc: "",
    subject: opts.replyTo || opts.replyAll ? `${(opts.replyTo || opts.replyAll).subject?.startsWith("Re:") ? "" : "Re: "}${(opts.replyTo || opts.replyAll).subject || ""}` : opts.forward ? `Fwd: ${opts.forward.subject || ""}` : "",
    text: "",
    html: "",
    attachments: [],
    fromName: S.signature?.displayName || "",
  };

  if (opts.replyTo || opts.replyAll) {
    const orig = opts.replyTo || opts.replyAll;
    draft.text = `\n\n--- Original Message ---\nFrom: ${displayName(orig.from)} <${displayEmail(orig.from)}>\nDate: ${fullDate(orig.date)}\nSubject: ${orig.subject}\n\n${orig.text || ""}`;
  } else if (opts.forward) {
    draft.text = `\n\n--- Forwarded Message ---\nFrom: ${displayName(opts.forward.from)} <${displayEmail(opts.forward.from)}>\nDate: ${fullDate(opts.forward.date)}\nSubject: ${opts.forward.subject}\n\n${opts.forward.text || ""}`;
  }

  set({ compose: draft, composeId: S.composeId + 1, showCc: !!draft.cc, showBcc: false, composeFullPage: false });
}

function closeCompose() {
  set({ compose: null, showCc: false, showBcc: false });
}

function renderCompose() {
  if (!S.compose) return h("div", { style: { display: "none" } });

  const overlay = h("div", {
    className: "fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30",
    onclick(e) { if (e.target === overlay) closeCompose(); },
  });

  const modal = h("div", {
    className: `compose-modal bg-white flex flex-col ${S.composeFullPage ? "w-full h-full" : "w-full h-full md:max-w-3xl md:h-[85vh] md:rounded-xl"} shadow-2xl`,
    onclick(e) { e.stopPropagation(); },
  });

  // Header
  const hdr = h("div", { className: "flex items-center justify-between h-16 px-4 border-b border-line shrink-0" });
  hdr.appendChild(h("h2", { className: "text-lg font-semibold" }, "New Message"));
  const hdrActions = h("div", { className: "flex items-center gap-1" });
  hdrActions.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100 text-slate-500 hidden md:block",
    title: S.composeFullPage ? "Restore" : "Maximize",
    innerHTML: S.composeFullPage ? I.min : I.max,
    onclick() { set({ composeFullPage: !S.composeFullPage }); },
  }));
  hdrActions.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100 text-slate-500",
    onclick: closeCompose, innerHTML: I.x,
  }));
  hdr.appendChild(hdrActions);
  modal.appendChild(hdr);

  // Form
  const form = h("form", {
    className: "flex-1 flex flex-col overflow-hidden",
    onsubmit: sendCompose,
  });

  // Fields
  const fields = h("div", { className: "px-4 py-3 space-y-2 border-b border-line shrink-0" });

  // From
  fields.appendChild(h("div", { className: "flex items-center gap-2" },
    h("span", { className: "text-sm text-slate-500 w-12" }, "From:"),
    h("span", { className: "text-sm" }, S.account?.email || ""),
  ));

  // To
  const toRow = h("div", { className: "flex items-center gap-2" });
  toRow.appendChild(h("span", { className: "text-sm text-slate-500 w-12" }, "To:"));
  const toInput = h("input", {
    className: "flex-1 px-2 py-1.5 text-sm border border-line rounded outline-none focus:ring-2 focus:ring-blue-300",
    placeholder: "Recipients",
    value: S.compose.to,
  });
  toInput.addEventListener("input", e => { S.compose.to = e.target.value; });
  toRow.appendChild(toInput);
  if (!S.showCc && !S.showBcc) {
    toRow.appendChild(h("button", {
      className: "text-xs text-blue-600 hover:underline",
      type: "button",
      onclick() { set({ showCc: true }); },
    }, "Cc"));
    toRow.appendChild(h("button", {
      className: "text-xs text-blue-600 hover:underline",
      type: "button",
      onclick() { set({ showBcc: true }); },
    }, "Bcc"));
  }
  fields.appendChild(toRow);

  // Cc
  if (S.showCc) {
    fields.appendChild(h("div", { className: "flex items-center gap-2" },
      h("span", { className: "text-sm text-slate-500 w-12" }, "Cc:"),
      (() => { const i = h("input", { className: "flex-1 px-2 py-1.5 text-sm border border-line rounded outline-none focus:ring-2 focus:ring-blue-300", value: S.compose.cc }); i.addEventListener("input", e => { S.compose.cc = e.target.value; }); return i; })(),
    ));
  }

  // Bcc
  if (S.showBcc) {
    fields.appendChild(h("div", { className: "flex items-center gap-2" },
      h("span", { className: "text-sm text-slate-500 w-12" }, "Bcc:"),
      (() => { const i = h("input", { className: "flex-1 px-2 py-1.5 text-sm border border-line rounded outline-none focus:ring-2 focus:ring-blue-300", value: S.compose.bcc }); i.addEventListener("input", e => { S.compose.bcc = e.target.value; }); return i; })(),
    ));
  }

  // Subject
  fields.appendChild(h("div", { className: "flex items-center gap-2" },
    h("span", { className: "text-sm text-slate-500 w-12" }, "Subj:"),
    (() => { const i = h("input", { className: "flex-1 px-2 py-1.5 text-sm border border-line rounded outline-none focus:ring-2 focus:ring-blue-300", value: S.compose.subject }); i.addEventListener("input", e => { S.compose.subject = e.target.value; }); return i; })(),
  ));

  form.appendChild(fields);

  // Rich text toolbar
  const toolbar = h("div", { className: "flex items-center gap-0.5 px-4 h-10 border-b border-line bg-slate-50 shrink-0 overflow-x-auto" });
  toolbar.appendChild(toolbarBtn("bold", () => document.execCommand("bold")));
  toolbar.appendChild(toolbarBtn("italic", () => document.execCommand("italic")));
  toolbar.appendChild(toolbarBtn("underline", () => document.execCommand("underline")));
  toolbar.appendChild(h("div", { className: "w-px h-5 bg-slate-300 mx-1" }));
  toolbar.appendChild(toolbarBtn("list", () => document.execCommand("insertUnorderedList")));
  toolbar.appendChild(toolbarBtn("listOrd", () => document.execCommand("insertOrderedList")));
  toolbar.appendChild(h("div", { className: "w-px h-5 bg-slate-300 mx-1" }));
  toolbar.appendChild(toolbarBtn("link", () => {
    const url = prompt("Enter URL:");
    if (url) document.execCommand("createLink", false, url);
  }));
  form.appendChild(toolbar);

  // Editor
  const editor = h("div", {
    className: "compose-editor flex-1 overflow-y-auto",
    contenteditable: "true",
    "data-placeholder": "Write your message...",
  });
  if (S.compose.text) editor.innerHTML = textToHtml(S.compose.text);
  editor.addEventListener("input", () => { S.compose.html = editor.innerHTML; });
  form.appendChild(editor);

  // Attachments
  if (S.compose.attachments.length > 0) {
    const attDiv = h("div", { className: "px-4 py-2 border-t border-line flex flex-wrap gap-2 shrink-0" });
    for (let i = 0; i < S.compose.attachments.length; i++) {
      const att = S.compose.attachments[i];
      attDiv.appendChild(h("div", { className: "attachment-item" },
        icon("paperclip"),
        h("span", { className: "truncate max-w-[200px]" }, att.name),
        h("button", {
          className: "text-slate-400 hover:text-red-500",
          type: "button",
          innerHTML: I.x,
          onclick() { S.compose.attachments.splice(i, 1); render(); },
        }),
      ));
    }
    form.appendChild(attDiv);
  }

  // Footer
  const footer = h("div", { className: "flex items-center gap-3 px-4 h-16 border-t border-line shrink-0" });
  const fileInput = h("input", { type: "file", multiple: "multiple", className: "hidden" });
  fileInput.addEventListener("change", e => {
    for (const file of e.target.files) {
      if (file.size > 10 * 1024 * 1024) continue; // 10MB limit
      const reader = new FileReader();
      reader.onload = () => {
        S.compose.attachments.push({ name: file.name, type: file.type, size: file.size, data: reader.result });
        render();
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = "";
  });
  footer.appendChild(h("button", {
    className: "p-2 rounded hover:bg-slate-100 text-slate-500",
    type: "button",
    title: "Attach files",
    innerHTML: I.paperclip,
    onclick() { fileInput.click(); },
  }));
  footer.appendChild(fileInput);
  footer.appendChild(h("div", { className: "flex-1" }));
  footer.appendChild(h("button", {
    className: "px-6 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50",
    type: "submit",
    disabled: S.sending ? "disabled" : undefined,
  }, S.sending ? "Sending..." : "Send"));
  form.appendChild(footer);

  form.addEventListener("submit", sendCompose);
  modal.appendChild(form);
  overlay.appendChild(modal);
  return overlay;
}

async function sendCompose(e) {
  if (e) e.preventDefault();
  if (S.sending) return;

  const c = S.compose;
  if (!c) return;

  // Get HTML from editor
  const editor = $(".compose-editor");
  const html = editor ? editor.innerHTML : c.html;

  set({ sending: true });
  try {
    await api("/api/messages/send", {
      method: "POST",
      body: JSON.stringify({
        to: c.to,
        cc: c.cc,
        bcc: c.bcc,
        subject: c.subject,
        text: c.text || editor?.textContent || "",
        html: html,
        fromName: c.fromName || S.signature?.displayName || "",
      }),
    });
    set({ sending: false, compose: null });
    await loadMessages();
  } catch (err) {
    set({ sending: false, error: err.message });
  }
}

function toolbarBtn(iconName, fn) {
  return h("button", {
    className: "toolbar-btn",
    type: "button",
    innerHTML: I[iconName],
    onmousedown(e) { e.preventDefault(); fn(); },
  });
}

// ─── Calendar View ───────────────────────────────────────────────────────────

async function loadCalendarEvents() {
  try {
    const start = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth(), 1);
    const end = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 0, 23, 59, 59);
    const data = await api(`/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`);
    set({ calendarEvents: data.events || [] });
  } catch (err) {
    set({ calendarEvents: [] });
  }
}

function renderCalendarView() {
  const view = h("div", { className: "flex-1 flex flex-col h-full overflow-hidden" });

  // Header
  const hdr = h("div", { className: "flex items-center justify-between px-4 py-3 border-b border-line shrink-0" });
  hdr.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100 md:hidden",
    onclick() { set({ mobileSidebar: true }); },
    innerHTML: I.menu,
  }));
  hdr.appendChild(h("h1", { className: "text-lg font-semibold" }, "Calendar"));
  const navBtns = h("div", { className: "flex items-center gap-1" });
  navBtns.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100",
    innerHTML: I.chevL,
    onclick() {
      const m = new Date(S.calMonth);
      m.setMonth(m.getMonth() - 1);
      set({ calMonth: m });
      loadCalendarEvents();
    },
  }));
  navBtns.appendChild(h("span", { className: "text-sm font-medium min-w-[140px] text-center" },
    S.calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  ));
  navBtns.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100",
    innerHTML: I.chevR,
    onclick() {
      const m = new Date(S.calMonth);
      m.setMonth(m.getMonth() + 1);
      set({ calMonth: m });
      loadCalendarEvents();
    },
  }));
  navBtns.appendChild(h("button", {
    className: "ml-2 px-3 py-1.5 rounded-lg bg-brand text-white text-sm hover:bg-brand-hover",
    onclick() { set({ calEditing: { summary: "", dtstart: "", dtend: "", allDay: false, description: "", location: "" } }); },
  }, "New Event"));
  hdr.appendChild(navBtns);
  view.appendChild(hdr);

  // Calendar grid + detail panel
  const body = h("div", { className: "flex-1 flex overflow-hidden" });

  // Grid
  const gridWrap = h("div", { className: "flex-1 overflow-y-auto p-4" });
  gridWrap.appendChild(renderCalendarGrid());
  body.appendChild(gridWrap);

  // Detail panel (selected day events)
  if (S.calSelected) {
    const panel = h("div", { className: "w-72 border-l border-line overflow-y-auto p-4 hidden md:block" });
    panel.appendChild(h("h3", { className: "font-medium mb-3" }, new Date(S.calSelected).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })));

    const dayEvents = S.calendarEvents.filter(e => e.dtstart?.startsWith(S.calSelected));
    if (dayEvents.length === 0) {
      panel.appendChild(h("p", { className: "text-sm text-slate-400" }, "No events"));
    }
    for (const evt of dayEvents) {
      const card = h("div", { className: "p-3 rounded-lg border border-line mb-2 hover:bg-slate-50 cursor-pointer" },
        h("div", { className: "font-medium text-sm" }, evt.summary || "(No title)"),
        evt.dtstart ? h("div", { className: "text-xs text-slate-500 mt-1 flex items-center gap-1" }, icon("clock"), evt.allDay ? "All day" : new Date(evt.dtstart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })) : null,
        evt.location ? h("div", { className: "text-xs text-slate-500 mt-1 flex items-center gap-1" }, icon("marker"), evt.location) : null,
      );
      card.addEventListener("click", () => set({ calEditing: { ...evt, _editing: true } }));
      panel.appendChild(card);
    }
    body.appendChild(panel);
  }

  view.appendChild(body);

  // Edit modal
  if (S.calEditing) {
    view.appendChild(renderCalendarEditModal());
  }

  return view;
}

function renderCalendarGrid() {
  const year = S.calMonth.getFullYear();
  const month = S.calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid = h("div", { className: "cal-grid rounded-lg overflow-hidden border border-line" });

  // Day headers
  for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    grid.appendChild(h("div", { className: "cal-day-header" }, day));
  }

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(h("div", { className: "bg-slate-50" }));
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = dateStr === new Date().toISOString().slice(0, 10);
    const isSelected = dateStr === S.calSelected;
    const dayEvents = S.calendarEvents.filter(e => e.dtstart?.startsWith(dateStr));

    const cell = h("div", {
      className: `cursor-pointer hover:bg-blue-50 ${isSelected ? "bg-blue-50" : ""}`,
      onclick() { set({ calSelected: dateStr }); },
    });
    cell.appendChild(h("div", {
      className: `text-sm ${isToday ? "bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center" : ""} ${isSelected ? "font-bold" : ""}`,
    }, String(d)));

    // Event dots
    for (const evt of dayEvents.slice(0, 3)) {
      cell.appendChild(h("div", { className: "text-[10px] text-blue-700 truncate mt-0.5 px-0.5" }, evt.summary || "•"));
    }
    if (dayEvents.length > 3) {
      cell.appendChild(h("div", { className: "text-[10px] text-slate-400" }, `+${dayEvents.length - 3} more`));
    }

    grid.appendChild(cell);
  }

  return grid;
}

function renderCalendarEditModal() {
  const evt = S.calEditing;
  const isNew = !evt._editing;

  const overlay = h("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/30",
    onclick(e) { if (e.target === overlay) set({ calEditing: null }); },
  });

  const modal = h("div", {
    className: "bg-white rounded-xl shadow-2xl w-full max-w-md mx-4",
    onclick(e) { e.stopPropagation(); },
  });

  modal.appendChild(h("div", { className: "flex items-center justify-between px-4 py-3 border-b border-line" },
    h("h2", { className: "text-lg font-semibold" }, isNew ? "New Event" : "Edit Event"),
    h("button", { className: "p-1 rounded hover:bg-slate-100", innerHTML: I.x, onclick() { set({ calEditing: null }); } }),
  ));

  const form = h("form", { className: "p-4 space-y-3" });

  form.appendChild(formField("Summary", "text", evt.summary || "", v => { S.calEditing.summary = v; }));
  form.appendChild(formField("Description", "text", evt.description || "", v => { S.calEditing.description = v; }));
  form.appendChild(formField("Location", "text", evt.location || "", v => { S.calEditing.location = v; }));

  // All day toggle
  const allDayRow = h("label", { className: "flex items-center gap-2 text-sm" });
  const allDayCb = h("input", { type: "checkbox" });
  allDayCb.checked = !!evt.allDay;
  allDayCb.addEventListener("change", () => { S.calEditing.allDay = allDayCb.checked; });
  allDayRow.appendChild(allDayCb);
  allDayRow.appendChild(document.createTextNode("All day"));
  form.appendChild(allDayRow);

  form.appendChild(formField("Start", "datetime-local", evt.dtstart ? evt.dtstart.slice(0, 16) : "", v => { S.calEditing.dtstart = v; }));
  form.appendChild(formField("End", "datetime-local", evt.dtend ? evt.dtend.slice(0, 16) : "", v => { S.calEditing.dtend = v; }));

  const actions = h("div", { className: "flex items-center gap-2 pt-2" });
  if (!isNew) {
    actions.appendChild(h("button", {
      className: "px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50",
      type: "button",
      async onclick() {
        try {
          await api(`/api/calendar/${evt.uid}`, { method: "DELETE", body: JSON.stringify({ url: evt.url }) });
          set({ calEditing: null });
          await loadCalendarEvents();
        } catch (err) { set({ error: err.message }); }
      },
    }, "Delete"));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(h("button", {
    className: "px-4 py-2 rounded-lg border border-line text-sm hover:bg-slate-50",
    type: "button",
    onclick() { set({ calEditing: null }); },
  }, "Cancel"));
  actions.appendChild(h("button", {
    className: "px-4 py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-hover",
    type: "button",
    async onclick() {
      try {
        if (isNew) {
          await api("/api/calendar", { method: "POST", body: JSON.stringify(S.calEditing) });
        } else {
          await api(`/api/calendar/${evt.uid}`, { method: "PUT", body: JSON.stringify(S.calEditing) });
        }
        set({ calEditing: null });
        await loadCalendarEvents();
      } catch (err) { set({ error: err.message }); }
    },
  }, isNew ? "Create" : "Save"));
  form.appendChild(actions);

  modal.appendChild(form);
  overlay.appendChild(modal);
  return overlay;
}

// ─── Contacts View ───────────────────────────────────────────────────────────

async function loadContacts() {
  try {
    const data = await api("/api/contacts");
    set({ contacts: data.contacts || [] });
  } catch (err) {
    set({ contacts: [] });
  }
}

function renderContactsView() {
  const view = h("div", { className: "flex-1 flex flex-col h-full overflow-hidden" });

  // Header
  const hdr = h("div", { className: "flex items-center justify-between px-4 py-3 border-b border-line shrink-0" });
  hdr.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100 md:hidden",
    onclick() { set({ mobileSidebar: true }); },
    innerHTML: I.menu,
  }));
  hdr.appendChild(h("h1", { className: "text-lg font-semibold" }, "Contacts"));
  hdr.appendChild(h("button", {
    className: "px-3 py-1.5 rounded-lg bg-brand text-white text-sm hover:bg-brand-hover",
    onclick() { set({ contactEditing: { fn: "", email: "", phone: "", organization: "", title: "", note: "" } }); },
  }, "New Contact"));
  view.appendChild(hdr);

  // Body
  const body = h("div", { className: "flex-1 flex overflow-hidden" });

  // Contact list
  const listWrap = h("div", { className: "w-full md:w-80 overflow-y-auto border-r border-line" });
  if (S.contacts.length === 0) {
    listWrap.appendChild(h("div", { className: "flex flex-col items-center justify-center py-12 text-slate-400" },
      icon("contact"),
      h("p", { className: "mt-2 text-sm" }, "No contacts"),
    ));
  }
  for (const c of S.contacts) {
    const item = h("div", {
      className: "flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-line",
      onclick() { set({ contactEditing: { ...c, _editing: true } }); },
    },
      avatarBadge(36, c.email || c.fn),
      h("div", { className: "min-w-0" },
        h("div", { className: "text-sm font-medium truncate" }, c.fn || "Unknown"),
        h("div", { className: "text-xs text-slate-500 truncate" }, c.email || ""),
      ),
    );
    listWrap.appendChild(item);
  }
  body.appendChild(listWrap);

  // Edit panel
  if (S.contactEditing) {
    body.appendChild(renderContactEditPanel());
  }

  view.appendChild(body);

  return view;
}

function renderContactEditPanel() {
  const c = S.contactEditing;
  const isNew = !c._editing;

  const panel = h("div", { className: "flex-1 overflow-y-auto p-6 max-w-lg" });

  panel.appendChild(h("h2", { className: "text-lg font-semibold mb-4" }, isNew ? "New Contact" : "Edit Contact"));

  const form = h("form", { className: "space-y-4" });
  form.appendChild(formField("Name", "text", c.fn || "", v => { S.contactEditing.fn = v; }));
  form.appendChild(formField("Email", "email", c.email || "", v => { S.contactEditing.email = v; }));
  form.appendChild(formField("Phone", "tel", c.phone || "", v => { S.contactEditing.phone = v; }));
  form.appendChild(formField("Organization", "text", c.organization || "", v => { S.contactEditing.organization = v; }));
  form.appendChild(formField("Title", "text", c.title || "", v => { S.contactEditing.title = v; }));

  const noteLabel = h("label", { className: "block text-sm font-medium text-slate-700" }, "Note");
  const noteInput = h("textarea", {
    className: "w-full px-3 py-2 border border-line rounded-lg text-sm",
    rows: "3",
  });
  noteInput.value = c.note || "";
  noteInput.addEventListener("input", () => { S.contactEditing.note = noteInput.value; });
  form.appendChild(noteLabel);
  form.appendChild(noteInput);

  const actions = h("div", { className: "flex items-center gap-2 pt-4" });
  if (!isNew) {
    actions.appendChild(h("button", {
      className: "px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm hover:bg-red-50",
      type: "button",
      async onclick() {
        try {
          await api(`/api/contacts/${c.uid}`, { method: "DELETE", body: JSON.stringify({ url: c.url, etag: c.etag }) });
          set({ contactEditing: null });
          await loadContacts();
        } catch (err) { set({ error: err.message }); }
      },
    }, "Delete"));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(h("button", {
    className: "px-4 py-2 rounded-lg border border-line text-sm hover:bg-slate-50",
    type: "button",
    onclick() { set({ contactEditing: null }); },
  }, "Cancel"));
  actions.appendChild(h("button", {
    className: "px-4 py-2 rounded-lg bg-brand text-white text-sm hover:bg-brand-hover",
    type: "button",
    async onclick() {
      try {
        if (isNew) {
          await api("/api/contacts", { method: "POST", body: JSON.stringify(S.contactEditing) });
        } else {
          await api(`/api/contacts/${c.uid}`, { method: "PUT", body: JSON.stringify(S.contactEditing) });
        }
        set({ contactEditing: null });
        await loadContacts();
      } catch (err) { set({ error: err.message }); }
    },
  }, isNew ? "Create" : "Save"));
  form.appendChild(actions);

  panel.appendChild(form);
  return panel;
}

function formField(label, type, value, onChange) {
  const wrap = h("div", {});
  wrap.appendChild(h("label", { className: "block text-sm font-medium text-slate-700 mb-1" }, label));
  const input = h("input", {
    className: "w-full px-3 py-2 border border-line rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300",
    type,
    value: value || "",
  });
  input.addEventListener("input", e => onChange(e.target.value));
  wrap.appendChild(input);
  return wrap;
}

// ─── Signature Settings ──────────────────────────────────────────────────────

function renderSignatureModal() {
  if (!S.sigOpen) return h("div", { style: { display: "none" } });

  const sig = S.signature || {};

  const overlay = h("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/30",
    onclick(e) { if (e.target === overlay) set({ sigOpen: false }); },
  });

  const modal = h("div", {
    className: "bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col",
    onclick(e) { e.stopPropagation(); },
  });

  modal.appendChild(h("div", { className: "flex items-center justify-between h-14 px-4 border-b border-line shrink-0" },
    h("h2", { className: "text-lg font-semibold" }, "Signature Settings"),
    h("button", { className: "p-1 rounded hover:bg-slate-100", innerHTML: I.x, onclick() { set({ sigOpen: false }); } }),
  ));

  const body = h("div", { className: "flex-1 overflow-y-auto p-4" });
  const form = h("form", { className: "space-y-4" });

  // Fields grid
  const grid = h("div", { className: "grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3" });
  const sigFields = [
    { key: "displayName", label: "Display name", type: "text" },
    { key: "email", label: "Email address", type: "email", readonly: true },
    { key: "organization", label: "Organization", type: "text" },
    { key: "replyTo", label: "Reply-To", type: "email" },
    { key: "bcc", label: "Blind copy", type: "text" },
  ];
  for (const f of sigFields) {
    grid.appendChild(h("label", { className: "flex items-center text-sm text-slate-600" }, f.label));
    const input = h("input", {
      className: "w-full px-3 py-2 border border-line rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300",
      type: f.type,
      value: sig[f.key] || (f.key === "email" ? S.account?.email : "") || "",
    });
    if (f.readonly) input.setAttribute("readonly", "readonly");
    input.addEventListener("input", () => { if (!S.signature) S.signature = {}; S.signature[f.key] = input.value; });
    grid.appendChild(input);
  }

  // Default toggle
  grid.appendChild(h("label", { className: "flex items-center text-sm text-slate-600" }, "Use by default"));
  const toggleWrap = h("label", { className: "flex items-center gap-2" });
  const toggle = h("input", { type: "checkbox" });
  toggle.checked = sig.defaultEnabled !== false;
  toggle.addEventListener("change", () => { if (!S.signature) S.signature = {}; S.signature.defaultEnabled = toggle.checked; });
  toggleWrap.appendChild(toggle);
  toggleWrap.appendChild(document.createTextNode("Enabled"));
  grid.appendChild(toggleWrap);

  form.appendChild(grid);

  // Signature editor
  form.appendChild(h("h3", { className: "text-sm font-medium text-slate-700 mt-4" }, "Signature"));
  const editorWrap = h("div", { className: "border border-line rounded-lg overflow-hidden" });

  const toolbar = h("div", { className: "flex items-center gap-0.5 px-2 h-10 bg-slate-100 border-b border-line" });
  toolbar.appendChild(toolbarBtn("bold", () => document.execCommand("bold")));
  toolbar.appendChild(toolbarBtn("italic", () => document.execCommand("italic")));
  toolbar.appendChild(toolbarBtn("underline", () => document.execCommand("underline")));
  toolbar.appendChild(h("div", { className: "w-px h-5 bg-slate-300 mx-1" }));
  toolbar.appendChild(h("button", { className: "toolbar-btn", innerHTML: "≡", onmousedown(e) { e.preventDefault(); document.execCommand("justifyLeft"); } }));
  toolbar.appendChild(h("button", { className: "toolbar-btn", innerHTML: "≡", onmousedown(e) { e.preventDefault(); document.execCommand("justifyCenter"); } }));
  toolbar.appendChild(h("div", { className: "w-px h-5 bg-slate-300 mx-1" }));
  toolbar.appendChild(toolbarBtn("link", () => {
    const url = prompt("Enter URL:");
    if (url) document.execCommand("createLink", false, url);
  }));
  editorWrap.appendChild(toolbar);

  const sigEditor = h("div", {
    className: "signature-editor",
    contenteditable: "true",
    "data-placeholder": "Create your signature...",
    innerHTML: sig.html || "",
  });
  editorWrap.appendChild(sigEditor);
  form.appendChild(editorWrap);

  body.appendChild(form);
  modal.appendChild(body);

  // Footer
  const footer = h("div", { className: "flex items-center gap-3 px-4 h-16 border-t border-line shrink-0" });
  if (S.sigSaved) {
    footer.appendChild(h("span", { className: "text-sm text-green-600 flex items-center gap-1" }, icon("check"), "Saved"));
  }
  footer.appendChild(h("div", { className: "flex-1" }));
  footer.appendChild(h("button", {
    className: "px-6 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50",
    type: "button",
    disabled: S.sigSaving ? "disabled" : undefined,
    async onclick() {
      set({ sigSaving: true });
      try {
        const sigEditor = $(".signature-editor");
        const data = {
          displayName: S.signature?.displayName || "",
          email: S.account?.email || "",
          organization: S.signature?.organization || "",
          replyTo: S.signature?.replyTo || "",
          bcc: S.signature?.bcc || "",
          defaultEnabled: S.signature?.defaultEnabled !== false,
          html: sigEditor ? sigEditor.innerHTML : "",
          text: sigEditor ? sigEditor.textContent : "",
        };
        const result = await api("/api/settings/signature", { method: "PUT", body: JSON.stringify(data) });
        set({ sigSaving: false, sigSaved: true, signature: result.settings });
        setTimeout(() => set({ sigSaved: false }), 1800);
      } catch (err) {
        set({ sigSaving: false, error: err.message });
      }
    },
  }, S.sigSaving ? "Saving..." : "Save"));
  modal.appendChild(footer);

  overlay.appendChild(modal);
  return overlay;
}

// ─── Main Render ─────────────────────────────────────────────────────────────

function render() {
  _rendering = true;
  const app = $("#app");
  clear(app);

  // Close more menu on outside click
  if (S.moreMenu) {
    document.addEventListener("click", () => set({ moreMenu: false }), { once: true });
  }

  if (!S.ready) {
    app.appendChild(renderLogin());
  } else {
    const shell = h("div", { className: "flex h-screen overflow-hidden" });
    shell.appendChild(renderSidebar());

    const main = h("div", { className: "flex-1 flex flex-col overflow-hidden min-w-0" });

    if (S.view === "mail") {
      const mailView = h("div", { className: "flex-1 flex overflow-hidden" });

      // Mobile: show list or detail, not both
      if (S.selectedUid && window.innerWidth < 769) {
        mailView.appendChild(renderMessageView());
      } else if (!S.selectedUid && window.innerWidth < 769) {
        mailView.appendChild(renderMessageList());
      } else {
        mailView.appendChild(renderMessageList());
        mailView.appendChild(renderMessageView());
      }

      main.appendChild(mailView);
    } else if (S.view === "contacts") {
      main.appendChild(renderContactsView());
    } else if (S.view === "calendar") {
      main.appendChild(renderCalendarView());
    }

    shell.appendChild(main);
    app.appendChild(shell);
    app.appendChild(renderMobileSidebar());
    app.appendChild(renderCompose());
    app.appendChild(renderSignatureModal());
  }

  _rendering = false;
}

// ─── Init ────────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const data = await api("/api/auth/me");
    if (data.authenticated) {
      S.account = { email: data.email, domain: data.domain };
      await bootstrap();
      return;
    }
  } catch {}
  S.ready = true;
  render();
})();

// Handle window resize
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 100);
});
