import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/toast/ToastProvider';

import { LeadershipError } from './api';

/**
 * Runs a save with no double submit and the RF-26 messages. `onSuccess` runs after the success
 * toast; `onGone` runs when the person is no longer in the high council (the sheet closes).
 */
export function useLinkSave(handlers: { onSuccess: () => void; onGone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function save(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      await action();
      toast.show({ message: t('leadership.edit.saved'), tone: 'success' });
      handlers.onSuccess();
    } catch (thrown) {
      const code = thrown instanceof LeadershipError ? thrown.code : 'unknown';
      if (code === 'not_found') {
        toast.show({ message: t('leadership.edit.error.notFound') });
        handlers.onGone();
      } else if (code === 'no_counselor') {
        toast.show({ message: t('leadership.edit.error.noCounselor') });
      } else if (code === 'forbidden') {
        toast.show({ message: t('leadership.edit.error.forbidden') });
      } else if (code === 'network') {
        toast.show({ message: t('auth.errors.network') });
      } else {
        toast.show({ message: t('leadership.edit.error.generic') });
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return { save, loading };
}
