export function redirectWithCookies(
  path: string,
  requestUrl: string,
  cookies: string[] = [],
): Response {
  const headers = new Headers({ location: new URL(path, requestUrl).toString() })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(null, { status: 303, headers })
}
