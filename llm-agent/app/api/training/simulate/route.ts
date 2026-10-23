import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { simulatePhishing } from "@/lib/training";
import { isUuid } from "@/lib/validation";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const text = await request.text();
  let body: { user_ids?: unknown } = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
  }

  const userIds = body.user_ids;
  if (userIds !== undefined) {
    if (!Array.isArray(userIds) || userIds.length > 100 || !userIds.every(isUuid)) {
      return NextResponse.json({ error: "user_ids must be up to 100 UUIDs" }, { status: 400 });
    }
  }

  try {
    const result = await simulatePhishing(userIds);
    const links = result.userIds.map((id) => ({
      user_id: id,
      tracking_url: new URL(`/api/training/click?user=${id}`, request.url).toString(),
    }));

    return NextResponse.json({ ...result, links });
  } catch (error) {
    console.error("simulate phishing failed", error);
    return NextResponse.json({ error: "could not create training events" }, { status: 500 });
  }
}
