import crypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";

export const signatureSettingsSchema = z.object({
  displayName: z.string().max(200).default(""),
  email: z.string().email(),
  organization: z.string().max(300).default(""),
  replyTo: z.string().email().or(z.literal("")).default(""),
  bcc: z.string().max(1000).default(""),
  defaultEnabled: z.boolean().default(true),
  html: z.string().max(100_000).default(""),
  text: z.string().max(100_000).default("")
});

export type SignatureSettings = z.infer<typeof signatureSettingsSchema>;

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function signaturePath(email: string) {
  const key = crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
  return path.join(dataDir(), "signatures", `${key}.json`);
}

export function emptySignatureSettings(email: string): SignatureSettings {
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

export async function readSignatureSettings(email: string) {
  try {
    const payload = JSON.parse(await readFile(signaturePath(email), "utf8"));
    return signatureSettingsSchema.parse({
      ...emptySignatureSettings(email),
      ...payload,
      email
    });
  } catch {
    return emptySignatureSettings(email);
  }
}

export async function writeSignatureSettings(email: string, input: unknown) {
  const payload = input && typeof input === "object" ? input : {};
  const settings = signatureSettingsSchema.parse({
    ...payload,
    email
  });
  const filePath = signaturePath(email);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(settings, null, 2), "utf8");

  return settings;
}
