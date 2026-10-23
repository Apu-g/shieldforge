import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { explainFinding, type FindingInput } from "@/lib/llm";

export const maxDuration = 20;

function parseFinding(body: unknown): FindingInput | null {
  if (!body || typeof body !== "object") return null;

  const value = body as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim().slice(0, 500) : "";
  if (!title) return null;

  return {
    id: typeof value.id === "string" ? value.id : undefined,
    title,
    severity: typeof value.severity === "string" ? value.severity.slice(0, 50) : undefined,
    category: typeof value.category === "string" ? value.category.slice(0, 100) : undefined,
    evidence: value.evidence,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const finding = parseFinding(body);
  if (!finding) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const result = await explainFinding(finding);
    return NextResponse.json({ ai_summary: result.summary, provider: result.provider });
  } catch (error) {
    console.error("explain failed", error);
    return NextResponse.json({ error: "all LLM providers failed" }, { status: 502 });
  }
}
