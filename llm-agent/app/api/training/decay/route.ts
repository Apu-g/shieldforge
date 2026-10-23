import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { decayRiskScores } from "@/lib/training";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await decayRiskScores();
    return NextResponse.json(result);
  } catch (error) {
    console.error("decay risk scores failed", error);
    return NextResponse.json({ error: "could not update risk scores" }, { status: 500 });
  }
}
