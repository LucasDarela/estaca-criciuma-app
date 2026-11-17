import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, motion, radius, size, space, theme } from '@/theme/theme';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  accessibilityLabel: string;
  /** Fixed height as a share of the window (0-1). Without it, the sheet fits its content. */
  heightRatio?: number;
};

// Gesture thresholds for dragging the sheet down to dismiss it.
const closeDragDistance = 80;
const closeDragVelocity = 0.5;

// No accessibilityViewIsModal: the native Modal already confines screen reader focus, and the
// flag would hide the backdrop (the "Close" target) from assistive tech and from tests.
export function Sheet({ visible, onClose, children, accessibilityLabel, heightRatio }: SheetProps) {
  const { t } = useTranslation();
  const windowHeight = useWindowDimensions().height;
  const insets = useSafeAreaInsets();
  const [translateY] = useState(() => new Animated.Value(Dimensions.get('window').height));
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        translateY.setValue(0);
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.reducedFadeMs,
          useNativeDriver: true,
        }).start();
      } else {
        opacity.setValue(1);
        translateY.setValue(Dimensions.get('window').height);
        Animated.timing(translateY, {
          toValue: 0,
          duration: motion.sheetSlideMs,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, translateY, opacity]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > closeDragDistance || gesture.vy > closeDragVelocity) {
            onClose();
          } else {
            Animated.timing(translateY, {
              toValue: 0,
              duration: motion.reducedFadeMs,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [translateY, onClose],
  );

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Lifts the sheet above the keyboard on iOS (sheets with text fields). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={styles.scrim}
        />
        <Animated.View
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + space.lg, opacity, transform: [{ translateY }] },
            heightRatio === undefined ? null : { height: windowHeight * heightRatio },
          ]}
        >
          <View {...pan.panHandlers} style={styles.grab}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: theme.scrim },
  sheet: {
    paddingHorizontal: space.lg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: theme.surface,
    ...elevation[2],
  },
  grab: { minHeight: size.touchMinIos / 2, alignItems: 'center', justifyContent: 'center' },
  handle: {
    width: size.sheetHandleWidth,
    height: size.sheetHandleHeight,
    borderRadius: radius.pill,
    backgroundColor: theme.borderStrong,
  },
});
