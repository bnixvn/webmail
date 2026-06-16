import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new ApiError(401, "Not authenticated.");
  }

  return session;
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unexpected error.";
  return NextResponse.json({ error: message }, { status: 500 });
}
