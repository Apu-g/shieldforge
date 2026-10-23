import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { validatePolicyPatch } from "@/lib/origins";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ origin_id: string }> },
) {
  try {
    const { origin_id: originId } = await context.params;
    if (!originId) {
      return NextResponse.json(
        { error: "origin_id is required." },
        { status: 400 },
      );
    }

    const store = getStore();
    const current = await store.getPolicy(originId);
    const patch = validatePolicyPatch(await readJson(request), current ?? undefined);
    const policy = await store.updatePolicy(originId, patch);

    return NextResponse.json({ policy });
  } catch (error) {
    return jsonError(error);
  }
}
