import type { SupabaseClient } from "@supabase/supabase-js";
import { admin } from "./supabase";

export const LESSON_THRESHOLD = 30;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const LESSON_MARKDOWN = `# Spotting a phishing link

- Check the sender's domain, not just the display name.
- Hover before you click; the real URL is often a lookalike.
- Be suspicious of urgency, payment requests, and unexpected attachments.
- Report the message to your team instead of forwarding it.
- If you already clicked, change your password and tell IT immediately.`;

// Risk = 10 per click, minus 2 for each full week since the latest click.
// The formula is recomputed from events so it is safe to run repeatedly.
async function recomputeRisk(supabase: SupabaseClient, userId: string) {
  const { data: clicks, error } = await supabase
    .from("training_events")
    .select("ts")
    .eq("user_id", userId)
    .eq("event_type", "phishing_clicked")
    .order("ts", { ascending: true });

  if (error) throw error;
  if (!clicks?.length) {
    await supabase.from("training_users").update({ risk_score: 0 }).eq("id", userId);
    return 0;
  }

  const lastClick = new Date(clicks[clicks.length - 1].ts).getTime();
  const weeks = Math.floor((Date.now() - lastClick) / WEEK_MS);
  const score = Math.max(0, clicks.length * 10 - weeks * 2);

  const { error: updateError } = await supabase
    .from("training_users")
    .update({ risk_score: score })
    .eq("id", userId);

  if (updateError) throw updateError;

  return score;
}

export async function simulatePhishing(userIds?: string[]) {
  const supabase = admin();
  let ids = userIds;

  if (!ids) {
    const { data, error } = await supabase.from("training_users").select("id");
    if (error) throw error;
    ids = (data ?? []).map((user) => user.id);
  }

  if (!ids.length) return { created: 0, userIds: [] as string[] };

  const { error } = await supabase
    .from("training_events")
    .insert(ids.map((userId) => ({ user_id: userId, event_type: "phishing_sent" })));

  if (error) throw error;

  return { created: ids.length, userIds: ids };
}

export async function recordClick(userId: string) {
  const supabase = admin();

  const { data: user, error: userError } = await supabase
    .from("training_users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) return null;

  const { error: clickError } = await supabase
    .from("training_events")
    .insert({ user_id: userId, event_type: "phishing_clicked" });

  if (clickError) throw clickError;

  // shortcut: two simultaneous clicks for one user can undercount by 10.
  // Fine for a demo; move this into a Postgres RPC with a row lock if it matters.
  const riskScore = await recomputeRisk(supabase, userId);

  let lessonAssigned = false;

  if (riskScore >= LESSON_THRESHOLD) {
    const { data: existing, error: existingError } = await supabase
      .from("training_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "lesson_assigned")
      .limit(1);

    if (existingError) throw existingError;

    if (!existing?.length) {
      const { error: assignError } = await supabase
        .from("training_events")
        .insert({ user_id: userId, event_type: "lesson_assigned" });

      if (assignError) throw assignError;
      lessonAssigned = true;
    }
  }

  return {
    risk_score: riskScore,
    lesson_assigned: lessonAssigned,
    lesson: riskScore >= LESSON_THRESHOLD ? LESSON_MARKDOWN : null,
  };
}

export async function decayRiskScores() {
  const supabase = admin();
  const { data: users, error } = await supabase
    .from("training_users")
    .select("id, risk_score");

  if (error) throw error;

  let changed = 0;

  for (const user of users ?? []) {
    const score = await recomputeRisk(supabase, user.id);
    if (score !== (user.risk_score ?? 0)) changed += 1;
  }

  return { checked: users?.length ?? 0, changed };
}
