// register-device: wires HTTP and supabase-js to the pure core (ADR 0006). Visitors call it with the
// publishable key, so verify_jwt is off (supabase/config.toml) and the core classifies the caller.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { handleRegisterDevice } from '../_shared/registerDevice.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false },
  },
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    // An invalid body is answered as invalid_request by the core.
  }

  const result = await handleRegisterDevice(
    request.headers.get('Authorization'),
    request.headers.get('x-forwarded-for'),
    raw,
    {
      verifyUser: async (jwt) => {
        const { data, error } = await admin.auth.getUser(jwt);
        return error || !data.user ? null : data.user.id;
      },
      register: async (input) => {
        const { data, error } = await admin.rpc('push_register_device', {
          p_token: input.token,
          p_user_id: input.userId,
          p_platform: input.platform,
          p_locale: input.locale,
          p_ip_hash: input.ipHash,
        });
        if (error) throw new Error(error.message);
        return data as 'registered' | 'rate_limited';
      },
      hashIp: async (ip) => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      },
      log: (entry) => console.log(JSON.stringify(entry)),
      requestId: crypto.randomUUID(),
      now: () => new Date(),
    },
  );

  return json(result.status, result.body);
});
