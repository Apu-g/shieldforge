export default function Home() {
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "80px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Victim Shop</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        Deliberately vulnerable demo origin for ShieldForge.
      </p>
      <form
        action="/api/login"
        method="post"
        style={{ display: "grid", gap: 12, marginTop: 32, background: "#1e293b", padding: 24, borderRadius: 12 }}
      >
        <input name="email" type="email" placeholder="you@example.com" style={{ padding: 12, borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "inherit" }} />
        <input name="password" type="password" placeholder="password (not checked)" style={{ padding: 12, borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "inherit" }} />
        <button type="submit" style={{ padding: 12, borderRadius: 8, border: 0, background: "#38bdf8", color: "#082f49", fontWeight: 700 }}>
          Sign in
        </button>
      </form>
      <p style={{ marginTop: 24 }}>
        <a href="/comment" style={{ color: "#38bdf8" }}>Skip login and open the guestbook</a>
      </p>
    </main>
  );
}
