import { resolveMx } from "dns/promises";

export type MailServerConfig = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

export function getEmailDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) {
    throw new Error("Email address is invalid.");
  }

  return domain;
}

const mxCache = new Map<string, string>();

async function getMxHost(domain: string) {
  const cached = mxCache.get(domain);

  if (cached) {
    return cached;
  }

  try {
    const records = await resolveMx(domain);
    const exchange = records
      .filter((record) => record.exchange && record.exchange !== ".")
      .sort((a, b) => a.priority - b.priority)[0]?.exchange
      ?.replace(/\.$/, "");

    if (exchange) {
      mxCache.set(domain, exchange);
      return exchange;
    }
  } catch {
    // Fall back below when the domain has no MX or DNS is temporarily unavailable.
  }

  const fallback = `mail.${domain}`;
  mxCache.set(domain, fallback);
  return fallback;
}

export async function getMailServerConfig(email: string): Promise<MailServerConfig> {
  const domain = getEmailDomain(email);
  const mxHost = await getMxHost(domain);
  const fixedHost = process.env.MAIL_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  return {
    imapHost: process.env.IMAP_HOST?.trim() || fixedHost || mxHost,
    imapPort: Number(process.env.IMAP_PORT || 993),
    imapSecure: process.env.IMAP_SECURE !== "false",
    smtpHost: process.env.SMTP_HOST?.trim() || fixedHost || mxHost,
    smtpPort,
    smtpSecure:
      process.env.SMTP_SECURE === "false" ? false : smtpPort === 465 || process.env.SMTP_SECURE === "true"
  };
}
