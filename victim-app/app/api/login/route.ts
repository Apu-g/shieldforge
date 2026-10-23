import { NextResponse } from "next/server";

export function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/comment", request.url), 303);

  // INTENTIONAL VULNERABILITY: no HttpOnly and no Secure flag, so page scripts can
  // read the session cookie and it would travel over plain HTTP. Demo only.
  response.headers.append("Set-Cookie", `session=${crypto.randomUUID()}; Path=/; SameSite=Lax`);

  return response;
}
