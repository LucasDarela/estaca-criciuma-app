// send-push: wires HTTP, supabase-js and fetch to the pure core (ADR 0006). The rules live in
// _shared/sendPush.ts (tested by Jest) and in the SQL functions push_* (tested by pgTAP).
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

import { eventPushBody, postPushBody } from '../_shared/pushContent.ts';
import { handleSendPush, type ExpoMessage } from '../_shared/sendPush.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false },
  },
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    // An invalid body is answered as invalid_request by the core.
  }

  const result = await handleSendPush(request.headers.get('Authorization'), raw, {
    verifyUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
    pushItem: async (kind, itemId) => {
      const rows = await rpc<
        {
          unit_id: string;
          title: string;
          starts_at: string | null;
          location: string | null;
          text_body: string | null;
        }[]
      >('push_item', { p_kind: kind, p_item_id: itemId });
      const row = rows[0];
      return {
        unitId: row.unit_id,
        title: row.title,
        startsAt: row.starts_at ? new Date(row.starts_at) : null,
        location: row.location,
        textBody: row.text_body,
      };
    },
    prepare: async (input) => {
      const data = await rpc<{
        notification_id: string;
        recipients: { token: string; locale: string }[];
      }>('push_prepare', {
        p_actor: input.actor,
        p_kind: input.kind,
        p_item_id: input.itemId,
        p_audience: input.audience,
        p_title: input.title,
        p_body: input.body,
        p_event_starts_at: input.eventStartsAt ? input.eventStartsAt.toISOString() : null,
        p_event_location: input.eventLocation,
      });
      return { notificationId: data.notification_id, recipients: data.recipients };
    },
    postToExpo: async (messages: ExpoMessage[]) => {
      const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          ...(expoToken ? { Authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      if (!response.ok) return { ok: false as const, status: response.status };
      const payload = await response.json();
      return { ok: true as const, tickets: payload.data };
    },
    removeDevices: (tokens) => rpc('push_remove_devices', { p_tokens: tokens }),
    discard: (notificationId) => rpc('push_discard', { p_notification_id: notificationId }),
    content: { eventPushBody, postPushBody },
    log: (entry) => console.log(JSON.stringify(entry)),
    requestId: crypto.randomUUID(),
    now: () => new Date(),
  });

  return json(result.status, result.body);
});
