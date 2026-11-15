import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, radius, size, space, theme, type } from '@/theme/theme';

import { Icon } from '../icons/Icon';
import { pressedStyle } from '../pressable';

export type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'success';
};

type ToastContextValue = {
  show: (options: ToastOptions) => void;
  setBottomOffset: (offset: number | null) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [bottomOffset, setBottomOffset] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  // One toast at a time: a new one replaces the current and restarts the timer.
  const show = useCallback(
    (options: ToastOptions) => {
      clearTimer();
      setToast(options);
      timer.current = setTimeout(
        dismiss,
        options.actionLabel ? motion.toastWithActionMs : motion.toastMs,
      );
      // Android reads the live region; iOS needs an explicit announcement (RNF-11).
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(options.message);
    },
    [clearTimer, dismiss],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, setBottomOffset }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        accessibilityLiveRegion="polite"
        style={[styles.overlay, { bottom: (bottomOffset ?? insets.bottom) + space.lg }]}
      >
        {toast ? (
          <View style={styles.toast}>
            {toast.tone === 'success' ? (
              <Icon name="check_circle" color={theme.toastAccent} />
            ) : null}
            <Text style={styles.message}>{toast.message}</Text>
            {toast.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                hitSlop={space.md}
                onPress={() => {
                  toast.onAction?.();
                  dismiss();
                }}
                style={(state) => pressedStyle(state)}
              >
                <Text style={styles.action}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

function useToastContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('Toast hooks must be used inside ToastProvider');
  return context;
}

export function useToast(): { show: (options: ToastOptions) => void } {
  const { show } = useToastContext();
  return useMemo(() => ({ show }), [show]);
}

/** Registers the bottom offset (e.g. the TabBar height) while the calling component is mounted. */
export function useToastBottomOffset(offset: number): void {
  const { setBottomOffset } = useToastContext();
  useEffect(() => {
    setBottomOffset(offset);
    return () => setBottomOffset(null);
  }, [offset, setBottomOffset]);
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: space.lg, right: space.lg },
  toast: {
    minHeight: size.touchMinIos,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.toast,
    backgroundColor: theme.toastBg,
  },
  message: { ...type.body, flex: 1, color: theme.onPrimary },
  action: { ...type.listTitle, color: theme.toastAccent },
});
