import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// In-memory guestbook. Resets on redeploy or cold start; reflected input below
// always works, which is what the demo payload uses.
const comments: string[] = [];

function page(commentsHtml: string, echo: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Victim Shop - Guestbook</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; }
    main { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
    h1 { margin: 0 0 4px; } .muted { color: #94a3b8; margin-top: 0; }
    form { display: flex; gap: 8px; margin: 20px 0; }
    input, textarea { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: inherit; }
    button { padding: 10px 16px; border: 0; border-radius: 8px; background: #38bdf8; color: #082f49; font-weight: 700; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 14px 16px; margin: 10px 0; }
    .echo { border-left: 3px solid #f472b6; padding-left: 12px; margin: 16px 0; }
    a { color: #38bdf8; }
  </style>
</head>
<body>
  <main>
    <h1>Guestbook</h1>
    <p class="muted">This page intentionally does not sanitize or escape user input.</p>
    <form method="post" action="/comment">
      <input name="comment" placeholder="Leave a comment" maxlength="2000">
      <button type="submit">Post</button>
    </form>
    <form method="get" action="/comment">
      <input name="q" placeholder="Echo a value (reflected)">
      <button type="submit">Echo</button>
    </form>
    ${echo ? `<div class="echo">${echo}</div>` : ""}
    ${commentsHtml || '<p class="muted">No comments yet.</p>'}
    <p style="margin-top:32px"><a href="/">Back to login</a></p>
  </main>
</body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // INTENTIONAL VULNERABILITY: reflected XSS. q is inserted into the HTML
  // response verbatim so a <script> payload executes in the visitor's browser.
  const echo = url.searchParams.get("q") ?? "";

  // INTENTIONAL VULNERABILITY: stored XSS. Comments are rendered verbatim.
  const commentsHtml = comments
    .map((comment) => `<div class="card">${comment}</div>`)
    .join("");

  return new NextResponse(page(commentsHtml, echo), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const comment = String(form.get("comment") ?? "").slice(0, 2000);

  if (comment) {
    comments.unshift(comment);
    comments.splice(50);
  }

  return NextResponse.redirect(new URL("/comment", request.url), 303);
}
