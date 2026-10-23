import { admin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type TrainingUser = { id: string; name: string | null; risk_score: number | null };
type TrainingEvent = { id: string; user_id: string | null; event_type: string | null; ts: string };

export default async function TrainingPage() {
  let users: TrainingUser[] = [];
  let events: TrainingEvent[] = [];
  let assigned: { user_id: string | null }[] = [];
  let error: string | null = null;

  try {
    const supabase = admin();
    const [userResult, eventResult, assignedResult] = await Promise.all([
      supabase.from("training_users").select("id, name, risk_score").order("risk_score", { ascending: false }),
      supabase.from("training_events").select("id, user_id, event_type, ts").order("ts", { ascending: false }).limit(20),
      supabase.from("training_events").select("user_id").eq("event_type", "lesson_assigned"),
    ]);

    if (userResult.error) throw userResult.error;
    if (eventResult.error) throw eventResult.error;
    if (assignedResult.error) throw assignedResult.error;

    users = userResult.data ?? [];
    events = eventResult.data ?? [];
    assigned = assignedResult.data ?? [];
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Supabase is not configured";
  }

  const names = new Map(users.map((user) => [user.id, user.name ?? user.id]));
  const assignedUsers = new Set(assigned.map((event) => event.user_id));

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 80px" }}>
      <p><a href="/" style={{ color: "#38bdf8" }}>Back</a></p>
      <h1 style={{ fontSize: 30, marginBottom: 4 }}>Behavioral training</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        Risk score rises 10 per simulated phishing click and falls 2 per week without a click. At 30, a micro-lesson is assigned.
      </p>

      {error ? (
        <p style={{ color: "#f472b6" }}>Database unavailable: {error}</p>
      ) : (
        <>
          <h2 style={{ fontSize: 18, marginTop: 32 }}>Users</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#94a3b8" }}>
                <th style={{ padding: "8px 0" }}>Name</th>
                <th>Risk score</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderTop: "1px solid #1e293b" }}>
                  <td style={{ padding: "10px 0" }}>{user.name ?? user.id}</td>
                  <td>{user.risk_score ?? 0}</td>
                  <td style={{ color: assignedUsers.has(user.id) ? "#f472b6" : "#94a3b8" }}>
                    {assignedUsers.has(user.id) ? "Lesson assigned" : "Monitoring"}
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 16, color: "#94a3b8" }}>No training users yet. Run the seed SQL.</td></tr>
              ) : null}
            </tbody>
          </table>

          <h2 style={{ fontSize: 18, marginTop: 32 }}>Latest events</h2>
          <ul style={{ color: "#cbd5e1", lineHeight: 1.8, paddingLeft: 18 }}>
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.event_type}</strong> - {event.user_id ? names.get(event.user_id) ?? event.user_id : "unknown"} - {new Date(event.ts).toLocaleString()}
              </li>
            ))}
            {events.length === 0 ? <li style={{ color: "#94a3b8" }}>No training events yet.</li> : null}
          </ul>
        </>
      )}
    </main>
  );
}
