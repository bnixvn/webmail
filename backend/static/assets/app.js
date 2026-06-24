/* ════════════════════════════════════════════════════════════════════════════
   BNIX Webmail — Vanilla JS Application
   ════════════════════════════════════════════════════════════════════════════ */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "className") el.className = v;
      else if (k === "innerHTML") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, k);
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

// ─── i18n ────────────────────────────────────────────────────────────────────
const LOCALES = {
  en: {
    // Login
    emailPlaceholder: "Email address",
    passwordPlaceholder: "Password",
    staySignedIn: "Stay signed in",
    serverSettings: "⚙ Mail server settings (optional)",
    serverSettingsHint: "Auto-detected via DNS. Only fill in if auto-detection fails.",
    imapHostPh: "IMAP host", imapPortPh: "IMAP port (993)",
    smtpHostPh: "SMTP host", smtpPortPh: "SMTP port (465)",
    signIn: "Sign in",
    loginFailed: "Login failed",
    sessionExpired: "Session expired. Please sign in again.",
    // Sidebar
    compose: "Compose",
    mail: "Mail", contacts: "Contacts", calendar: "Calendar",
    mainSection: "Main", foldersSection: "Folders",
    folderInbox: "Inbox", folderDrafts: "Drafts", folderSent: "Sent",
    folderArchive: "Archive", folderSpam: "Spam", folderTrash: "Trash",
    folderNamePh: "Folder name", addFolder: "Add",
    signature: "Signature", signOut: "Sign out", darkMode: "Dark mode", lightMode: "Light mode",
    // Message list
    noConversations: "No conversations",
    loadingMailbox: "Loading your mailbox...",
    selected: (n) => `${n} selected`,
    messages: (n) => `${n} messages`,
    // Message view
    noConvSelected: "No conversation selected",
    chooseMessage: "Choose a message from the list",
    to: "To", cc: "Cc",
    reply: "Reply", replyAll: "Reply All", forward: "Forward",
    archive: "Archive", reportSpam: "Report spam", delete: "Delete",
    star: "Star", unstar: "Unstar", markRead: "Mark Read", markUnread: "Mark Unread",
    attachments: (n) => `Attachments (${n})`,
    attachment: (n) => `${n} attachment${n > 1 ? "s" : ""}`,
    quickReplyPh: "Write a quick reply...",
    replyThreadPh: "Reply to thread...",
    sentOk: "Email sent successfully!",
    // Compose
    newMessage: "New Message",
    toPh: "To", ccPh: "Cc", bccPh: "Bcc", subjectPh: "Subject",
    sending: "Sending...", send: "Send",
    // Contacts
    newContact: "New Contact",
    noContacts: "No contacts yet",
    saving: "Saving...", save: "Save", cancel: "Cancel",
    firstName: "First name", lastName: "Last name",
    phone: "Phone", organization: "Organization", title: "Title", notes: "Notes",
    editContact: "Edit Contact", deleteContact: "Delete",
    // Calendar
    newEvent: "New Event", today: "Today",
    eventTitle: "Event title", startDate: "Start", endDate: "End",
    allDay: "All day",
    noEvents: "No events this month",
    deleteEvent: "Delete",
    // Signature modal
    signatureTitle: "Signature Settings",
    displayName: "Display Name", emailAddress: "Email address",
    replyTo: "Reply-To", blindCopy: "Blind copy",
    bcc: "Auto BCC", orgLabel: "Organization",
    useByDefault: "Use by default", enabled: "Enabled",
    signatureSaved: "Saved", signaturePlaceholder: "Create your signature...",
    enterUrl: "Enter URL:",
    enableSig: "Add signature to outgoing email",
    // Search
    searchPh: "Search...", searchMsgsPh: "Search messages...",
    // Calendar extra
    editEvent: "Edit Event", noTitle: "(No title)",
    summary: "Summary", description: "Description", location: "Location",
    removeRecipient: "Remove recipient",
    noSubject: "(No subject)",
    // Compose extra
    from: "From", recipients: "Recipients",
    ccRecipients: "Cc recipients", bccRecipients: "Bcc recipients",
    subj: "Subj",
    restore: "Restore", maximize: "Maximize",
    attachFiles: "Attach files",
    // Contact extra
    name: "Name",
    // Date
    now: "now",
    // Locale for date formatting
    dateLocale: "en-US",
    // Misc
    invalidRecipient: (e) => `Invalid recipient: ${e}`,
    couldNotLoad: (e) => `Could not load mailbox: ${e || "Unknown error"}`,
    threadCount: (n) => `${n} messages`,
  },
  vi: {
    // Đăng nhập
    emailPlaceholder: "Địa chỉ email",
    passwordPlaceholder: "Mật khẩu",
    staySignedIn: "Duy trì đăng nhập",
    serverSettings: "⚙ Cài đặt máy chủ mail (tuỳ chọn)",
    serverSettingsHint: "Tự động phát hiện qua DNS. Chỉ điền nếu tự động thất bại.",
    imapHostPh: "Máy chủ IMAP", imapPortPh: "Cổng IMAP (993)",
    smtpHostPh: "Máy chủ SMTP", smtpPortPh: "Cổng SMTP (465)",
    signIn: "Đăng nhập",
    loginFailed: "Đăng nhập thất bại",
    sessionExpired: "Phiên đã hết hạn. Vui lòng đăng nhập lại.",
    // Sidebar
    compose: "Soạn thư",
    mail: "Thư", contacts: "Danh bạ", calendar: "Lịch",
    mainSection: "Chính", foldersSection: "Thư mục",
    folderInbox: "Hộp thư đến", folderDrafts: "Thư nháp", folderSent: "Đã gửi",
    folderArchive: "Lưu trữ", folderSpam: "Thư rác", folderTrash: "Thùng rác",
    folderNamePh: "Tên thư mục", addFolder: "Thêm",
    signature: "Chữ ký", signOut: "Đăng xuất", darkMode: "Giao diện tối", lightMode: "Giao diện sáng",
    // Danh sách thư
    noConversations: "Không có hội thoại nào",
    loadingMailbox: "Đang tải hộp thư...",
    selected: (n) => `Đã chọn ${n}`,
    messages: (n) => `${n} tin nhắn`,
    // Xem thư
    noConvSelected: "Chưa chọn hội thoại",
    chooseMessage: "Chọn một thư từ danh sách",
    to: "Đến", cc: "CC",
    reply: "Trả lời", replyAll: "Trả lời tất cả", forward: "Chuyển tiếp",
    archive: "Lưu trữ", reportSpam: "Báo spam", delete: "Xoá",
    star: "Đánh dấu", unstar: "Bỏ đánh dấu", markRead: "Đánh dấu đã đọc", markUnread: "Đánh dấu chưa đọc",
    attachments: (n) => `Tệp đính kèm (${n})`,
    attachment: (n) => `${n} tệp đính kèm`,
    quickReplyPh: "Trả lời nhanh...",
    replyThreadPh: "Trả lời hội thoại...",
    sentOk: "Đã gửi email thành công!",
    // Soạn thư
    newMessage: "Thư mới",
    toPh: "Đến", ccPh: "CC", bccPh: "BCC", subjectPh: "Tiêu đề",
    sending: "Đang gửi...", send: "Gửi",
    // Danh bạ
    newContact: "Thêm liên hệ",
    noContacts: "Chưa có liên hệ",
    saving: "Đang lưu...", save: "Lưu", cancel: "Huỷ",
    firstName: "Tên", lastName: "Họ",
    phone: "Điện thoại", organization: "Tổ chức", title: "Chức danh", notes: "Ghi chú",
    editContact: "Sửa liên hệ", deleteContact: "Xoá",
    // Lịch
    newEvent: "Thêm sự kiện", today: "Hôm nay",
    eventTitle: "Tiêu đề sự kiện", startDate: "Bắt đầu", endDate: "Kết thúc",
    allDay: "Cả ngày",
    noEvents: "Không có sự kiện tháng này",
    deleteEvent: "Xoá",
    // Chữ ký
    signatureTitle: "Cài đặt chữ ký",
    displayName: "Tên hiển thị", emailAddress: "Địa chỉ email",
    replyTo: "Reply-To", blindCopy: "Bản sao ẩn",
    bcc: "BCC tự động", orgLabel: "Tổ chức",
    useByDefault: "Dùng mặc định", enabled: "Đã bật",
    signatureSaved: "Đã lưu", signaturePlaceholder: "Tạo chữ ký của bạn...",
    enterUrl: "Nhập URL:",
    enableSig: "Thêm chữ ký vào thư gửi đi",
    // Tìm kiếm
    searchPh: "Tìm kiếm...", searchMsgsPh: "Tìm kiếm thư...",
    // Lịch (bổ sung)
    editEvent: "Sửa sự kiện", noTitle: "(Không có tiêu đề)",
    summary: "Tiêu đề", description: "Mô tả", location: "Địa điểm",
    removeRecipient: "Xoá người nhận",
    noSubject: "(Không có tiêu đề)",
    // Soạn thư (bổ sung)
    from: "Từ", recipients: "Người nhận",
    ccRecipients: "Người nhận CC", bccRecipients: "Người nhận BCC",
    subj: "Tiêu đề",
    restore: "Khôi phục", maximize: "Phóng to",
    attachFiles: "Đính kèm tệp",
    // Danh bạ (bổ sung)
    name: "Tên",
    // Ngày giờ
    now: "vừa xong",
    // Định dạng ngày
    dateLocale: "vi-VN",
    // Misc
    invalidRecipient: (e) => `Người nhận không hợp lệ: ${e}`,
    couldNotLoad: (e) => `Không thể tải hộp thư: ${e || "Lỗi không xác định"}`,
    threadCount: (n) => `${n} tin nhắn`,
  },
};

function getLang() {
  return localStorage.getItem("webmail_lang") || "vi";
}
function setLang(lang) {
  localStorage.setItem("webmail_lang", lang);
  render();
}
function t(key, ...args) {
  const locale = LOCALES[getLang()] || LOCALES.en;
  const val = locale[key] ?? LOCALES.en[key] ?? key;
  return typeof val === "function" ? val(...args) : val;
}

// ─── Icons (Lucide-style SVGs) ───────────────────────────────────────────────

const I = {
  inbox:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  send:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>`,
  file:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  download:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  spam:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4"/><path d="M12 16h.01"/><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z"/></svg>`,
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
  if (mins < 1) return t("now");
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(t("dateLocale"), { month: "short", day: "numeric" });
}

function fullDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString(t("dateLocale"), {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// Prevent mobile browser from scrolling to top when input/contenteditable gets focus
function preventMobileScroll(el) {
  // CSS handles zoom prevention (font-size: 16px) and overscroll-behavior.
  // No JS scroll-locking needed — it causes flickering when the virtual
  // keyboard opens on iOS/Android.
}

function textToHtml(text) {
  if (!text) return "";
  return esc(text).replace(/\n/g, "<br>");
}

const VALID_EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EMAIL_TOKEN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function recipientTokens(value) {
  const tokens = [];
  const seen = new Set();
  for (const part of String(value || "").split(/[\s,;]+/)) {
    const clean = part.trim().replace(/^<|>$/g, "");
    if (!clean) continue;
    const matches = clean.match(EMAIL_TOKEN);
    const values = matches && matches.length ? matches : [clean];
    for (const item of values) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push(item);
      }
    }
  }
  return tokens;
}

function setRecipientTokens(field, tokens, shouldRender = true) {
  S.compose[field] = tokens.join(", ");
  if (shouldRender) render();
}

function addRecipientText(field, value, shouldRender = true) {
  const incoming = recipientTokens(value);
  if (!incoming.length) return false;
  const current = recipientTokens(S.compose[field]);
  const seen = new Set(current.map(v => v.toLowerCase()));
  for (const token of incoming) {
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      current.push(token);
    }
  }
  setRecipientTokens(field, current, shouldRender);
  return true;
}

function collectRecipientInputs() {
  for (const input of $$(".recipient-entry")) {
    const field = input.dataset.recipientField;
    if (field && input.value.trim()) {
      addRecipientText(field, input.value, false);
      input.value = "";
    }
  }
}

// Smart folder matching (supports Vietnamese aliases)
const MAIN_FOLDERS = [
  { match: ["inbox", "hộp thư", "hop thu"], icon: "inbox", label: "Inbox", labelKey: "folderInbox", special: "inbox" },
  { match: ["drafts", "draft", "thư nháp", "thu nhap"], icon: "file", label: "Drafts", labelKey: "folderDrafts", special: "drafts" },
  { match: ["sent", "đã gửi", "da gui", "sent mail", "sent messages"], icon: "send", label: "Sent", labelKey: "folderSent", special: "sent" },
  { match: ["archive", "archives"], icon: "archive", label: "Archive", labelKey: "folderArchive", special: "archive" },
  { match: ["spam", "junk", "thư rác", "thu rac", "bulk"], icon: "spam", label: "Spam", labelKey: "folderSpam", special: "junk" },
  { match: ["trash", "deleted", "thùng rác", "thung rac", "bin"], icon: "trash", label: "Trash", labelKey: "folderTrash", special: "trash" },
];

function classifyFolder(mailbox) {
  const name = (mailbox.name || mailbox.path || "").toLowerCase();
  const leaf = name.split(/[./]/).filter(Boolean).pop() || name;
  const special = (mailbox.specialUse || "").toLowerCase().replace(/^\\/, "");
  for (const f of MAIN_FOLDERS) {
    if (special && (special === f.special || special === f.label.toLowerCase())) return f;
    for (const m of f.match) {
      if (name === m || leaf === m) return f;
    }
  }
  return null;
}

function folderDisplayName(info, fallback = "") {
  if (!info) return fallback;
  return info.labelKey ? t(info.labelKey) : (info.label || fallback);
}

function folderTarget(kind) {
  const wanted = kind.toLowerCase();
  for (const mb of S.mailboxes) {
    const info = classifyFolder(mb);
    if (!info) continue;
    if (info.label.toLowerCase() === wanted) return mb.path;
    if (wanted === "spam" && info.special === "junk") return mb.path;
  }
  const fallback = { archive: "Archive", spam: "Spam", trash: "Trash", drafts: "Drafts", sent: "Sent" };
  return fallback[wanted] || kind;
}

function mailboxRank(mailbox) {
  return (mailbox.path === S.folder ? 1000 : 0) +
    (mailbox.specialUse ? 100 : 0) +
    ((mailbox.unseen || 0) > 0 ? 10 : 0) +
    ((mailbox.total || 0) > 0 ? 1 : 0);
}

function splitMailboxes() {
  const mainByLabel = new Map();
  const customFolders = [];

  for (const mb of S.mailboxes) {
    const info = classifyFolder(mb);
    if (!info) {
      customFolders.push(mb);
      continue;
    }

    const candidate = { ...mb, _info: info };
    const existing = mainByLabel.get(info.label);
    if (!existing || mailboxRank(candidate) > mailboxRank(existing)) {
      mainByLabel.set(info.label, candidate);
    }
  }

  // Sort mainFolders: Inbox first, then \Special-Use order (Drafts, Sent, Archive, Spam, Trash), then custom alphabetical
  const specialOrder = { inbox: 0, drafts: 1, sent: 2, archive: 3, spam: 4, junk: 4, trash: 5 };
  const mainFolders = [...mainByLabel.values()].sort((a, b) => {
    const orderA = specialOrder[a._info.special] ?? 99;
    const orderB = specialOrder[b._info.special] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || a.path || "").localeCompare(b.name || b.path || "");
  });

  // Sort custom folders: alphabetical (respect Unicode — tiếng Việt sorted correctly)
  customFolders.sort((a, b) => (a.name || a.path || "").localeCompare(b.name || b.path || "", "vi"));

  return { mainFolders, customFolders };
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

  function applySources(sources) {
    const src = sources.bimiUrl || sources.gravatarUrl;
    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.onload = () => { el.textContent = ""; el.appendChild(img); };
      img.onerror = () => { img.remove(); };
    }
  }

  if (sources) {
    applySources(sources);
  } else if (email) {
    getAvatarSources(email).then(data => {
      if (data && el.isConnected) applySources(data);
    });
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
    const err = new Error(data.detail || data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
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
  quickAttachments: [],
  quickSending: false,
  expandedThreads: new Set(),
  threadMsgs: [],        // all msgs in current thread (full detail)
  loadingThread: false,
  collapsedMsgs: new Set(), // uids collapsed in thread view
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
  msgOffset: 0,     // current pagination offset
  msgTotal: 0,     // total messages in folder
  msgLimit: 60,    // page size
  loadingMore: false,
};

let _rendering = false;
function set(patch) {
  Object.assign(S, patch);
  if (!_rendering) render();
}

function showToast(msg, type = "success", duration = 3000) {
  const existing = document.getElementById("app-toast");
  if (existing) existing.remove();
  const colors = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };
  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>`,
  };
  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.className = `toast fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg ${colors[type] || colors.success}`;
  toast.style.cssText = "animation: fadeIn 0.25s ease, fadeOut 0.3s ease forwards; animation-delay: 0s, " + (duration / 1000 - 0.3) + "s;";
  toast.innerHTML = (icons[type] || icons.success) + `<span>${msg}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ─── Login ───────────────────────────────────────────────────────────────────

function renderLogin() {
  const isDark = document.documentElement.classList.contains("dark");
  const lang = getLang();

  return h("main", { className: "login-page" },
    // Left panel: background
    h("div", { className: "login-panel-left" },
    ),
    // Right panel: login form
    h("div", { className: "login-panel-right" },
      // Wrapper: centers topbar + form vertically
      h("div", { className: "login-right-wrapper" },
      // Top bar: language + theme
      h("div", { className: "login-topbar" },
        h("div", { className: "login-lang-group" },
          h("button", {
            type: "button",
            className: `login-lang-btn ${lang === "vi" ? "active" : ""}`,
            onclick() { setLang("vi"); },
          }, h("img", { src: "/brand/vietnam.png", alt: "Tiếng Việt", className: "login-flag-img" })),
          h("button", {
            type: "button",
            className: `login-lang-btn ${lang === "en" ? "active" : ""}`,
            onclick() { setLang("en"); },
          }, h("img", { src: "/brand/united-states.png", alt: "English", className: "login-flag-img" })),
        ),
        h("button", {
          type: "button",
          className: "login-theme-btn",
          onclick() {
            const dark = document.documentElement.classList.toggle("dark");
            localStorage.setItem("theme", dark ? "dark" : "light");
            render();
          },
          title: isDark ? t("lightMode") : t("darkMode"),
          innerHTML: isDark
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
        }),
      ),
      // Form
      h("div", { className: "login-center" },
        h("form", { className: "login-form", onsubmit: onLogin },
          h("div", { className: "login-field" },
            h("label", {}, t("emailPlaceholder")),
            h("input", { name: "email", type: "email", placeholder: "name@domain.com", required: "required", autocomplete: "email" }),
          ),
          h("div", { className: "login-field" },
            h("label", {}, t("passwordPlaceholder")),
            h("input", { name: "password", type: "password", placeholder: "••••••••", required: "required", autocomplete: "current-password" }),
          ),
          h("label", { className: "login-remember" },
            h("input", { name: "remember", type: "checkbox", checked: "checked" }),
            h("span", {}, t("staySignedIn")),
          ),
          S.loginError ? h("div", { className: "login-error" }, S.loginError) : null,
          h("button", { type: "submit", className: "login-submit" }, t("signIn")),
          h("div", { className: "login-advanced" },
            h("button", {
              type: "button",
              className: "login-advanced-toggle",
              onclick() {
                const adv = document.getElementById("login-advanced-fields");
                adv.classList.toggle("open");
              },
            },
              h("span", {}, t("serverSettings")),
              h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
                h("polyline", { points: "6 9 12 15 18 9" }),
              ),
            ),
            h("div", { id: "login-advanced-fields", className: "login-advanced-fields" },
              h("p", { className: "login-advanced-hint" }, t("serverSettingsHint")),
              h("div", { className: "login-advanced-grid" },
                h("input", { name: "imapHost", placeholder: t("imapHostPh") }),
                h("input", { name: "imapPort", placeholder: t("imapPortPh") }),
                h("input", { name: "smtpHost", placeholder: t("smtpHostPh") }),
                h("input", { name: "smtpPort", placeholder: t("smtpPortPh") }),
              ),
            ),
          ),
        ),
      ),
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
  const imapHost = form.imapHost?.value.trim() || "";
  const imapPort = form.imapPort?.value.trim() || "";
  const smtpHost = form.smtpHost?.value.trim() || "";
  const smtpPort = form.smtpPort?.value.trim() || "";
  set({ loginError: "" });

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember, imapHost, imapPort, smtpHost, smtpPort }),
    });
    S.account = { email: data.email, domain: data.domain };
    S.ready = false;
    // Show loading while bootstrap runs
    render();
    await bootstrap();
  } catch (err) {
    S.account = null;
    set({ loginError: err.message || t("loginFailed") });
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
    // Only logout on actual auth errors (401/403)
    if (err.status === 401 || err.status === 403) {
      await doLogout();
      set({ loginError: t("sessionExpired") });
    } else {
      // IMAP/other error — stay logged in, show error
      set({ ready: true, error: t("couldNotLoad", err.message) });
      await loadMessages();
    }
  }
}

async function loadMessages(append = false) {
  if (append) {
    if (S.loadingMore) return;
    set({ loadingMore: true, error: "" });
  } else {
    set({ loadingMsgs: true, error: "", selectedUids: [], messages: [], msgOffset: 0 });
  }
  try {
    const offset = append ? S.msgOffset + S.msgLimit : 0;
    const data = await api(`/api/messages?folder=${encodeURIComponent(S.folder)}&limit=${S.msgLimit}&offset=${offset}`);
    const newMessages = data.messages || [];
    set({
      messages: append ? [...S.messages, ...newMessages] : newMessages,
      msgOffset: offset,
      msgTotal: data.total || 0,
      loadingMsgs: false,
      loadingMore: false,
    });
  } catch (err) {
    set({ error: err.message, loadingMsgs: false, loadingMore: false });
  }
}

async function loadMessage(uid) {
  navigate({ uid }); // update URL before loading (no full re-render)
  set({ loadingMsg: true, selectedUid: uid, selectedMsg: null, quickReply: "", quickAttachments: [], threadMsgs: [], loadingThread: false });
  try {
    const data = await api(`/api/messages/${uid}?folder=${encodeURIComponent(S.folder)}`);
    const msg = data.message;
    // Mark as read locally
    const msgs = S.messages.map(m => m.uid === uid ? { ...m, seen: true } : m);
    set({ selectedMsg: msg, loadingMsg: false, messages: msgs, threadMsgs: [], loadingThread: false });
  } catch (err) {
    set({ loadingMsg: false, error: err.message });
  }
}

async function doLogout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  set({
    account: null, mailboxes: [], messages: [],
    selectedUid: null, selectedMsg: null, compose: null,
    signature: null, sigOpen: false, loginError: "",
  });
  window.location.href = "https://webmail.bnix.asia/";
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  const { mainFolders, customFolders } = splitMailboxes();

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
    }, icon("edit"), t("compose")) : null,
  ));

  // View nav
  const views = [
    { key: "mail", icon: "mail", get label() { return t("mail"); } },
    { key: "contacts", icon: "contact", get label() { return t("contacts"); } },
    { key: "calendar", icon: "calendar", get label() { return t("calendar"); } },
  ];
  const viewNav = h("div", { className: "px-2 py-2 space-y-0.5" });
  for (const v of views) {
    const active = S.view === v.key;
    viewNav.appendChild(h("button", {
      className: `folder-item w-full ${active ? "active" : ""} ${collapsed ? "justify-center" : ""}`,
      onclick() {
        navigate({ view: v.key, uid: null });
        set({ view: v.key, selectedUid: null, selectedMsg: null, threadMsgs: [] });
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
        h("div", { className: "text-[11px] font-semibold uppercase text-slate-400 tracking-wider mb-1 px-2" }, t("mainSection")),
      ));
      const mainList = h("div", { className: "px-2 space-y-0.5" });
      for (const mb of mainFolders) {
        const active = S.folder === mb.path;
        mainList.appendChild(h("button", {
          className: `folder-item w-full ${active ? "active" : ""}`,
          onclick() { navigate({ folder: mb.path, uid: null }); set({ folder: mb.path, selectedUid: null, selectedMsg: null, threadMsgs: [] }); loadMessages(); },
        },
          icon(mb._info.icon),
          h("span", { className: "flex-1 text-left truncate" }, folderDisplayName(mb._info)),
          mb.unseen > 0 ? h("span", { className: "bg-blue-500 text-white text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center" }, String(mb.unseen)) : null,
        ));
      }
      items.push(mainList);

      // Custom folders section
      items.push(h("div", { className: "px-3 pt-4 pb-1 flex items-center justify-between" },
        h("div", { className: "text-[11px] font-semibold uppercase text-slate-400 tracking-wider" }, t("foldersSection")),
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
          placeholder: t("folderNamePh"),
          value: S.newFolder,
        });
        input.addEventListener("input", e => set({ newFolder: e.target.value }));
        input.addEventListener("keydown", e => { if (e.key === "Enter") createFolder(); });
        folderForm.appendChild(input);
        folderForm.appendChild(h("button", {
          className: "px-2 py-1 text-xs bg-brand text-white rounded hover:bg-brand-hover",
          onclick: createFolder,
        }, t("addFolder")));
        items.push(folderForm);
      }

      const custList = h("div", { className: "px-2 space-y-0.5 max-h-[30vh] overflow-y-auto" });
      for (const mb of customFolders) {
        const active = S.folder === mb.path;
        custList.appendChild(h("button", {
          className: `folder-item w-full ${active ? "active" : ""}`,
          style: { paddingLeft: (20 + (mb.depth || 0) * 12) + "px" },
          onclick() { navigate({ folder: mb.path, uid: null }); set({ folder: mb.path, selectedUid: null, selectedMsg: null, threadMsgs: [] }); loadMessages(); },
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
          title: folderDisplayName(info, mb.name || mb.path),
          onclick() { navigate({ folder: mb.path, uid: null }); set({ folder: mb.path, selectedUid: null, selectedMsg: null, threadMsgs: [] }); loadMessages(); },
        }, icon(info.icon)));
      }
      items.push(folderIcons);
    }
  }

  // Footer spacer
  items.push(h("div", { className: "flex-1" }));

  // Footer
  const footer = h("div", { className: "border-t border-line p-2 space-y-1" });
  // Language switcher
  if (!collapsed) {
    const langGroup = h("div", { className: "flex items-center gap-1 px-2" });
    langGroup.appendChild(h("button", {
      className: "login-lang-btn",
      onclick() { setLang("vi"); },
    }, h("img", { src: "/brand/vietnam.png", alt: "Tiếng Việt", className: "login-flag-img" })));
    langGroup.appendChild(h("button", {
      className: "login-lang-btn",
      onclick() { setLang("en"); },
    }, h("img", { src: "/brand/united-states.png", alt: "English", className: "login-flag-img" })));
    footer.appendChild(langGroup);
  } else {
    footer.appendChild(h("button", {
      className: "login-lang-btn",
      title: "Tiếng Việt",
      onclick() { setLang("vi"); },
    }, h("img", { src: "/brand/vietnam.png", alt: "Tiếng Việt", className: "login-flag-img" })));
    footer.appendChild(h("button", {
      className: "login-lang-btn",
      title: "English",
      onclick() { setLang("en"); },
    }, h("img", { src: "/brand/united-states.png", alt: "English", className: "login-flag-img" })));
  }
  footer.appendChild(h("button", {
    className: `folder-item w-full ${collapsed ? "justify-center" : ""} text-slate-500`,
    onclick() {
      const isDark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      render();
    },
  }, h("span", { style: { fontSize: "14px" } }, document.documentElement.classList.contains("dark") ? "☀️" : "🌙"), !collapsed ? h("span", {}, document.documentElement.classList.contains("dark") ? t("lightMode") : t("darkMode")) : null));
  footer.appendChild(h("button", {
    className: `folder-item w-full ${collapsed ? "justify-center" : ""} text-slate-500`,
    onclick() { set({ sigOpen: true }); },
  }, icon("settings"), !collapsed ? h("span", {}, t("signature")) : null));
  footer.appendChild(h("button", {
    className: `folder-item w-full ${collapsed ? "justify-center" : ""} text-slate-500`,
    onclick: doLogout,
  }, icon("logout"), !collapsed ? h("span", { className: "truncate text-xs" }, S.account?.email || t("signOut")) : null));
  items.push(footer);

  return h("aside", { className: `sidebar-panel ${w} h-full bg-white dark:bg-slate-800 border-r border-line flex flex-col shrink-0 desktop-only` }, ...items);
}

function renderMobileSidebar() {
  if (!S.mobileSidebar) return h("div", { style: { display: "none" } });

  const overlay = h("div", {
    className: "mobile-overlay fixed inset-0 bg-black/40 z-40 md:hidden",
    onclick() { set({ mobileSidebar: false }); },
  });

  const panel = h("div", { className: "mobile-panel fixed inset-y-0 left-0 z-50 w-[min(86vw,340px)] bg-white dark:bg-slate-800 shadow-2xl flex flex-col md:hidden" });

  // Header
  panel.appendChild(h("div", { className: "flex items-center justify-between p-4 border-b border-line" },
    h("div", {},
      h("div", { className: "font-semibold text-lg" }, "Webmail"),
      h("div", { className: "text-xs text-slate-500" }, S.account?.email || ""),
    ),
    h("button", { className: "p-1 rounded hover:bg-slate-100", onclick() { set({ mobileSidebar: false }); }, innerHTML: I.x }),
  ));

  // Compose
  panel.appendChild(h("div", { className: "p-3" },
    h("button", {
      className: "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand text-white text-sm font-medium",
      onclick() { set({ mobileSidebar: false }); openCompose(); },
    }, icon("edit"), t("compose")),
  ));

  // Search
  const searchWrap = h("div", { className: "px-3 pb-2" });
  const searchInput = h("input", {
    className: "w-full px-3 py-2 text-sm border border-line rounded-lg",
    placeholder: t("searchMsgsPh"),
    value: S.query,
  });
  searchInput.addEventListener("input", e => set({ query: e.target.value }));
  searchWrap.appendChild(searchInput);
  panel.appendChild(searchWrap);

  // View nav
  const views = [
    { key: "mail", icon: "mail", get label() { return t("mail"); } },
    { key: "contacts", icon: "contact", get label() { return t("contacts"); } },
    { key: "calendar", icon: "calendar", get label() { return t("calendar"); } },
  ];
  const viewNav = h("div", { className: "px-2 pb-2 space-y-0.5" });
  for (const v of views) {
    viewNav.appendChild(h("button", {
      className: `folder-item w-full ${S.view === v.key ? "active" : ""}`,
      onclick() {
        navigate({ view: v.key, uid: null });
        set({ view: v.key, selectedUid: null, selectedMsg: null, threadMsgs: [], mobileSidebar: false });
        if (v.key === "contacts" && !S.contacts.length) loadContacts();
        if (v.key === "calendar" && !S.calendarEvents.length) loadCalendarEvents();
      },
    }, icon(v.icon), h("span", {}, v.label)));
  }
  panel.appendChild(viewNav);

  // Folders (scrollable)
  const { mainFolders, customFolders } = splitMailboxes();
  const folderSection = h("div", { className: "flex-1 overflow-y-auto px-2 pb-2" });
  for (const mb of [...mainFolders, ...customFolders]) {
    const info = mb._info || classifyFolder(mb);
    const active = S.folder === mb.path;
    folderSection.appendChild(h("button", {
      className: `folder-item w-full ${active ? "active" : ""}`,
      onclick() {
        navigate({ folder: mb.path, uid: null });
        set({ folder: mb.path, selectedUid: null, selectedMsg: null, threadMsgs: [], mobileSidebar: false });
        loadMessages();
      },
    },
      icon(info ? info.icon : "folder"),
      h("span", { className: "flex-1 text-left truncate" }, folderDisplayName(info, mb.name || mb.path)),
      mb.unseen > 0 ? h("span", { className: "bg-blue-500 text-white text-[11px] px-1.5 py-0.5 rounded-full" }, String(mb.unseen)) : null,
    ));
  }
  panel.appendChild(folderSection);

  // Footer
  const footer = h("div", { className: "border-t border-line p-3 space-y-1" });
  footer.appendChild(h("button", {
    className: "folder-item w-full text-slate-400 text-xs gap-1.5",
    onclick() { setLang(getLang() === "en" ? "vi" : "en"); set({ mobileSidebar: false }); },
  }, h("img", { src: "/brand/vietnam.png", alt: "Tiếng Việt", className: "login-flag-img" }),
     h("img", { src: "/brand/united-states.png", alt: "English", className: "login-flag-img" })));
  footer.appendChild(h("button", {
    className: "folder-item w-full text-slate-500",
    onclick() {
      const isDark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
      set({ mobileSidebar: false });
      render();
    },
  }, h("span", { style: { fontSize: "14px" } }, document.documentElement.classList.contains("dark") ? "☀️" : "🌙"),
     h("span", {}, document.documentElement.classList.contains("dark") ? t("lightMode") : t("darkMode"))));
  footer.appendChild(h("button", {
    className: "folder-item w-full text-slate-500",
    onclick() { set({ sigOpen: true, mobileSidebar: false }); },
  }, icon("settings"), h("span", {}, t("signature"))));
  footer.appendChild(h("button", {
    className: "folder-item w-full text-slate-500",
    onclick() { set({ mobileSidebar: false }); doLogout(); },
  }, icon("logout"), h("span", {}, t("signOut"))));
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

  const section = h("section", { className: "flex flex-col h-full bg-white dark:bg-slate-800 border-r border-line shrink-0 w-full md:w-96" });

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
    header.appendChild(h("span", { className: "text-sm text-slate-600 flex-1" }, t("selected", S.selectedUids.length)));

    // Batch actions
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500", title: "Archive",
      onclick: batchArchive, innerHTML: I.archive,
    }));
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500", title: "Report spam",
      onclick: batchSpam, innerHTML: I.spam,
    }));
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500", title: t("deleteContact"),
      onclick: batchDelete, innerHTML: I.trash,
    }));
  } else {
    header.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500 desktop-only",
      onclick: loadMessages, innerHTML: I.refresh,
    }));
    header.appendChild(h("div", { className: "flex-1" },
      h("span", { className: "text-sm font-medium" }, S.folder),
      h("span", { className: "text-xs text-slate-400 ml-1" }, `${S.messages.length}${S.msgTotal > 0 ? "/" + S.msgTotal : ""}`),
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
    placeholder: t("searchPh"),
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
      h("p", { className: "mt-2 text-sm" }, t("noConversations")),
    ));
  } else {
    for (const msg of filtered) {
      list.appendChild(renderMessageItem(msg));
    }
    // Load More button
    const hasMore = S.messages.length < S.msgTotal;
    if (hasMore || S.loadingMore) {
      const loadMoreBtn = h("button", {
        className: `w-full flex items-center justify-center gap-2 py-3 text-sm border-t border-line ${S.loadingMore ? "text-slate-400 cursor-default" : "text-brand hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"}`,
        disabled: S.loadingMore || undefined,
        onclick() { if (!S.loadingMore) loadMessages(true); },
      }, S.loadingMore
        ? [h("span", { className: "spinner" }), "Loading more..."]
        : `Load more (${S.msgTotal - S.messages.length} remaining)`,
      );
      list.appendChild(loadMoreBtn);
    }
  }

  section.appendChild(list);
  return section;
}

function normalizeSubject(s) {
  return (s || "").replace(/^(Re|Fwd|Tr|Fw):\s*/gi, "").trim().toLowerCase();
}

function groupThreads(messages) {
  // Group messages by normalized subject; keep newest-first order by first message in group
  const map = new Map();
  for (const msg of messages) {
    const key = normalizeSubject(msg.subject);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(msg);
  }
  // Return threads ordered by the newest message uid
  const threads = [];
  for (const [, msgs] of map) {
    threads.push({
      key: normalizeSubject(msgs[0].subject),
      messages: msgs, // already newest-first from server
      latest: msgs[0],
      count: msgs.length,
      hasUnread: msgs.some(m => !m.seen),
      hasFlagged: msgs.some(m => m.flagged),
    });
  }
  threads.sort((a, b) => b.latest.uid - a.latest.uid);
  return threads;
}

function renderThreadItem(thread) {
  const { latest, messages, count, hasUnread, hasFlagged } = thread;
  const isSingle = count === 1;
  const isExpanded = S.expandedThreads?.has(thread.key);
  const active = isSingle
    ? S.selectedUid === latest.uid
    : messages.some(m => m.uid === S.selectedUid);

  const bg = active
    ? "bg-blue-100 dark:bg-blue-900/40"
    : hasUnread
    ? "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
    : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-blue-900/40";

  if (isSingle) {
    return renderMessageItem(latest);
  }

  // Multi-message thread
  const wrap = h("div", { className: "border-b border-line" });

  // Thread header row
  const item = h("div", {
    className: `msg-item grid gap-2 px-3 py-2.5 ${bg} cursor-pointer`,
    style: { gridTemplateColumns: "20px 40px 1fr auto" },
    onclick(e) {
      if (e.target.type === "checkbox") return;
      if (!S.expandedThreads) S.expandedThreads = new Set();
      if (isExpanded) {
        S.expandedThreads.delete(thread.key);
        set({ expandedThreads: new Set(S.expandedThreads) });
      } else {
        S.expandedThreads.add(thread.key);
        set({ expandedThreads: new Set(S.expandedThreads) });
        // Auto-open first unread or latest
        const toOpen = messages.find(m => !m.seen) || latest;
        loadMessage(toOpen.uid);
      }
    },
  });

  // Checkbox column
  item.appendChild(h("div", { className: "flex items-start pt-2" },
    h("input", {
      type: "checkbox",
      checked: messages.every(m => S.selectedUids.includes(m.uid)) ? "checked" : undefined,
      onchange(e) {
        e.stopPropagation();
        const uids = messages.map(m => m.uid);
        if (e.target.checked) set({ selectedUids: [...new Set([...S.selectedUids, ...uids])] });
        else set({ selectedUids: S.selectedUids.filter(u => !uids.includes(u)) });
      },
    }),
  ));

  // Avatar with unread dot
  const avatarWrap = h("div", { className: "relative" });
  avatarWrap.appendChild(avatarBadge(40, displayEmail(latest.from)));
  if (hasUnread) {
    avatarWrap.appendChild(h("div", { className: "absolute -left-2 top-6 w-2 h-2 rounded-full bg-blue-500" }));
  }
  item.appendChild(avatarWrap);

  // Content
  const content = h("div", { className: "min-w-0" });
  const fromRow = h("div", { className: "flex items-center gap-1.5" });
  fromRow.appendChild(h("span", { className: `truncate text-sm ${hasUnread ? "font-semibold" : ""}` }, displayName(latest.from)));
  if (hasFlagged) fromRow.appendChild(h("span", { innerHTML: I.starFill }));
  // Thread count badge
  fromRow.appendChild(h("span", {
    className: "shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-medium " + (hasUnread ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-600"),
  }, String(count)));
  // Expand/collapse indicator
  fromRow.appendChild(h("span", {
    className: "shrink-0 text-slate-400",
    innerHTML: isExpanded
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
  }));
  content.appendChild(fromRow);
  content.appendChild(h("div", { className: `text-sm truncate ${hasUnread ? "font-medium text-ink" : "text-slate-700"}` }, latest.subject || t("noSubject")));
  content.appendChild(h("div", { className: "text-xs text-slate-500 line-clamp-2 mt-0.5" }, latest.snippet || ""));
  item.appendChild(content);
  item.appendChild(h("div", { className: "text-xs text-slate-400 whitespace-nowrap pt-1" }, formatTime(latest.date)));

  wrap.appendChild(item);

  // Expanded thread messages
  if (isExpanded) {
    const subList = h("div", { className: "border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" });
    for (const msg of messages) {
      const subActive = S.selectedUid === msg.uid;
      const subUnread = !msg.seen;
      const subBg = subActive ? "bg-blue-100 dark:bg-blue-900/40" : subUnread ? "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30" : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-blue-900/40";
      const subItem = h("div", {
        className: `flex items-start gap-3 pl-8 pr-3 py-2 border-b border-line cursor-pointer ${subBg}`,
        onclick() { loadMessage(msg.uid); },
      });
      subItem.appendChild(avatarBadge(32, displayEmail(msg.from)));
      const subContent = h("div", { className: "flex-1 min-w-0" });
      subContent.appendChild(h("div", { className: `text-sm truncate ${subUnread ? "font-semibold" : ""}` }, displayName(msg.from)));
      subContent.appendChild(h("div", { className: "text-xs text-slate-500 truncate" }, msg.snippet || ""));
      subItem.appendChild(subContent);
      subItem.appendChild(h("div", { className: "text-xs text-slate-400 whitespace-nowrap" }, formatTime(msg.date)));
      subList.appendChild(subItem);
    }
    wrap.appendChild(subList);
  }

  return wrap;
}

function renderMessageItem(msg, inThread, isReply) {
  const active = S.selectedUid === msg.uid;
  const selected = S.selectedUids.includes(msg.uid);
  const unread = !msg.seen;
  const bg = active ? "bg-blue-100 dark:bg-blue-900/40" : unread ? "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30" : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-blue-900/40";
  const indent = inThread ? "pl-8" : "px-3";

  const item = h("div", {
    className: `msg-item grid gap-2 ${indent} pr-3 py-2.5 border-b border-line ${bg} cursor-pointer`,
    style: { gridTemplateColumns: inThread ? "28px 1fr auto" : "20px 40px 1fr auto" },
    onclick(e) {
      if (e.target.type === "checkbox") return;
      loadMessage(msg.uid);
    },
  });

  if (inThread) {
    // Thread child: reply icon or bullet
    const replyIcon = isReply
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`
      : `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>`;
    item.appendChild(h("div", { className: "flex items-center justify-center text-slate-400 pt-0.5", innerHTML: replyIcon }));
  } else {
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
  }

  // Content
  const content = h("div", { className: "min-w-0" });
  const fromRow = h("div", { className: "flex items-center gap-1" });
  fromRow.appendChild(h("span", { className: `truncate text-sm ${unread ? "font-semibold" : ""}` }, displayName(msg.from)));
  if (msg.flagged) fromRow.appendChild(h("span", { innerHTML: I.starFill }));
  content.appendChild(fromRow);
  content.appendChild(h("div", { className: `text-sm truncate ${unread ? "font-medium text-ink" : "text-slate-700"}` }, msg.subject || t("noSubject")));
  if (!inThread) {
    content.appendChild(h("div", { className: "text-xs text-slate-500 line-clamp-2 mt-0.5" }, msg.snippet || ""));
  }
  item.appendChild(content);

  // Time
  item.appendChild(h("div", { className: "text-xs text-slate-400 whitespace-nowrap pt-1" }, formatTime(msg.date)));

  return item;
}

// ─── Thread Panel (Roundcube-style vertical list) ───────────────────────────
// Panel giữa hiển thị tất cả mail trong thread.
// Click chọn mail → hiển thị nội dung ở reading pane bên phải.

function renderThreadPanel() {
  const section = h("section", {
    className: "flex flex-col h-full bg-white dark:bg-slate-800 border-r border-line shrink-0 w-72 overflow-hidden",
  });

  // Header
  const hdr = h("div", { className: "shrink-0 px-3 py-2 border-b border-line" });
  hdr.appendChild(h("span", { className: "text-xs font-medium text-slate-500" },
    t("threadCount", S.threadMsgs.length),
  ));
  section.appendChild(hdr);

  // Scrollable message list
  const list = h("div", { className: "flex-1 overflow-y-auto" });
  for (const msg of S.threadMsgs) {
    const isActive = S.selectedUid === msg.uid;
    const isUnread = !msg.seen;
    const bg = isActive
      ? "bg-blue-50 dark:bg-blue-900/30"
      : isUnread
      ? "bg-emerald-50/50 dark:bg-emerald-900/10"
      : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700";

    const item = h("div", {
      className: `flex items-start gap-2.5 px-3 py-2.5 border-b border-line cursor-pointer ${bg}`,
      onclick() { loadMessage(msg.uid); },
    });

    // Avatar
    item.appendChild(avatarBadge(32, displayEmail(msg.from)));

    // Content
    const content = h("div", { className: "flex-1 min-w-0" });
    const fromRow = h("div", { className: "flex items-center justify-between gap-1" });
    fromRow.appendChild(h("span", {
      className: `text-xs truncate ${isUnread ? "font-semibold" : "text-slate-700"}`
    }, displayName(msg.from)));
    fromRow.appendChild(h("span", { className: "text-[10px] text-slate-400 shrink-0" }, formatTime(msg.date)));
    content.appendChild(fromRow);

    // Snippet
    content.appendChild(h("div", {
      className: "text-xs text-slate-500 line-clamp-2 mt-0.5 truncate"
    }, msg.snippet || ""));

    item.appendChild(content);
    list.appendChild(item);
  }

  section.appendChild(list);
  return section;
}

// ─── Thread View ────────────────────────────────────────────────────────────

// Reusable quick-reply builder (textarea + attachments)
function renderQuickReply(placeholder) {
  const outer = h("div", { className: "qr-outer" });

  // Border wrapper
  const wrap = h("div", { className: "qr-rich-wrap" });

  // Toolbar: just attach button
  const toolbar = h("div", { className: "flex items-center gap-1 px-2 py-1 border border-b-0 border-line rounded-t-lg bg-slate-50" });
  const fileInput = h("input", { type: "file", multiple: "multiple", className: "hidden" });
  toolbar.appendChild(h("button", {
    className: "toolbar-btn",
    type: "button",
    title: t("attachFiles"),
    innerHTML: I.paperclip,
    onclick() { fileInput.click(); },
  }));
  toolbar.appendChild(fileInput);
  wrap.appendChild(toolbar);

  // Editor — textarea so Enter = newline, Shift+Enter = send
  const editor = h("textarea", {
    className: "qr-editor border border-line rounded-b-lg px-3 py-2 text-sm outline-none resize-none w-full",
    placeholder,
    rows: 3,
  });
  if (S.quickReply) editor.value = S.quickReply;
  wrap.appendChild(editor);
  outer.appendChild(wrap);

  // Auto-grow textarea as user types
  editor.addEventListener("input", () => {
    editor.style.height = "auto";
    editor.style.height = editor.scrollHeight + "px";
  });

  // Attachment previews
  const attContainer = h("div", { className: "flex flex-wrap gap-1 mt-1" });
  function renderAttPreviews() {
    clear(attContainer);
    for (let i = 0; i < S.quickAttachments.length; i++) {
      const att = S.quickAttachments[i];
      attContainer.appendChild(h("div", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600" },
        icon("paperclip"),
        h("span", { className: "truncate max-w-[140px]" }, att.name),
        h("button", {
          className: "text-slate-400 hover:text-red-500 leading-none",
          type: "button",
          innerHTML: "&times;",
          onclick() { S.quickAttachments.splice(i, 1); renderAttPreviews(); updateSendBtn(); },
        }),
      ));
    }
  }
  renderAttPreviews();
  outer.appendChild(attContainer);

  // Send button
  const bottomRow = h("div", { className: "flex items-center justify-end mt-2" });
  const sendBtn = h("button", {
    className: "qr-send-btn p-2 rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-50",
    disabled: "disabled",
    onclick: sendQuickReply,
    innerHTML: I.send,
  });
  bottomRow.appendChild(sendBtn);
  outer.appendChild(bottomRow);

  // Logic
  function updateSendBtn() {
    const hasContent = editor.value.trim().length > 0;
    sendBtn.disabled = S.quickSending || (!hasContent && S.quickAttachments.length === 0);
  }

  editor.addEventListener("input", () => {
    S.quickReply = editor.value;
    updateSendBtn();
  });

  // Ctrl/Cmd+Enter to send; plain Enter = newline
  editor.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      sendQuickReply();
    }
  });

  fileInput.addEventListener("change", e => {
    for (const file of e.target.files) {
      if (file.size > 10 * 1024 * 1024) continue;
      const reader = new FileReader();
      reader.onload = () => {
        S.quickAttachments.push({ name: file.name, type: file.type, size: file.size, data: reader.result });
        renderAttPreviews();
        updateSendBtn();
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = "";
  });

  updateSendBtn();
  outer._qrEditor = editor;
  outer._qrSendBtn = sendBtn;
  return outer;
}

function renderThreadMsgBubble(m, isLast) {
  const msgKey = `${m.uid}|${m.folder || S.folder}`;
  const isCollapsed = S.collapsedMsgs.has(msgKey);
  const wrap = h("div", { className: "thread-bubble bg-white dark:bg-slate-800 rounded-lg border border-line shadow-sm mb-3 overflow-hidden" });

  // Header row — always visible, click to toggle
  const hdr = h("div", {
    className: `flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-slate-50 ${isCollapsed ? "" : "border-b border-line"}`,
    onclick() {
      const next = new Set(S.collapsedMsgs);
      if (isCollapsed) {
        next.delete(msgKey);
      } else {
        next.add(msgKey);
      }
      set({ collapsedMsgs: next });
    },
  });
  hdr.appendChild(avatarBadge(36, displayEmail(m.from)));
  const hdrInfo = h("div", { className: "flex-1 min-w-0" });
  hdrInfo.appendChild(h("div", { className: "flex items-center gap-2 min-w-0" },
    h("span", { className: "font-medium text-sm truncate" }, displayName(m.from)),
    h("span", { className: "text-xs text-slate-400 whitespace-nowrap ml-auto pl-2" }, fullDate(m.date)),
  ));
  if (isCollapsed) {
    hdrInfo.appendChild(h("div", { className: "text-xs text-slate-400 truncate mt-0.5" }, m.snippet || ""));
  } else {
    hdrInfo.appendChild(h("div", { className: "text-xs text-slate-400 truncate mt-0.5" },
      `To: ${(m.to || []).map(a => a.name || a.address).join(", ")}`,
    ));
  }
  hdr.appendChild(hdrInfo);
  // Action icons in header (only when expanded)
  if (!isCollapsed) {
    const hdrActions = h("div", { className: "flex items-center gap-0.5 shrink-0" });
    hdrActions.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500",
      title: "Reply",
      innerHTML: I.reply,
      onclick(e) { e.stopPropagation(); openCompose({ replyTo: m }); },
    }));
    hdrActions.appendChild(h("button", {
      className: "p-1.5 rounded hover:bg-slate-100 text-slate-500",
      title: "Forward",
      innerHTML: I.forward,
      onclick(e) { e.stopPropagation(); openCompose({ forward: m }); },
    }));
    hdr.appendChild(hdrActions);
  }
  wrap.appendChild(hdr);

  if (!isCollapsed) {
    // Body
    const body = h("div", { className: "px-6 py-4" });
    if (m.html) {
      body.appendChild(h("div", { className: "email-html", innerHTML: m.html }));
    } else if (m.text) {
      body.appendChild(h("pre", { className: "whitespace-pre-wrap text-sm font-sans" }, m.text));
    } else {
      body.appendChild(h("p", { className: "text-sm text-slate-400 italic" }, "(No content)"));
    }
    wrap.appendChild(body);

    // Attachments
    const visibleAtts = (m.attachments || []).filter(a =>
      !(a.disposition === "inline" && a.cid && (a.contentType || "").startsWith("image/"))
    );
    if (visibleAtts.length > 0) {
      const attSec = h("div", { className: "border-t border-line px-4 py-3" });
      attSec.appendChild(h("p", { className: "text-xs font-medium text-slate-500 mb-2" }, t("attachment", visibleAtts.length)));
      const attGrid = h("div", { className: "flex flex-wrap gap-2" });
      for (const att of visibleAtts) {
        const openUrl = `/api/messages/${m.uid}/attachments/${att.index}?folder=${encodeURIComponent(m.folder || S.folder)}`;
        attGrid.appendChild(h("a", {
          className: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line text-xs text-slate-600 hover:bg-slate-50",
          href: openUrl,
          target: "_blank",
          rel: "noopener",
        }, icon("paperclip"), att.filename || "file", h("span", { className: "text-slate-400" }, fileSize(att.size))));
      }
      attSec.appendChild(attGrid);
      wrap.appendChild(attSec);
    }
  }

  return wrap;
}

function renderThreadView(section, threadMsgs) {
  const lastMsg = threadMsgs[threadMsgs.length - 1];

  // Shared header: subject + common actions
  const header = h("header", { className: "bg-white dark:bg-slate-800 border-b border-line px-4 py-3 shrink-0" });
  const row1 = h("div", { className: "flex items-start gap-3" });
  row1.appendChild(h("button", {
    className: "p-1 rounded hover:bg-slate-100 md:hidden mt-0.5",
    onclick() { navigate({ uid: null }); set({ selectedUid: null, selectedMsg: null, threadMsgs: [] }); },
    innerHTML: I.chevL,
  }));
  row1.appendChild(h("h1", { className: "flex-1 text-lg md:text-2xl font-semibold min-w-0 truncate" },
    lastMsg.subject || t("noSubject"),
  ));
  const threadCount = h("span", { className: "shrink-0 text-xs text-slate-400 whitespace-nowrap mt-2" },
    t("threadCount", threadMsgs.length),
  );
  row1.appendChild(threadCount);
  // Desktop actions (act on last msg)
  const actions = h("div", { className: "hidden md:flex items-center gap-1 shrink-0" });
  actions.appendChild(actionBtn("reply", t("reply"), () => openCompose({ replyTo: lastMsg })));
  actions.appendChild(actionBtn("forward", t("forward"), () => openCompose({ forward: lastMsg })));
  actions.appendChild(actionBtn("trash", t("delete"), () => deleteMsg()));
  actions.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100",
    title: lastMsg.flagged ? t("unstar") : t("star"),
    innerHTML: lastMsg.flagged ? I.starFill : I.star,
    onclick() { toggleFlag("\\Flagged", !lastMsg.flagged); },
  }));
  row1.appendChild(actions);
  header.appendChild(row1);
  // Mobile actions
  const mobileActions = h("div", { className: "flex items-center gap-1 mt-2 md:hidden" });
  mobileActions.appendChild(actionBtn("reply", t("reply"), () => openCompose({ replyTo: lastMsg })));
  mobileActions.appendChild(actionBtn("forward", t("forward"), () => openCompose({ forward: lastMsg })));
  mobileActions.appendChild(actionBtn("trash", t("delete"), () => deleteMsg()));
  header.appendChild(mobileActions);
  section.appendChild(header);

  // Scrollable thread
  const scroll = h("div", { className: "flex-1 overflow-y-auto px-4 py-4" });

  // Loading indicator for thread fetch
  if (S.loadingThread) {
    scroll.appendChild(h("div", { className: "flex items-center justify-center py-6" },
      h("div", { className: "spinner" }),
    ));
  }

  // Render each bubble
  for (let i = 0; i < threadMsgs.length; i++) {
    scroll.appendChild(renderThreadMsgBubble(threadMsgs[i], i === threadMsgs.length - 1));
  }

  // Quick reply at bottom
  const qrOuter = h("div", { className: "mt-2 mb-2 flex items-start gap-2" });
  qrOuter.appendChild(avatarBadge(36, S.account?.email || ""));
  const qrInner = h("div", { className: "flex-1" });
  qrInner.appendChild(renderQuickReply(t("replyThreadPh")));
  qrOuter.appendChild(qrInner);
  scroll.appendChild(qrOuter);

  section.appendChild(scroll);
  return section;
}

// ─── Message View ────────────────────────────────────────────────────────────

function renderMessageView() {
  const section = h("section", { className: "flex-1 flex flex-col h-full bg-slate-50 min-w-0" });

  if (!S.selectedUid) {
    section.appendChild(h("div", { className: "flex-1 flex flex-col items-center justify-center text-slate-400" },
      icon("mail"),
      h("p", { className: "mt-2 text-sm" }, t("noConvSelected")),
      h("p", { className: "text-xs text-slate-300" }, t("chooseMessage")),
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

  // ── Single message view ────────────────────────────────────────────────

  // Header
  const header = h("header", { className: "bg-white dark:bg-slate-800 border-b border-line px-4 py-3 shrink-0" });

  // Row 1: Back + Subject + Actions
  const row1 = h("div", { className: "flex items-start gap-3" });

  // Mobile back
  row1.appendChild(h("button", {
    className: "p-1 rounded hover:bg-slate-100 md:hidden mt-0.5",
    onclick() { navigate({ uid: null }); set({ selectedUid: null, selectedMsg: null, threadMsgs: [] }); },
    innerHTML: I.chevL,
  }));

  row1.appendChild(h("h1", { className: "flex-1 text-lg md:text-2xl font-semibold min-w-0 truncate" }, msg.subject || t("noSubject")));

  // Date
  row1.appendChild(h("span", { className: "text-xs text-slate-400 whitespace-nowrap hidden md:block mt-2" }, fullDate(msg.date)));

  // Desktop actions
  const actions = h("div", { className: "hidden md:flex items-center gap-1 shrink-0" });
  actions.appendChild(actionBtn("reply", t("reply"), () => openCompose({ replyTo: msg })));
  actions.appendChild(actionBtn("forward", t("forward"), () => openCompose({ forward: msg })));
  actions.appendChild(actionBtn("archive", t("archive"), () => moveMsg(folderTarget("archive"))));
  actions.appendChild(actionBtn("spam", t("reportSpam"), () => moveMsg(folderTarget("spam"))));
  actions.appendChild(actionBtn("trash", t("delete"), () => deleteMsg()));

  // Star
  actions.appendChild(h("button", {
    className: "p-1.5 rounded hover:bg-slate-100",
    title: msg.flagged ? t("unstar") : t("star"),
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
      className: "absolute right-0 top-8 bg-white dark:bg-slate-700 border border-line rounded-lg shadow-lg py-1 z-50 w-48",
    });
    const menuItems = [
      { label: t("replyAll"), fn() { openCompose({ replyAll: msg }); } },
      { label: t("forward"), fn() { openCompose({ forward: msg }); } },
      { label: msg.seen ? t("markUnread") : t("markRead"), fn() { toggleFlag("\\Seen", !msg.seen); } },
      { label: t("archive"), fn() { moveMsg(folderTarget("archive")); } },
      { label: t("reportSpam"), fn() { moveMsg(folderTarget("spam")); } },
      { label: t("delete"), fn() { deleteMsg(); } },
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
  mobileActions.appendChild(actionBtn("reply", t("reply"), () => openCompose({ replyTo: msg })));
  mobileActions.appendChild(actionBtn("forward", t("forward"), () => openCompose({ forward: msg })));
  mobileActions.appendChild(actionBtn("archive", t("archive"), () => moveMsg(folderTarget("archive"))));
  mobileActions.appendChild(actionBtn("spam", t("reportSpam"), () => moveMsg(folderTarget("spam"))));
  mobileActions.appendChild(actionBtn("trash", t("delete"), () => deleteMsg()));
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
  const article = h("article", { className: "bg-white dark:bg-slate-800 rounded-lg border border-line shadow-sm p-6" });

  if (msg.html) {
    const htmlDiv = h("div", { className: "email-html", innerHTML: msg.html });
    article.appendChild(htmlDiv);
  } else if (msg.text) {
    article.appendChild(h("pre", { className: "whitespace-pre-wrap text-sm font-sans" }, msg.text));
  }
  content.appendChild(article);

  // Attachments
  const visibleAttachments = (msg.attachments || []).filter(att =>
    !(att.disposition === "inline" && att.cid && (att.contentType || "").startsWith("image/"))
  );
  if (visibleAttachments.length > 0) {
    const attSection = h("div", { className: "bg-white dark:bg-slate-800 rounded-lg border border-line shadow-sm p-4 mt-3" });
    attSection.appendChild(h("h3", { className: "text-sm font-medium mb-2" }, t("attachments", visibleAttachments.length)));
    const attGrid = h("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2" });
    for (const att of visibleAttachments) {
      const openUrl = `/api/messages/${msg.uid}/attachments/${att.index}?folder=${encodeURIComponent(S.folder)}`;
      const downloadUrl = `${openUrl}&download=1`;
      attGrid.appendChild(h("div", {
        className: "attachment-item cursor-pointer hover:bg-slate-50",
        onclick() { window.open(openUrl, "_blank", "noopener"); },
      },
        icon("paperclip"),
        h("span", { className: "flex-1 truncate" }, att.filename || "Untitled"),
        h("span", { className: "text-slate-400 text-xs" }, fileSize(att.size)),
        h("a", {
          className: "p-1 rounded hover:bg-slate-100 text-slate-500",
          href: downloadUrl,
          download: att.filename || "attachment",
          title: "Download",
          onclick(e) { e.stopPropagation(); },
          innerHTML: I.download,
        }),
      ));
    }
    attSection.appendChild(attGrid);
    content.appendChild(attSection);
  }

  // Reply actions
  const replyActions = h("div", { className: "flex items-center gap-2 mt-4" });
  replyActions.appendChild(pillBtn("reply", t("reply"), () => openCompose({ replyTo: msg })));
  replyActions.appendChild(pillBtn("replyAll", t("replyAll"), () => openCompose({ replyAll: msg })));
  replyActions.appendChild(pillBtn("forward", t("forward"), () => openCompose({ forward: msg })));
  content.appendChild(replyActions);

  // Quick reply
  const qrOuter = h("div", { className: "flex items-start gap-2 mt-4" });
  qrOuter.appendChild(avatarBadge(36, S.account?.email || ""));
  const qrInner = h("div", { className: "flex-1" });
  qrInner.appendChild(renderQuickReply(t("quickReplyPh")));
  qrOuter.appendChild(qrInner);
  content.appendChild(qrOuter);

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
  const destination = folderTarget("archive");
  for (const uid of S.selectedUids) {
    try {
      await api(`/api/messages/${uid}/move`, {
        method: "POST",
        body: JSON.stringify({ folder: S.folder, destination }),
      });
    } catch {}
  }
  set({ selectedUids: [] });
  await loadMessages();
}

async function batchSpam() {
  const destination = folderTarget("spam");
  for (const uid of S.selectedUids) {
    try {
      await api(`/api/messages/${uid}/move`, {
        method: "POST",
        body: JSON.stringify({ folder: S.folder, destination }),
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
  const editor = document.querySelector(".qr-editor");
  const sendBtn = document.querySelector(".qr-send-btn");
  const text = editor ? editor.value : S.quickReply;
  if (!text.trim() && S.quickAttachments.length === 0) return;
  if (!S.selectedMsg) return;
  if (S.quickSending) return;

  S.quickSending = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const msg = S.selectedMsg;
    const body = {
      to: displayEmail(msg.from),
      subject: msg.subject?.startsWith("Re:") ? msg.subject : `Re: ${msg.subject || ""}`,
      text,
      html: null,
      inReplyTo: msg.messageId || "",
      references: [msg.references, msg.inReplyTo, msg.messageId].filter(Boolean).join(" ").trim(),
    };
    if (S.quickAttachments.length > 0) {
      body.attachments = S.quickAttachments.map(a => ({
        name: a.name, type: a.type,
        data: a.data.includes(",") ? a.data.split(",")[1] : a.data,
      }));
    }
    await api("/api/messages/send", { method: "POST", body: JSON.stringify(body) });

    S.quickSending = false;
    S.quickReply = "";
    S.quickAttachments = [];
    if (editor) { editor.value = ""; editor.style.height = "auto"; }
    if (sendBtn) sendBtn.disabled = true;
    showToast(t("sentOk"));
  } catch (err) {
    S.quickSending = false;
    if (sendBtn) sendBtn.disabled = false;
    set({ error: err.message });
  }
}

// ─── Compose ─────────────────────────────────────────────────────────────────

function openCompose(opts = {}) {
  const orig = opts.replyTo || opts.replyAll || opts.forward || null;
  const draft = {
    to: opts.replyTo ? displayEmail(opts.replyTo.from) : opts.replyAll ? [displayEmail(opts.replyAll.from), ...(opts.replyAll.to || []).map(a => a.address)].filter(Boolean).join(", ") : "",
    cc: opts.replyAll ? (opts.replyAll.cc || []).map(a => a.address).filter(Boolean).join(", ") : "",
    bcc: "",
    subject: opts.replyTo || opts.replyAll ? `${(opts.replyTo || opts.replyAll).subject?.startsWith("Re:") ? "" : "Re: "}${(opts.replyTo || opts.replyAll).subject || ""}` : opts.forward ? `Fwd: ${opts.forward.subject || ""}` : "",
    text: "",
    html: "",
    attachments: [],
    fromName: S.signature?.displayName || "",
    inReplyTo: (opts.replyTo || opts.replyAll) ? (orig?.messageId || "") : "",
    references: (opts.replyTo || opts.replyAll) ? ([orig?.references, orig?.inReplyTo, orig?.messageId].filter(Boolean).join(" ").trim()) : "",
  };

  if (opts.replyTo || opts.replyAll) {
    const orig = opts.replyTo || opts.replyAll;
    draft.text = `\n\n--- Original Message ---\nFrom: ${displayName(orig.from)} <${displayEmail(orig.from)}>\nDate: ${fullDate(orig.date)}\nSubject: ${orig.subject}\n\n${orig.text || ""}`;
  } else if (opts.forward) {
    draft.text = `\n\n--- Forwarded Message ---\nFrom: ${displayName(opts.forward.from)} <${displayEmail(opts.forward.from)}>\nDate: ${fullDate(opts.forward.date)}\nSubject: ${opts.forward.subject}\n\n${opts.forward.text || ""}`;
  }

  set({ compose: draft, view: "compose", showCc: !!draft.cc, showBcc: false });
  goCompose();
}

function closeCompose() {
  set({ compose: null, showCc: false, showBcc: false });
}

function renderComposePage() {
  if (!S.compose) return h("div", { style: { display: "none" } });

  const page = h("div", {
    className: "flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-slate-800",
  });

  // Header with close (X) + send button
  const hdr = h("div", { className: "flex items-center justify-between h-14 px-4 border-b border-slate-200 dark:border-slate-700 shrink-0" });
  hdr.appendChild(h("span", { className: "text-base font-semibold" }, t("newMessage")));
  hdr.appendChild(h("button", {
    className: "px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50",
    onclick() { sendCompose(); },
    disabled: S.sending ? "disabled" : undefined,
  }, S.sending ? (t("sending") || "Sending...") : (t("send") || "Send")));
  page.appendChild(hdr);

  // Form
  const form = h("form", {
    className: "flex-1 flex flex-col overflow-hidden",
    onsubmit: sendCompose,
  });

  // Fields
  const fields = h("div", { className: "px-4 py-3 space-y-2 border-b border-slate-200 dark:border-slate-700 shrink-0" });

  // From
  fields.appendChild(h("div", { className: "flex items-center gap-2" },
    h("span", { className: "text-sm text-slate-500 dark:text-slate-400 w-12" }, t("from") + ":"),
    h("span", { className: "text-sm" }, S.account?.email || ""),
  ));

  // To
  const toRow = h("div", { className: "flex items-center gap-2" });
  toRow.appendChild(h("span", { className: "text-sm text-slate-500 dark:text-slate-400 w-12" }, t("to") + ":"));
  toRow.appendChild(renderRecipientInput("to", t("recipients")));
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
      h("span", { className: "text-sm text-slate-500 dark:text-slate-400 w-12" }, t("cc") + ":"),
      renderRecipientInput("cc", t("ccRecipients")),
    ));
  }

  // Bcc
  if (S.showBcc) {
    fields.appendChild(h("div", { className: "flex items-center gap-2" },
      h("span", { className: "text-sm text-slate-500 dark:text-slate-400 w-12" }, t("bcc") + ":"),
      renderRecipientInput("bcc", t("bccRecipients")),
    ));
  }

  // Subject
  fields.appendChild(h("div", { className: "flex items-center gap-2" },
    h("span", { className: "text-sm text-slate-500 dark:text-slate-400 w-12" }, t("subj") + ":"),
    (() => {
      const i = h("input", {
        className: "flex-1 px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded outline-none focus:ring-2 focus:ring-blue-300 bg-transparent",
        value: S.compose.subject,
      });
      i.addEventListener("input", e => { S.compose.subject = e.target.value; });
      preventMobileScroll(i);
      return i;
    })(),
  ));

  form.appendChild(fields);

  // Rich text toolbar
  const toolbar = h("div", { className: "flex items-center gap-0.5 px-4 h-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0 overflow-x-auto" });
  toolbar.appendChild(toolbarBtn("bold", () => document.execCommand("bold")));
  toolbar.appendChild(toolbarBtn("italic", () => document.execCommand("italic")));
  toolbar.appendChild(toolbarBtn("underline", () => document.execCommand("underline")));
  toolbar.appendChild(h("div", { className: "w-px h-5 bg-slate-300 mx-1" }));
  toolbar.appendChild(toolbarBtn("list", () => document.execCommand("insertUnorderedList")));
  toolbar.appendChild(toolbarBtn("listOrd", () => document.execCommand("insertOrderedList")));
  toolbar.appendChild(h("div", { className: "w-px h-5 bg-slate-300 mx-1" }));
  toolbar.appendChild(toolbarBtn("link", () => {
    const url = prompt(t("enterUrl"));
    if (url) document.execCommand("createLink", false, url);
  }));
  form.appendChild(toolbar);

  // Editor
  const editor = h("div", {
    className: "compose-editor flex-1 overflow-y-auto px-4 py-3",
    contenteditable: "true",
    "data-placeholder": "Write your message...",
  });
  if (S.compose.text) editor.innerHTML = textToHtml(S.compose.text);
  editor.addEventListener("input", () => { S.compose.html = editor.innerHTML; });
  preventMobileScroll(editor);
  form.appendChild(editor);

  // Attachments
  if (S.compose.attachments.length > 0) {
    const attDiv = h("div", { className: "px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 shrink-0" });
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
  const footer = h("div", { className: "flex items-center gap-3 px-4 h-14 border-t border-slate-200 dark:border-slate-700 shrink-0" });
  const fileInput = h("input", { type: "file", multiple: "multiple", className: "hidden" });
  fileInput.addEventListener("change", e => {
    for (const file of e.target.files) {
      if (file.size > 10 * 1024 * 1024) continue;
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
    className: "p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500",
    type: "button",
    title: t("attachFiles"),
    innerHTML: I.paperclip,
    onclick() { fileInput.click(); },
  }));
  footer.appendChild(fileInput);

  page.appendChild(form);
  return page;
}

function renderRecipientInput(field, placeholder) {
  const tokens = recipientTokens(S.compose[field]);
  const wrap = h("div", {
    className: "recipient-input flex-1 min-h-[38px] px-2 py-1 border border-line rounded flex flex-wrap items-center gap-1 cursor-text focus-within:ring-2 focus-within:ring-blue-300",
    onclick() {
      const input = $(`.recipient-entry[data-recipient-field="${field}"]`, wrap);
      if (input) input.focus();
    },
  });

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const valid = VALID_EMAIL.test(token);
    wrap.appendChild(h("span", { className: `recipient-chip ${valid ? "valid" : "invalid"}` },
      h("span", { className: "max-w-[220px] truncate" }, token),
      h("button", {
        type: "button",
        className: "leading-none opacity-70 hover:opacity-100",
        title: t("removeRecipient"),
        onclick(e) {
          e.stopPropagation();
          const next = tokens.filter((_, idx) => idx !== i);
          setRecipientTokens(field, next);
        },
      }, "x"),
    ));
  }

  const input = h("input", {
    className: "recipient-entry flex-1 min-w-[140px] border-0 bg-transparent py-1 text-sm outline-none",
    dataset: { recipientField: field },
    placeholder: tokens.length ? "" : placeholder,
    autocomplete: "off",
  });

  input.addEventListener("keydown", e => {
    if (["Enter", "Tab", ",", ";", " "].includes(e.key)) {
      if (input.value.trim()) {
        e.preventDefault();
        addRecipientText(field, input.value);
      }
    } else if (e.key === "Backspace" && !input.value && tokens.length) {
      e.preventDefault();
      setRecipientTokens(field, tokens.slice(0, -1));
    }
  });
  input.addEventListener("paste", e => {
    const text = e.clipboardData?.getData("text") || "";
    if (text) {
      e.preventDefault();
      addRecipientText(field, text);
    }
  });
  input.addEventListener("blur", () => {
    if (input.value.trim()) addRecipientText(field, input.value);
  });
  preventMobileScroll(input);

  wrap.appendChild(input);
  return wrap;
}

async function sendCompose(e) {
  if (e) e.preventDefault();
  if (S.sending) return;

  const c = S.compose;
  if (!c) return;
  collectRecipientInputs();

  const invalidRecipients = [
    ...recipientTokens(c.to),
    ...recipientTokens(c.cc),
    ...recipientTokens(c.bcc),
  ].filter(token => !VALID_EMAIL.test(token));
  if (invalidRecipients.length) {
    set({ error: t("invalidRecipient", invalidRecipients[0]) });
    return;
  }

  // Get HTML from editor
  const editor = $(".compose-editor");
  const html = editor ? editor.innerHTML : c.html;

  set({ sending: true });
  try {
    const payload = {
      to: c.to,
      cc: c.cc,
      bcc: c.bcc,
      subject: c.subject,
      text: c.text || editor?.textContent || "",
      html: html,
      fromName: c.fromName || S.signature?.displayName || "",
      inReplyTo: c.inReplyTo || "",
      references: c.references || "",
    };
    if (c.attachments && c.attachments.length > 0) {
      payload.attachments = c.attachments.map(a => ({
        name: a.name, type: a.type,
        data: a.data.includes(",") ? a.data.split(",")[1] : a.data,
      }));
    }
    await api("/api/messages/send", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    set({ sending: false, compose: null });
    showToast(t("sentOk"));
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
    S.calMonth.toLocaleDateString(t("dateLocale"), { month: "long", year: "numeric" }),
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
  }, t("newEvent")));
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
    panel.appendChild(h("h3", { className: "font-medium mb-3" }, new Date(S.calSelected).toLocaleDateString(t("dateLocale"), { weekday: "long", month: "long", day: "numeric" })));

    const dayEvents = S.calendarEvents.filter(e => e.dtstart?.startsWith(S.calSelected));
    if (dayEvents.length === 0) {
      panel.appendChild(h("p", { className: "text-sm text-slate-400" }, t("noEvents")));
    }
    for (const evt of dayEvents) {
      const card = h("div", { className: "p-3 rounded-lg border border-line mb-2 hover:bg-slate-50 cursor-pointer" },
        h("div", { className: "font-medium text-sm" }, evt.summary || t("noTitle")),
        evt.dtstart ? h("div", { className: "text-xs text-slate-500 mt-1 flex items-center gap-1" }, icon("clock"), evt.allDay ? t("allDay") : new Date(evt.dtstart).toLocaleTimeString(t("dateLocale"), { hour: "numeric", minute: "2-digit" })) : null,
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
    className: "bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4",
    onclick(e) { e.stopPropagation(); },
  });

  modal.appendChild(h("div", { className: "flex items-center justify-between px-4 py-3 border-b border-line" },
    h("h2", { className: "text-lg font-semibold" }, isNew ? t("newEvent") : t("editEvent")),
    h("button", { className: "p-1 rounded hover:bg-slate-100", innerHTML: I.x, onclick() { set({ calEditing: null }); } }),
  ));

  const form = h("form", { className: "p-4 space-y-3" });

  form.appendChild(formField(t("summary"), "text", evt.summary || "", v => { S.calEditing.summary = v; }));
  form.appendChild(formField(t("description"), "text", evt.description || "", v => { S.calEditing.description = v; }));
  form.appendChild(formField(t("location"), "text", evt.location || "", v => { S.calEditing.location = v; }));

  // All day toggle
  const allDayRow = h("label", { className: "flex items-center gap-2 text-sm" });
  const allDayCb = h("input", { type: "checkbox" });
  allDayCb.checked = !!evt.allDay;
  allDayCb.addEventListener("change", () => { S.calEditing.allDay = allDayCb.checked; });
  allDayRow.appendChild(allDayCb);
  allDayRow.appendChild(document.createTextNode(t("allDay")));
  form.appendChild(allDayRow);

  form.appendChild(formField(t("startDate"), "datetime-local", evt.dtstart ? evt.dtstart.slice(0, 16) : "", v => { S.calEditing.dtstart = v; }));
  form.appendChild(formField(t("endDate"), "datetime-local", evt.dtend ? evt.dtend.slice(0, 16) : "", v => { S.calEditing.dtend = v; }));

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
    }, t("deleteContact")));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(h("button", {
    className: "px-4 py-2 rounded-lg border border-line text-sm hover:bg-slate-50",
    type: "button",
    onclick() { set({ calEditing: null }); },
  }, t("cancel")));
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
  }, isNew ? "Create" : t("save")));
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
  }, t("newContact")));
  view.appendChild(hdr);

  // Body
  const body = h("div", { className: "flex-1 flex overflow-hidden" });

  // Contact list
  const listWrap = h("div", { className: "w-full md:w-80 overflow-y-auto border-r border-line" });
  if (S.contacts.length === 0) {
    listWrap.appendChild(h("div", { className: "flex flex-col items-center justify-center py-12 text-slate-400" },
      icon("contact"),
      h("p", { className: "mt-2 text-sm" }, t("noContacts")),
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

  panel.appendChild(h("h2", { className: "text-lg font-semibold mb-4" }, isNew ? t("newContact") : t("editContact")));

  const form = h("form", { className: "space-y-4" });
  form.appendChild(formField(t("name"), "text", c.fn || "", v => { S.contactEditing.fn = v; }));
  form.appendChild(formField(t("emailAddress"), "email", c.email || "", v => { S.contactEditing.email = v; }));
  form.appendChild(formField(t("phone"), "tel", c.phone || "", v => { S.contactEditing.phone = v; }));
  form.appendChild(formField(t("organization"), "text", c.organization || "", v => { S.contactEditing.organization = v; }));
  form.appendChild(formField(t("title"), "text", c.title || "", v => { S.contactEditing.title = v; }));

  const noteLabel = h("label", { className: "block text-sm font-medium text-slate-700" }, "Note");
  const noteInput = h("textarea", {
    className: "w-full px-3 py-2 border border-line rounded-lg text-sm",
    rows: "3",
  });
  noteInput.value = c.note || "";
  noteInput.addEventListener("input", () => { S.contactEditing.note = noteInput.value; });
  preventMobileScroll(noteInput);
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
    }, t("deleteContact")));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(h("button", {
    className: "px-4 py-2 rounded-lg border border-line text-sm hover:bg-slate-50",
    type: "button",
    onclick() { set({ contactEditing: null }); },
  }, t("cancel")));
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
  }, isNew ? "Create" : t("save")));
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
  preventMobileScroll(input);
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
    className: "bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col",
    onclick(e) { e.stopPropagation(); },
  });

  modal.appendChild(h("div", { className: "flex items-center justify-between h-14 px-4 border-b border-line shrink-0" },
    h("h2", { className: "text-lg font-semibold" }, t("signatureTitle")),
    h("button", { className: "p-1 rounded hover:bg-slate-100", innerHTML: I.x, onclick() { set({ sigOpen: false }); } }),
  ));

  const body = h("div", { className: "flex-1 overflow-y-auto p-4" });
  const form = h("form", { className: "space-y-4" });

  // Fields grid
  const grid = h("div", { className: "grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3" });
  const sigFields = [
    { key: "displayName", labelKey: "displayName", type: "text" },
    { key: "email", labelKey: "emailAddress", type: "email", readonly: true },
    { key: "organization", labelKey: "orgLabel", type: "text" },
    { key: "replyTo", labelKey: "replyTo", type: "email" },
    { key: "bcc", labelKey: "blindCopy", type: "text" },
  ];
  for (const f of sigFields) {
    grid.appendChild(h("label", { className: "flex items-center text-sm text-slate-600" }, t(f.labelKey)));
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
  grid.appendChild(h("label", { className: "flex items-center text-sm text-slate-600" }, t("useByDefault")));
  const toggleWrap = h("label", { className: "flex items-center gap-2" });
  const toggle = h("input", { type: "checkbox" });
  toggle.checked = sig.defaultEnabled !== false;
  toggle.addEventListener("change", () => { if (!S.signature) S.signature = {}; S.signature.defaultEnabled = toggle.checked; });
  toggleWrap.appendChild(toggle);
  toggleWrap.appendChild(document.createTextNode(t("enabled")));
  grid.appendChild(toggleWrap);

  form.appendChild(grid);

  // Signature editor
  form.appendChild(h("h3", { className: "text-sm font-medium text-slate-700 mt-4" }, t("signature")));
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
    const url = prompt(t("enterUrl"));
    if (url) document.execCommand("createLink", false, url);
  }));
  editorWrap.appendChild(toolbar);

  const sigEditor = h("div", {
    className: "signature-editor",
    contenteditable: "true",
    "data-placeholder": t("signaturePlaceholder"),
    innerHTML: sig.html || "",
  });
  preventMobileScroll(sigEditor);
  editorWrap.appendChild(sigEditor);
  form.appendChild(editorWrap);

  body.appendChild(form);
  modal.appendChild(body);

  // Footer
  const footer = h("div", { className: "flex items-center gap-3 px-4 h-16 border-t border-line shrink-0" });
  if (S.sigSaved) {
    footer.appendChild(h("span", { className: "text-sm text-green-600 flex items-center gap-1" }, icon("check"), t("signatureSaved")));
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
  }, S.sigSaving ? t("saving") : t("save")));
  modal.appendChild(footer);

  overlay.appendChild(modal);
  return overlay;
}

// ─── Main Render ─────────────────────────────────────────────────────────────

function render() {
  _rendering = true;
  // Preserve contenteditable editor content across re-renders so typing isn't lost
  const savedHtml = S.compose && document.querySelector(".compose-editor")
    ? document.querySelector(".compose-editor").innerHTML || null
    : null;
  try {
    const app = $("#app");
    clear(app);

    // Close more menu on outside click
    if (S.moreMenu) {
      document.addEventListener("click", () => set({ moreMenu: false }), { once: true });
    }

    if (!S.account) {
      app.appendChild(renderLogin());
    } else if (!S.ready) {
      // Logged in but still loading data
      app.appendChild(h("div", { className: "flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900" },
        h("div", { className: "text-center" },
          h("div", { className: "spinner mx-auto mb-4" }),
          h("p", { className: "text-sm text-slate-500 dark:text-slate-400" }, t("loadingMailbox")),
        ),
      ));
    } else {
      const shell = h("div", { className: "flex h-screen overflow-hidden" });

      shell.appendChild(renderSidebar());

      const main = h("div", { className: "flex-1 flex flex-col overflow-hidden min-w-0" });

      if (S.view === "mail") {
        const mailView = h("div", { className: "flex-1 flex overflow-hidden relative" });

        // ── Desktop (≥768px): 3-panel layout ─────────────────────────────────
        if (window.innerWidth >= 769) {
          mailView.appendChild(renderMessageList());
          // Compose takes the reading-pane slot; message view shows when not composing
          if (S.compose) {
            mailView.appendChild(renderComposePage());
          } else {
            mailView.appendChild(renderMessageView());
          }
        // ── Mobile (<768px): list OR detail, not both ──────────────────────
        } else if (S.selectedUid) {
          mailView.appendChild(S.compose ? renderComposePage() : renderMessageView());
        } else {
          mailView.appendChild(renderMessageList());
        }

        // Mobile FAB: compose button (bottom-right, mobile-only)
        const fab = h("button", {
          className: "fab-compose md:hidden",
          title: t("compose"),
          onclick() { openCompose(); },
          innerHTML: I.edit,
        });
        mailView.appendChild(fab);

        main.appendChild(mailView);
      } else if (S.view === "contacts") {
        main.appendChild(renderContactsView());
      } else if (S.view === "calendar") {
        main.appendChild(renderCalendarView());
      }

      shell.appendChild(main);
      app.appendChild(renderMobileSidebar());

      app.appendChild(shell);
      app.appendChild(renderSignatureModal());

      // Restore editor content after DOM is rebuilt so typing is never lost
      if (savedHtml !== null) {
        const editor = document.querySelector(".compose-editor");
        if (editor) editor.innerHTML = savedHtml;
      }
    }
  } catch (err) {
    console.error("Render error:", err);
  } finally {
    _rendering = false;
  }
}

// ─── URL Router (hash-based: #/mail/Sent or #/contacts) ───────────────────────
// Preserves browser back/forward, deep-links, and mobile swipe gestures.
// No backend changes needed — hash changes are client-side only.

function parseHash() {
  const hash = (window.location.hash || "#").slice(1); // strip leading #
  if (!hash || hash === "/") return { view: "mail", folder: null };
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "contacts") return { view: "contacts", folder: null };
  if (parts[0] === "calendar") return { view: "calendar", folder: null };
  if (parts[0] === "compose") return { view: "compose", folder: null };
  // Default: mail — /mail, /mail/INBOX, /mail/Sent/uid123
  return {
    view: "mail",
    folder: parts[1] ? decodeURIComponent(parts[1]) : "INBOX",
    uid: parts[2] ? parseInt(parts[2], 10) : null,
  };
}

function buildHash(view, folder, uid) {
  if (view === "contacts") return "#/contacts";
  if (view === "calendar") return "#/calendar";
  if (view === "compose") return "#/compose";
  let h = "#/mail";
  if (folder) h += "/" + encodeURIComponent(folder);
  if (uid) h += "/" + uid;
  return h;
}

// Replace full page URL without reloading (uses History API, not hash).
// Falls back to hash if pushState is unavailable.
function navigate(opts = {}) {
  const view = opts.view !== undefined ? opts.view : S.view;
  const folder = opts.folder !== undefined ? opts.folder : S.folder;
  const uid = opts.uid !== undefined ? opts.uid : (opts.clearUid ? null : S.selectedUid);

  const hash = buildHash(view, folder, uid);
  if (window.location.hash !== hash) {
    if (window.history.pushState) {
      window.history.pushState(null, "", hash);
    } else {
      window.location.hash = hash;
    }
  }
}

function goCompose() {
  if (window.location.hash !== "#/compose") {
    if (window.history.pushState) {
      window.history.pushState({ view: "compose" }, "", "#/compose");
    } else {
      window.location.hash = "#/compose";
    }
  }
}

function goBackFromCompose() {
  // Restore previous view/folder from browser history stack
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate({ view: "mail", folder: "INBOX", clearUid: true });
  }
}

function onPopState() {
  // Browser back/forward — sync state from URL
  const { view, folder, uid } = parseHash();
  const needsLoad =
    view !== S.view ||
    folder !== S.folder ||
    (uid && uid !== S.selectedUid) ||
    (uid === null && S.selectedUid !== null);

  if (needsLoad) {
    // If navigating to compose page but compose state is missing, create a blank draft
    if (view === "compose" && !S.compose) {
      openCompose();
      return;
    }
    set({
      view,
      folder: folder || "INBOX",
      selectedUid: uid,
      selectedMsg: null,
      threadMsgs: [],
    });
    if (folder && folder !== S.folder) loadMessages();
    if (uid) loadMessage(uid);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

(async function init() {
  // Restore state from URL before first render
  const { view, folder, uid } = parseHash();
  S.view = view;
  S.folder = folder || "INBOX";
  S.selectedUid = uid || null;

  // Listen for browser back/forward
  window.addEventListener("popstate", onPopState);

  try {
    const data = await api("/api/auth/me");
    if (data.authenticated) {
      S.account = { email: data.email, domain: data.domain };
      S.ready = true;
      // If deep-linking to compose, open blank draft
      if (view === "compose") openCompose();
      await bootstrap();
      return;
    }
  } catch {}
  // Not authenticated — show login
  S.ready = true;
  render();
})();

// Handle window resize — only re-render when width changes (not keyboard open/close)
let resizeTimer;
let _lastWidth = window.innerWidth;
window.addEventListener("resize", () => {
  if (window.innerWidth === _lastWidth) return; // height-only change (keyboard), skip
  _lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 100);
});
