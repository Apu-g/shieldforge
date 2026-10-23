import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const store = getStore();
    if (store.mode !== "demo") {
      throw new AppError("Reset is only available in local demo mode.", 400);
    }
    await store.resetDemo();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
