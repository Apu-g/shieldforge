import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  anonKey: string | null;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;

  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = "";

/** Server-only client. Uses the service role key so API routes can write. */
export function getServerSupabase(): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const key = `${config.url}:${config.serviceRoleKey}`;
  if (cachedClient && cachedKey === key) return cachedClient;

  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cachedKey = key;
  return cachedClient;
}
