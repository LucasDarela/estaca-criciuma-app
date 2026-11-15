import { focusManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Tells TanStack Query when the app is focused, so queries (the viewer included) refetch when the
 * app returns to the foreground (design-system RF-19, auth-account 7.6).
 */
export function useAppStateFocus(): void {
  useEffect(() => {
    focusManager.setEventListener((handleFocus) => {
      const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
        handleFocus(status === 'active');
      });
      return () => subscription.remove();
    });
    // Restores the default (browser) listener on unmount.
    return () => focusManager.setEventListener(() => () => {});
  }, []);
}
