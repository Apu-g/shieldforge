export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>ShieldForge Agent</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        LLM incident explanations and the behavioral training module.
      </p>
      <p>
        <a href="/training" style={{ color: "#38bdf8" }}>Open the training module</a>
      </p>
      <h2 style={{ fontSize: 18, marginTop: 40 }}>Endpoints</h2>
      <ul style={{ lineHeight: 1.9, color: "#cbd5e1" }}>
        <li><code>POST /api/explain</code> - finding JSON in, plain-English summary out</li>
        <li><code>POST /api/poll</code> - fill <code>findings.ai_summary</code> for unsummarized rows</li>
        <li><code>POST /api/training/simulate</code> - create phishing_sent events</li>
        <li><code>GET /api/training/click?user=&lt;uuid&gt;</code> - tracking link, records a click</li>
        <li><code>POST /api/training/decay</code> - recompute risk scores</li>
      </ul>
    </main>
  );
}
