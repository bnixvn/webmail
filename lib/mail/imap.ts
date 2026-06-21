import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getMailServerConfig } from "@/lib/config";
import type { MailSession } from "@/lib/session";
import { sanitizeEmailHtml } from "@/lib/mail/sanitize";

type Address = {
  name?: string;
  address?: string;
};

type MailboxTreeNode = {
  name?: string;
  path?: string;
  delimiter?: string;
  flags?: Set<string> | string[];
  specialUse?: string;
  messages?: number;
  unseen?: number;
  folders?: MailboxTreeNode[];
};

export type MailboxSummary = {
  path: string;
  name: string;
  delimiter?: string;
  specialUse?: string;
  total: number;
  unseen: number;
  depth: number;
};

export type MessageSummary = {
  uid: number;
  messageId?: string;
  subject: string;
  from: Address[];
  to: Address[];
  date?: string;
  flags: string[];
  seen: boolean;
  flagged: boolean;
  snippet: string;
};

export type MessageDetail = MessageSummary & {
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

async function getImapClient(session: MailSession) {
  const config = await getMailServerConfig(session.email);

  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: {
      user: session.email,
      pass: session.password
    },
    logger: false,
    tls: {
      rejectUnauthorized: false
    },
    socketTimeout: 120000
  });

  // Catch unhandled socket timeout errors from imapflow internals
  // imapflow emits ETIMEOUT on the socket which can bypass our try/catch
  client.on("error", (err: Error) => {
    if (err?.message?.includes("timeout") || (err as any)?.code === "ETIMEOUT") {
      // Silently swallow - the withImap retry logic will handle reconnection
      return;
    }
    console.error("imapflow error:", err);
  });

  return client;
}

// Connection pool — reuse IMAP connections per user
const pool = new Map<string, { client: ImapFlow; lastUsed: number }>();
const POOL_TTL_MS = 4 * 60 * 1000; // 4 minutes idle timeout

// Clean up stale connections every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pool) {
    if (now - entry.lastUsed > POOL_TTL_MS) {
      entry.client.logout().catch(() => undefined);
      pool.delete(key);
    }
  }
}, 60_000).unref();

async function getPooledClient(session: MailSession): Promise<ImapFlow> {
  const key = session.email;
  const existing = pool.get(key);

  if (existing) {
    // Verify connection is still alive
    try {
      if (existing.client.usable) {
        existing.lastUsed = Date.now();
        return existing.client;
      }
    } catch {
      // Connection dead, remove it
    }
    existing.client.logout().catch(() => undefined);
    pool.delete(key);
  }

  const client = await getImapClient(session);
  await client.connect();
  pool.set(key, { client, lastUsed: Date.now() });
  return client;
}

async function withImap<T>(session: MailSession, handler: (client: ImapFlow) => Promise<T>) {
  const client = await getPooledClient(session);

  try {
    return await handler(client);
  } catch (error: unknown) {
    // If connection died, evict from pool and retry once
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("closed") || msg.includes("timeout") || msg.includes("ECONNRESET")) {
      pool.delete(session.email);
      const fresh = await getPooledClient(session);
      return await handler(fresh);
    }
    throw error;
  }
  // Note: do NOT logout — connection stays in pool for reuse
}

function addresses(value: unknown): Address[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    name: item?.name || undefined,
    address: item?.address || undefined
  }));
}

function flagsArray(flags: unknown): string[] {
  if (flags instanceof Set) {
    return [...flags].map(String);
  }

  if (Array.isArray(flags)) {
    return flags.map(String);
  }

  return [];
}

function hasFlag(flags: unknown, flag: string) {
  if (flags instanceof Set) {
    return flags.has(flag);
  }

  if (Array.isArray(flags)) {
    return flags.includes(flag);
  }

  return false;
}

function normalizeFolderText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function folderMatches(mailbox: MailboxSummary, aliases: string[]) {
  const path = normalizeFolderText(mailbox.path);
  const name = normalizeFolderText(mailbox.name);

  return aliases.some((alias) => {
    const normalized = normalizeFolderText(alias);
    return (
      path === normalized ||
      name === normalized ||
      path.endsWith(`.${normalized}`) ||
      path.endsWith(`/${normalized}`)
    );
  });
}

function flattenMailboxTree(node: MailboxTreeNode, depth = 0, result: MailboxSummary[] = []) {
  if (node.path && !hasFlag(node.flags, "\\Noselect")) {
    result.push({
      path: node.path,
      name: node.name || node.path,
      delimiter: node.delimiter,
      specialUse: node.specialUse,
      total: Number(node.messages || 0),
      unseen: Number(node.unseen || 0),
      depth
    });
  }

  for (const child of node.folders || []) {
    flattenMailboxTree(child, depth + 1, result);
  }

  return result;
}

async function listAllMailboxes(client: ImapFlow) {
  const listOptions = {
    statusQuery: {
      messages: true,
      unseen: true
    }
  };

  try {
    const tree = (await client.listTree(listOptions)) as MailboxTreeNode;
    return flattenMailboxTree(tree);
  } catch {
    const boxes = await client.list(listOptions);

    return boxes
      .filter((box: any) => !hasFlag(box.flags, "\\Noselect"))
      .map((box: any) => ({
        path: box.path,
        name: box.name || box.path,
        delimiter: box.delimiter,
        specialUse: box.specialUse,
        total: Number(box.messages || 0),
        unseen: Number(box.unseen || 0),
        depth: 0
      }));
  }
}

function findMailboxPath(mailboxes: MailboxSummary[], aliases: string[], specialUse?: string) {
  const bySpecialUse = specialUse ? mailboxes.find((mailbox) => mailbox.specialUse === specialUse) : null;

  if (bySpecialUse) {
    return bySpecialUse.path;
  }

  return mailboxes.find((mailbox) => folderMatches(mailbox, aliases))?.path;
}

function cleanSnippet(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function envelopeSummary(message: any, snippet = ""): MessageSummary {
  const flags = flagsArray(message.flags);

  return {
    uid: Number(message.uid),
    messageId: message.envelope?.messageId || undefined,
    subject: message.envelope?.subject || "(No subject)",
    from: addresses(message.envelope?.from),
    to: addresses(message.envelope?.to),
    date: (message.envelope?.date || message.internalDate)?.toISOString?.(),
    flags,
    seen: flags.includes("\\Seen"),
    flagged: flags.includes("\\Flagged"),
    snippet
  };
}

async function parseSnippet(source?: Buffer) {
  if (!source?.length) {
    return "";
  }

  try {
    const parsed = await simpleParser(source);
    return cleanSnippet(parsed.text || parsed.subject || "");
  } catch {
    return "";
  }
}

export async function verifyLogin(session: MailSession) {
  return withImap(session, async () => ({ ok: true }));
}

export async function listMailboxes(session: MailSession): Promise<MailboxSummary[]> {
  return withImap(session, async (client) => {
    return listAllMailboxes(client);
  });
}

export async function createMailbox(session: MailSession, path: string) {
  return withImap(session, async (client) => {
    await client.mailboxCreate(path);
    return { ok: true, path };
  });
}

export async function listMessages(
  session: MailSession,
  folder: string,
  limit = 40
): Promise<MessageSummary[]> {
  return withImap(session, async (client) => {
    const lock = await client.getMailboxLock(folder);

    try {
      const mailbox = await client.mailboxOpen(folder, { readOnly: true });
      const exists = Number(mailbox.exists || 0);

      if (!exists) {
        return [];
      }

      const start = Math.max(1, exists - Math.min(limit, 100) + 1);
      const summaries: MessageSummary[] = [];

      for await (const message of client.fetch(
        `${start}:*`,
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          source: {
            start: 0,
            maxLength: 24000
          }
        },
        { uid: false }
      )) {
        summaries.push(envelopeSummary(message, await parseSnippet(message.source as Buffer)));
      }

      return summaries.sort((a, b) => b.uid - a.uid);
    } finally {
      lock.release();
    }
  });
}

export async function getMessage(
  session: MailSession,
  folder: string,
  uid: number
): Promise<MessageDetail | null> {
  const FETCH_TIMEOUT_MS = 60_000; // 60s timeout for full message fetch+parse

  return withImap(session, async (client) => {
    const lock = await client.getMailboxLock(folder);

    try {
      await client.mailboxOpen(folder);

      // Fetch envelope+flags first (fast, no full source)
      let summary: MessageDetail | null = null;

      for await (const message of client.fetch(
        String(uid),
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          bodyStructure: true
        },
        { uid: true }
      )) {
        summary = {
          ...envelopeSummary(message, ""),
          cc: addresses(message.envelope?.cc),
          bcc: addresses(message.envelope?.bcc),
          html: undefined,
          text: undefined,
          attachments: []
        };

        if (!summary.seen) {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => undefined);
        }
      }

      if (!summary) {
        return null;
      }

      // Now fetch full source with timeout
      const sourcePromise = (async () => {
        for await (const message of client.fetch(
          String(uid),
          { uid: true, source: true },
          { uid: true }
        )) {
          return message.source as Buffer;
        }
        return null;
      })();

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)
      );

      const source = await Promise.race([sourcePromise, timeoutPromise]);

      if (source) {
        const parsed = await simpleParser(source);
        summary.snippet = cleanSnippet(parsed.text || "");
        summary.html = parsed.html ? sanitizeEmailHtml(parsed.html) : undefined;
        summary.text = parsed.text || undefined;
        summary.attachments = parsed.attachments.map((attachment) => ({
          filename: attachment.filename || undefined,
          contentType: attachment.contentType || undefined,
          size: attachment.size,
          cid: attachment.cid || undefined
        }));
      }

      return summary;
    } finally {
      lock.release();
    }
  });
}

export async function setMessageFlag(
  session: MailSession,
  folder: string,
  uid: number,
  flag: "\\Seen" | "\\Flagged",
  enabled: boolean
) {
  return withImap(session, async (client) => {
    const lock = await client.getMailboxLock(folder);

    try {
      await client.mailboxOpen(folder);

      if (enabled) {
        await client.messageFlagsAdd(String(uid), [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(String(uid), [flag], { uid: true });
      }

      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

export async function moveMessage(
  session: MailSession,
  folder: string,
  uid: number,
  destination: string
) {
  return withImap(session, async (client) => {
    const lock = await client.getMailboxLock(folder);

    try {
      await client.mailboxOpen(folder);
      await client.messageMove(String(uid), destination, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

export async function deleteMessage(session: MailSession, folder: string, uid: number) {
  return withImap(session, async (client) => {
    const boxes = await listAllMailboxes(client);
    const trash =
      findMailboxPath(boxes, ["trash", "thung rac", "deleted items", "deleted"], "\\Trash") || "Trash";
    const lock = await client.getMailboxLock(folder);

    try {
      await client.mailboxOpen(folder);

      if (folder !== trash) {
        await client.messageMove(String(uid), trash, { uid: true });
      } else {
        await client.messageDelete(String(uid), { uid: true });
      }

      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

export async function appendSentMessage(session: MailSession, raw: Buffer) {
  return withImap(session, async (client) => {
    const boxes = await listAllMailboxes(client);
    const sent = findMailboxPath(boxes, ["sent", "sent items", "sent mail", "da gui"], "\\Sent") || "Sent";

    await client.append(sent, raw, ["\\Seen"], new Date()).catch(() => undefined);
    return { ok: true };
  });
}
