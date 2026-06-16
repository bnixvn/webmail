import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "webmail_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export type MailSession = {
  email: string;
  password: string;
  createdAt: number;
};

function getKey() {
  const secret =
    process.env.AUTH_SECRET ||
    "dev-only-change-this-secret-before-production-32";

  return crypto.createHash("sha256").update(secret).digest();
}

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function encryptSession(session: MailSession) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [toBase64Url(iv), toBase64Url(tag), toBase64Url(encrypted)].join(".");
}

export function decryptSession(token: string): MailSession | null {
  try {
    const [ivValue, tagValue, encryptedValue] = token.split(".");
    if (!ivValue || !tagValue || !encryptedValue) {
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), fromBase64Url(ivValue));
    decipher.setAuthTag(fromBase64Url(tagValue));
    const decrypted = Buffer.concat([
      decipher.update(fromBase64Url(encryptedValue)),
      decipher.final()
    ]).toString("utf8");

    const session = JSON.parse(decrypted) as MailSession;
    if (!session.email || !session.password || !session.createdAt) {
      return null;
    }

    if (Date.now() - session.createdAt > MAX_AGE_SECONDS * 1000) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function setSession(session: MailSession, options: { persistent?: boolean } = {}) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, encryptSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(options.persistent ? { maxAge: MAX_AGE_SECONDS } : {})
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return decryptSession(token);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
