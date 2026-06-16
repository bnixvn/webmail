import nodemailer from "nodemailer";
import { z } from "zod";
import { getMailServerConfig } from "@/lib/config";
import { appendSentMessage } from "@/lib/mail/imap";
import type { MailSession } from "@/lib/session";

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120).optional(),
  contentBase64: z.string().min(1)
});

export const sendMailSchema = z.object({
  to: z.string().optional().default(""),
  cc: z.string().optional().default(""),
  bcc: z.string().optional().default(""),
  subject: z.string().max(500).default(""),
  text: z.string().max(2_000_000).default(""),
  html: z.string().max(2_000_000).optional(),
  attachments: z.array(attachmentSchema).max(10).optional().default([])
});

export type SendMailInput = z.infer<typeof sendMailSchema>;

function splitRecipients(value = "") {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);

  if (matches?.length) {
    return [...new Set(matches.map((item) => item.trim().toLowerCase()))];
  }

  return value
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function recipientAddress(value: string) {
  const angleMatch = value.match(/<\s*([^>]+?)\s*>/);
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (angleMatch?.[1] || emailMatch?.[0] || value).trim();
}

export async function sendMail(session: MailSession, input: SendMailInput) {
  const config = await getMailServerConfig(session.email);
  const parsed = sendMailSchema.parse(input);

  const toRecipients = splitRecipients(parsed.to);
  const ccRecipients = splitRecipients(parsed.cc);
  const bccRecipients = splitRecipients(parsed.bcc);
  const recipients = [...toRecipients, ...ccRecipients, ...bccRecipients];
  const envelopeRecipients = recipients.map(recipientAddress);

  if (!recipients.length) {
    throw new Error("At least one recipient is required.");
  }

  const mailOptions = {
    from: session.email,
    to: toRecipients,
    cc: ccRecipients.length ? ccRecipients : undefined,
    bcc: bccRecipients.length ? bccRecipients : undefined,
    subject: parsed.subject || "(No subject)",
    text: parsed.text || undefined,
    html: parsed.html || undefined,
    attachments: parsed.attachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: Buffer.from(attachment.contentBase64, "base64")
    }))
  };

  const builder = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix"
  });
  const built = await builder.sendMail(mailOptions);
  const raw = Buffer.isBuffer(built.message)
    ? built.message
    : Buffer.from(String(built.message || ""), "utf8");

  const smtp = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: session.email,
      pass: session.password
    }
  });

  const info = await smtp.sendMail({
    envelope: {
      from: session.email,
      to: envelopeRecipients
    },
    raw
  });

  await appendSentMessage(session, raw).catch(() => undefined);

  return {
    ok: true,
    messageId: info.messageId
  };
}
