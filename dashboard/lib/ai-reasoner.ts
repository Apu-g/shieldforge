import { getServerSupabase } from './supabase/server';
import type { FindingView } from './types';

interface AiExplanation {
  summary: string;
  provider: 'nvidia_nim' | 'groq' | 'shieldforge_expert';
}

const SYSTEM_PROMPT = `You are the Lead Cybersecurity AI Agent for ShieldForge Autonomous WAF.
A web security incident was just detected and neutralized on the customer's website.
Analyze the incident and write a concise, highly actionable explanation formatted with exact sections:

WHAT HAPPENED: (1-2 sentences on what the attacker attempted and which parameter/payload was intercepted)
WHY IT HAPPENED: (1 sentence explaining the underlying vulnerability or input risk)
PRECAUTIONARY METHODS (FIX FOR NEXT TIME): (2 concrete, technical bullet points on how the website backend should be hardened, e.g. CSP headers, sanitization functions, parameterized queries, cookie flags)

Tone: Professional, direct, founder-friendly. No fluff, no greetings.`;

function deterministicFallback(finding: Partial<FindingView>): string {
  const cat = (finding.category ?? '').toLowerCase();
  const title = finding.title ?? 'Security violation';
  const evidence = (finding.evidence as Record<string, unknown>) || {};
  const path = (evidence.path as string) || (finding.origin_url ? new URL(finding.origin_url).pathname : '/');
  const rule = (evidence.rule as string) || cat;
  const timeStr = finding.detection_seconds ? `⚡ Intercepted in ${finding.detection_seconds}s at Edge` : '⚡ Intercepted at Edge';

  if (cat === 'xss') {
    return `WHAT HAPPENED: Malicious JavaScript injection (${rule}) was submitted to ${path}. The payload attempted to execute arbitrary client-side code in victim browsers.
WHY IT HAPPENED: Input fields or URL query parameters were targeted for reflected or DOM-based execution without server-side encoding.
PRECAUTIONARY METHODS (FIX FOR NEXT TIME):
• Sanitize and escape all output using htmlspecialchars() in PHP or DOMPurify in JavaScript before rendering.
• Implement a strict Content-Security-Policy header: "default-src 'self'; script-src 'self'".
${timeStr}`;
  }

  if (cat === 'sqli') {
    return `WHAT HAPPENED: An attacker attempted SQL Injection (${rule}) targeting database query parameters on ${path}.
WHY IT HAPPENED: The endpoint was probed with boolean tautologies or UNION SELECT statements to bypass authentication or extract table data.
PRECAUTIONARY METHODS (FIX FOR NEXT TIME):
• Use parameterized prepared statements (PDO / mysqli_stmt) for all database queries with zero raw string concatenation.
• Restrict database user privileges to least-privilege (disable DROP, ALTER, and multi-statement execution).
${timeStr}`;
  }

  if (cat === 'weak_cookie') {
    return `WHAT HAPPENED: The target application issued a session cookie without the mandatory HttpOnly or Secure security flags on ${path}.
WHY IT HAPPENED: Default framework cookie settings allowed client-side JavaScript access to sensitive authentication tokens.
PRECAUTIONARY METHODS (FIX FOR NEXT TIME):
• Configure session cookies with flags: "Set-Cookie: session_id=...; Secure; HttpOnly; SameSite=Strict".
• In PHP, enable "session.cookie_httponly = 1" and "session.cookie_secure = 1" in php.ini.
${timeStr}`;
  }

  if (cat === 'php_rce' || cat === 'rce') {
    return `WHAT HAPPENED: Remote code execution probe detected targeting PHP functions or stream wrappers on ${path}.
WHY IT HAPPENED: Unfiltered input was passed into dangerous eval(), exec(), or file inclusion functions.
PRECAUTIONARY METHODS (FIX FOR NEXT TIME):
• Disable dangerous PHP functions in php.ini: "disable_functions = exec,passthru,shell_exec,system,eval".
• Avoid dynamic includes with user-controlled file paths.
${timeStr}`;
  }

  return `WHAT HAPPENED: ShieldForge WAF intercepted and blocked suspicious request (${title}) targeting ${path}.
WHY IT HAPPENED: Request payload deviated from standard application schema or matched automated reconnaissance patterns.
PRECAUTIONARY METHODS (FIX FOR NEXT TIME):
• Enforce strict schema validation on all incoming query and POST parameters.
• Maintain enforce policy in ShieldForge to automatically drop malicious IPs.
${timeStr}`;
}

export async function explainFindingWithAi(finding: Partial<FindingView>): Promise<AiExplanation> {
  const nimKey = process.env.NVIDIA_NIM_API_KEY;
  const nimModel = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

  const userContent = `Incident Details:
Title: ${finding.title ?? 'Unknown'}
Category: ${finding.category ?? 'Unknown'}
Severity: ${finding.severity ?? 'Unknown'}
Target Origin: ${finding.origin_url ?? 'Fakizon Store'}
Evidence: ${JSON.stringify(finding.evidence ?? {}).slice(0, 1500)}
Detection Latency: ${finding.detection_seconds ?? 0.25}s`;

  // 1. Try NVIDIA NIM first
  if (nimKey) {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nimKey}`,
        },
        body: JSON.stringify({
          model: nimModel,
          temperature: 0.2,
          max_tokens: 450,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 30) {
          return { summary: text, provider: 'nvidia_nim' };
        }
      }
    } catch (e) {
      console.warn('[shieldforge-ai] NVIDIA NIM timeout/error, trying Groq fallback', e);
    }
  }

  // 2. Try Groq fallback
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 30) {
          return { summary: text, provider: 'groq' };
        }
      }
    } catch (e) {
      console.warn('[shieldforge-ai] Groq error, using deterministic fallback', e);
    }
  }

  // 3. Fallback to expert security synthesizer
  return {
    summary: deterministicFallback(finding),
    provider: 'shieldforge_expert',
  };
}

/**
 * Ensures a finding has an ai_summary. If missing, generates it and updates Supabase.
 */
export async function ensureFindingReasoning(finding: FindingView): Promise<FindingView> {
  if (finding.ai_summary && finding.ai_summary.trim().length > 10) {
    return finding;
  }

  const { summary } = await explainFindingWithAi(finding);
  finding.ai_summary = summary;

  // Persist to Supabase asynchronously
  try {
    const supabase = getServerSupabase();
    await supabase
      .from('findings')
      .update({ ai_summary: summary })
      .eq('id', finding.id);
  } catch (err) {
    console.error('[shieldforge-ai] Failed to save ai_summary to Supabase:', err);
  }

  return finding;
}
