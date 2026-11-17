import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast/ToastProvider';
import { countByKind, type MeetingItem, type MeetingItemKind } from '@/domain/meetingItems';

import { EventWriteError } from './api';
import {
  addMeetingItem,
  meetingItemsQueryKey,
  removeMeetingItem,
  useMeetingItems,
} from './meetingApi';

export type MeetingAgenda = {
  items: MeetingItem[];
  counts: Record<MeetingItemKind, number>;
  busy: boolean;
  add: (kind: MeetingItemKind, text: string) => void;
  remove: (item: MeetingItem) => void;
  /** New events only: drops the local items (type or unit changed). */
  clearLocal: () => void;
};

/**
 * RF-20. With `eventId` null (a new event) the items live in memory and are saved with the
 * event. With an id, each item is written right away and the list is read from the server.
 */
export function useMeetingAgenda(eventId: string | null, enabled: boolean): MeetingAgenda {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const remote = useMeetingItems(eventId, enabled && eventId !== null);
  const [local, setLocal] = useState<MeetingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);

  const items = eventId === null ? local : (remote.data ?? []);

  async function write(action: () => Promise<void>) {
    if (eventId === null) return;
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: meetingItemsQueryKey(eventId) });
    } catch (thrown) {
      const code = thrown instanceof EventWriteError ? thrown.code : 'unknown';
      toast.show({
        message: code === 'network' ? t('auth.errors.network') : t('common.genericError'),
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    items,
    counts: countByKind(items),
    busy,
    add: (kind, text) => {
      if (eventId === null) {
        counter.current += 1;
        setLocal((current) => [
          ...current,
          { id: `local-${counter.current}`, kind, text, carriedFromDate: null },
        ]);
        return;
      }
      void write(() => addMeetingItem(eventId, kind, text));
    },
    remove: (item) => {
      if (eventId === null) {
        setLocal((current) => current.filter((i) => i.id !== item.id));
        return;
      }
      void write(() => removeMeetingItem(item.id));
    },
    clearLocal: () => setLocal([]),
  };
}
