import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { explainFinding } from "@/lib/llm";
import { admin } from "@/lib/supabase";

export const maxDuration = 60;

async function poll(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = admin();
  } catch (error) {
    console.error("poll configuration error", error);
    return NextResponse.json({ error: "supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("findings")
    .select("id, severity, category, title, evidence")
    .is("ai_summary", null)
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("poll query failed", error);
    return NextResponse.json({ error: "could not read findings" }, { status: 500 });
  }

  const findings = data ?? [];
  const failures: { id: string; error: string }[] = [];
  let updated = 0;

  for (const finding of findings) {
    try {
      const { summary } = await explainFinding(finding);
      const { error: updateError } = await supabase
        .from("findings")
        .update({ ai_summary: summary })
        .eq("id", finding.id)
        .is("ai_summary", null);

      if (updateError) throw updateError;
      updated += 1;
    } catch (failure) {
      failures.push({
        id: finding.id,
        error: failure instanceof Error ? failure.message.slice(0, 300) : "unknown error",
      });
    }
  }

  return NextResponse.json({ processed: findings.length, updated, failures });
}

export async function GET(request: Request) {
  return poll(request);
}

export async function POST(request: Request) {
  return poll(request);
}
