import { NextResponse } from "next/server";
import { recordClick } from "@/lib/training";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

function html(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    main { max-width: 640px; margin: 0 auto; padding: 64px 24px; }
    pre { white-space: pre-wrap; background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px; line-height: 1.5; }
    .flag { color: #f472b6; font-weight: 700; }
    a { color: #38bdf8; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

// shortcut: links carry the raw user id, so anyone with a valid id can record a
// click. Sign links with an HMAC if this ever leaves the demo.
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("user");

  if (!isUuid(userId)) {
    return html("Invalid link", "<h1>Invalid link</h1><p class='flag'>This tracking link is missing a valid user.</p>");
  }

  try {
    const result = await recordClick(userId);

    if (!result) {
      return html("Unknown user", "<h1>Unknown user</h1><p class='flag'>This tracking link points at a user that no longer exists.</p>", 404);
    }

    return html(
      "Simulated phishing click",
      `<h1>You clicked a simulated phishing link</h1>
       <p class="flag">No real account was compromised. This was a ShieldForge training exercise.</p>
       <p>Your risk score is now <strong>${result.risk_score}</strong>.</p>
       ${result.lesson_assigned ? "<p>A micro-lesson has been assigned to your training record.</p>" : ""}
       ${result.lesson ? `<pre>${result.lesson}</pre>` : ""}`,
    );
  } catch (error) {
    console.error("record click failed", error);
    return html("Error", "<h1>Something went wrong</h1><p class='flag'>The click could not be recorded.</p>", 500);
  }
}
