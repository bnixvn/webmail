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

export function assertAllowedDomain(email: string) {
  const allowed = process.env.ALLOWED_EMAIL_DOMAINS?.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed?.length) {
    return;
  }

  const domain = getEmailDomain(email);
  if (!allowed.includes(domain)) {
    throw new Error("This email domain is not allowed on this webmail.");
  }
}

function parseHostMap(value?: string) {
  const hosts = new Map<string, string>();

  for (const entry of value?.split(/[\n,;]+/) || []) {
    const [rawDomain, ...rawHostParts] = entry.split("=");
    const domain = rawDomain?.trim().toLowerCase();
    const host = rawHostParts.join("=").trim();

    if (domain && host) {
      hosts.set(domain, host);
    }
  }

  return hosts;
}

function mappedHost(value: string | undefined, domain: string) {
  const hosts = parseHostMap(value);
  return hosts.get(domain) || hosts.get("*") || "";
}

export function getMailServerConfig(email: string): MailServerConfig {
  const domain = getEmailDomain(email);
  const fallbackHost = `mail.${domain}`;
  const sharedHost = process.env.MAIL_HOST?.trim();
  const mappedSharedHost = mappedHost(process.env.MAIL_HOST_MAP, domain);
  const mappedImapHost = mappedHost(process.env.IMAP_HOST_MAP, domain);
  const mappedSmtpHost = mappedHost(process.env.SMTP_HOST_MAP, domain);
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  return {
    imapHost: mappedImapHost || mappedSharedHost || process.env.IMAP_HOST?.trim() || sharedHost || fallbackHost,
    imapPort: Number(process.env.IMAP_PORT || 993),
    imapSecure: process.env.IMAP_SECURE !== "false",
    smtpHost: mappedSmtpHost || mappedSharedHost || process.env.SMTP_HOST?.trim() || sharedHost || fallbackHost,
    smtpPort,
    smtpSecure:
      process.env.SMTP_SECURE === "false" ? false : smtpPort === 465 || process.env.SMTP_SECURE === "true"
  };
}
