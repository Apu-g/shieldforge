// Set AGENT_SECRET to require a bearer token on write/LLM endpoints.
// The phishing click tracker stays public on purpose: recipients click a plain link.
export function isAuthorized(request: Request) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return true;

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-agent-secret") === secret
  );
}
