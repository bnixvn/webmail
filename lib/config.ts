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

export function getMailServerConfig(email: string): MailServerConfig {
  const domain = getEmailDomain(email);
  const fallbackHost = `mail.${domain}`;
  const sharedHost = process.env.MAIL_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  return {
    imapHost: process.env.IMAP_HOST?.trim() || sharedHost || fallbackHost,
    imapPort: Number(process.env.IMAP_PORT || 993),
    imapSecure: process.env.IMAP_SECURE !== "false",
    smtpHost: process.env.SMTP_HOST?.trim() || sharedHost || fallbackHost,
    smtpPort,
    smtpSecure:
      process.env.SMTP_SECURE === "false" ? false : smtpPort === 465 || process.env.SMTP_SECURE === "true"
  };
}
