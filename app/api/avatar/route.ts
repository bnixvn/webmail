import crypto from "crypto";
import { resolveTxt } from "dns/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, jsonError, requireSession } from "@/lib/api";

const avatarQuerySchema = z.object({
  email: z.string().email()
});

type AvatarResponse = {
  bimiUrl: string | null;
  gravatarUrl: string;
};

const bimiCache = new Map<string, string | null>();
const gravatarCache = new Map<string, string>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function gravatarUrl(email: string) {
  const normalized = normalizeEmail(email);
  const cached = gravatarCache.get(normalized);

  if (cached) {
    return cached;
  }

  const hash = crypto.createHash("sha256").update(normalized).digest("hex");
  const url = `https://www.gravatar.com/avatar/${hash}?s=128&d=404`;
  gravatarCache.set(normalized, url);
  return url;
}

function parseBimiLogo(record: string) {
  const cleaned = record.replace(/\s+/g, " ").trim();

  if (!/^\s*v=BIMI1\b/i.test(cleaned)) {
    return null;
  }

  const match = cleaned.match(/(?:^|;)\s*l=([^;]+)/i);
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, "");

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function resolveBimiUrl(domain: string) {
  const normalized = domain.trim().toLowerCase();
  const cached = bimiCache.get(normalized);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const records = await resolveTxt(`default._bimi.${normalized}`);

    for (const parts of records) {
      const logoUrl = parseBimiLogo(parts.join(""));

      if (logoUrl) {
        bimiCache.set(normalized, logoUrl);
        return logoUrl;
      }
    }
  } catch {
    // Fall back to Gravatar below.
  }

  bimiCache.set(normalized, null);
  return null;
}

export async function GET(request: Request) {
  try {
    await requireSession();

    const url = new URL(request.url);
    const result = avatarQuerySchema.safeParse({
      email: url.searchParams.get("email") || ""
    });

    if (!result.success) {
      throw new ApiError(400, "Email address is invalid.");
    }

    const normalized = normalizeEmail(result.data.email);
    const domain = normalized.split("@")[1];

    if (!domain) {
      throw new ApiError(400, "Email address is invalid.");
    }

    const [bimiUrl, gravatar] = await Promise.all([
      resolveBimiUrl(domain),
      Promise.resolve(gravatarUrl(normalized))
    ]);

    const payload: AvatarResponse = {
      bimiUrl,
      gravatarUrl: gravatar
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
