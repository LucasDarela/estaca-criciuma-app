import NetInfo, { useNetInfo, type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/** `null` (still unknown) counts as online so the offline banner does not flash on launch. */
function isOnlineState(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useIsOnline(): boolean {
  return isOnlineState(useNetInfo());
}

/**
 * Feeds the TanStack online manager from NetInfo, so queries pause offline and refetch on
 * reconnect (RF-18). Call once at the root; the returned function undoes it.
 */
export function wireOnlineManager(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineState(state))),
  );
  return () => onlineManager.setEventListener(() => () => {});
}
