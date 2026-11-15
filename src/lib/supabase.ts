import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { secureSessionStorage } from './secureSessionStorage';

let client: SupabaseClient<Database> | null = null;

/**
 * True when both EXPO_PUBLIC_ variables exist. Without them the app opens as a visitor.
 * Direct property access: Expo only inlines `process.env.EXPO_PUBLIC_*` literally.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/**
 * Lazily creates the app client (publishable key only). It is created on demand, not at import
 * time, so the app still opens without the EXPO_PUBLIC_ variables. The session is persisted
 * encrypted by `secureSessionStorage` (RNF-01).
 * Throws when the EXPO_PUBLIC_ variables are missing.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    );
  }
  client = createClient<Database>(url, publishableKey, {
    auth: {
      storage: secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
