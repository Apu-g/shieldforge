import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const finding = await getStore().verifyFinding(id);
    return NextResponse.json({ finding });
  } catch (error) {
    return jsonError(error);
  }
}
