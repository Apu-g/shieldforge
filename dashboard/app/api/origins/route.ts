import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { normalizeOrigin } from "@/lib/origins";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const raw = body.origin_url;
    if (typeof raw !== "string") {
      throw new ValidationError("origin_url is required.");
    }

    const normalized = normalizeOrigin(raw);
    const created = await getStore().createOrigin(normalized);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
