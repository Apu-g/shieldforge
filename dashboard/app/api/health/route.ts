import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const configured = isSupabaseConfigured();
  return NextResponse.json({
    status: "ok",
    service: "shieldforge-dashboard",
    mode: configured ? "supabase" : "demo",
    supabase_configured: configured,
    timestamp: new Date().toISOString(),
  });
}
