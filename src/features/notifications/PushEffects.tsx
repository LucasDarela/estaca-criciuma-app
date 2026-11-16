import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuthSession } from '@/lib/authSession';
import { fetchInbox, inboxQueryKey, markRead } from '@/lib/notificationInbox';
import {
  configurePushPresentation,
  getPushPermission,
  registerDevice,
  useEnablePushPrompt,
} from '@/lib/push';

import { EnablePushSheet } from './EnablePushSheet';

/** The item a notification points to, or null for data this app did not send. */
function targetOf(data: unknown): { kind: 'event' | 'post'; itemId: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { kind, itemId } = data as Record<string, unknown>;
  return (kind === 'event' || kind === 'post') && typeof itemId === 'string'
    ? { kind, itemId }
    : null;
}

/**
 * UI-less effects of push (plus the "Receber avisos?" sheet):
 * 1. presentation: banner with the app open, Android channel (RF-22);
 * 2. registration: on open and on return to the app, at most once a day (RF-07);
 * 3. signing in or out (or switching account) registers again at once (RF-07, CA-03);
 * 4. a tapped notification opens its item and marks it read (RF-16, RF-22, CA-17);
 * 5. after the welcome, asks to enable notices (RF-05).
 */
export function PushEffects() {
  const router = useRouter();
  const client = useQueryClient();
  const auth = useAuthSession();
  const prompt = useEnablePushPrompt();
  const [sheetVisible, setSheetVisible] = useState(false);
  const handled = useRef(new Set<string>());
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const lastUserId = useRef<string | null>(userId);

  useEffect(() => {
    void configurePushPresentation();
    void registerDevice();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void registerDevice();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (lastUserId.current === userId) return;
    lastUserId.current = userId;
    void registerDevice({ force: true });
  }, [userId]);

  useEffect(() => {
    const open = async (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      const target = targetOf(response.notification.request.content.data);
      if (!target || handled.current.has(identifier)) return;
      handled.current.add(identifier);

      router.push(
        (target.kind === 'event' ? `/event/${target.itemId}` : `/board/${target.itemId}`) as never,
      );

      // Marking as read is best effort: the item is already open and the list will say what is unread.
      try {
        const items = await client.fetchQuery({
          queryKey: inboxQueryKey(userId),
          queryFn: () => fetchInbox(userId, new Date()),
          staleTime: 0,
        });
        const ids = items
          .filter((item) => item.kind === target.kind && item.itemId === target.itemId)
          .map((item) => item.id);
        if (ids.length > 0) await markRead(ids, items, client);
      } catch {
        // Offline or the server is down: the item stays unread until the next successful load.
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void open(response);
    });
    // App opened by tapping a notification while it was closed.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void open(response);
    });
    return () => subscription.remove();
  }, [router, client, userId]);

  const { pending, dismiss } = prompt;
  useEffect(() => {
    if (!pending) return;
    let active = true;
    void getPushPermission().then((permission) => {
      if (!active) return;
      if (permission === 'undetermined') {
        setSheetVisible(true);
        return;
      }
      // Already granted: no question to ask, just link the device to the new account.
      if (permission === 'granted') void registerDevice({ force: true });
      dismiss();
    });
    return () => {
      active = false;
    };
  }, [pending, dismiss]);

  return (
    <EnablePushSheet
      visible={sheetVisible && pending}
      onClose={() => {
        setSheetVisible(false);
        dismiss();
      }}
    />
  );
}
