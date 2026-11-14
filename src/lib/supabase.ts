import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

let client: SupabaseClient<Database> | null = null;

/**
 * Lazily creates the app client (anon key only). It is created on demand, not at import time,
 * so the app still opens without the EXPO_PUBLIC_ variables; nothing queries Supabase without
 * a session. Session persistence is off until `auth-account` adds storage.
 * Throws when the EXPO_PUBLIC_ variables are missing.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;
  // Direct property access: Expo only inlines `process.env.EXPO_PUBLIC_*` literally.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY',
    );
  }
  client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
