import { NextResponse } from "next/server";
import { AppError } from "./errors";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  console.error(error);
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new AppError("Expected a JSON object.", 400);
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Request body must be valid JSON.", 400);
  }
}
