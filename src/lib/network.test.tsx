import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';

import { useIsOnline, wireOnlineManager } from './network';

const useNetInfoMock = useNetInfo as jest.Mock;
const addEventListenerMock = NetInfo.addEventListener as jest.Mock;

describe('useIsOnline', () => {
  it('is online when connected and the internet is reachable', async () => {
    useNetInfoMock.mockReturnValue({ isConnected: true, isInternetReachable: true });
    expect((await renderHook(() => useIsOnline())).result.current).toBe(true);
  });

  it('is online while the state is still unknown (null)', async () => {
    useNetInfoMock.mockReturnValue({ isConnected: null, isInternetReachable: null });
    expect((await renderHook(() => useIsOnline())).result.current).toBe(true);
  });

  it('is offline when not connected', async () => {
    useNetInfoMock.mockReturnValue({ isConnected: false, isInternetReachable: false });
    expect((await renderHook(() => useIsOnline())).result.current).toBe(false);
  });

  it('is offline when connected but the internet is not reachable', async () => {
    useNetInfoMock.mockReturnValue({ isConnected: true, isInternetReachable: false });
    expect((await renderHook(() => useIsOnline())).result.current).toBe(false);
  });
});

describe('wireOnlineManager', () => {
  it('feeds the TanStack online manager from NetInfo changes', () => {
    let listener: (state: unknown) => void = () => {};
    const unsubscribe = jest.fn();
    addEventListenerMock.mockImplementation((callback: (state: unknown) => void) => {
      listener = callback;
      return unsubscribe;
    });

    const stop = wireOnlineManager();
    listener({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    listener({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);

    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
