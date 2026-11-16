import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/icons/Icon';
import type { IconName } from '@/components/icons/glyphs';
import { OfflineBanner } from '@/components/OfflineBanner';
import { pressedStyle } from '@/components/pressable';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/toast/ToastProvider';
import { groupBySection } from '@/domain/notifications';
import { civilDateOf, formatCivil, formatTime } from '@/domain/time';
import { useLocale } from '@/i18n/useLocale';
import { useIsOnline } from '@/lib/network';
import { itemExists, useInbox, useMarkRead, type InboxItem } from '@/lib/notificationInbox';
import {
  getPushPermission,
  registerDevice,
  requestPushPermission,
  type PushPermission,
} from '@/lib/push';
import { radius, size, space, stroke, theme, type, units } from '@/theme/theme';

import { NotificationPrefsCard } from './NotificationPrefsCard';

const visuals: Record<InboxItem['kind'], { icon: IconName; bg: string; fg: string }> = {
  event: { icon: 'event', bg: theme.primarySubtle, fg: theme.primary },
  post: { icon: 'campaign', bg: theme.successSubtle, fg: theme.success },
  reminder: { icon: 'alarm', bg: theme.warningSubtle, fg: theme.warningText },
};

function routeOf(item: InboxItem): string {
  if (item.kind === 'event') return `/event/${item.itemId}`;
  if (item.kind === 'post') return `/board/${item.itemId}`;
  return `/notes/${item.itemId}`;
}

/** The permission, refreshed when the app comes back (the person may have used the settings). */
function usePushPermission(): { permission: PushPermission | null; refresh: () => Promise<void> } {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      void getPushPermission().then((current) => {
        if (active) setPermission(current);
      });
    load();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') load();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  const refresh = async () => setPermission(await getPushPermission());
  return { permission, refresh };
}

/** `/notifications`: 90 days of notifications, grouped, with the preferences card (RF-14 to RF-18). */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const locale = useLocale();
  const online = useIsOnline();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const { permission, refresh } = usePushPermission();

  const items = useMemo(() => inbox.data ?? [], [inbox.data]);
  const hasUnread = items.some((item) => !item.read);
  const sections = useMemo(
    () =>
      groupBySection(items, new Date()).map((group) => ({
        key: group.section,
        title: t(`notifications.sections.${group.section}`),
        data: group.items,
      })),
    [items, t],
  );

  const failed = () => toast.show({ message: t('common.genericError') });

  const open = async (item: InboxItem) => {
    // Reading is best effort: a failure must not stop the person from opening the item.
    void markRead([item.id], items).catch(failed);
    // If the check itself fails (offline), assume the item exists; its own screen handles it.
    const exists = await itemExists(item.kind, item.itemId).catch(() => true);
    if (!exists) {
      toast.show({ message: t('notifications.itemGone') });
      return;
    }
    router.push(routeOf(item) as never);
  };

  const enable = async () => {
    const result = await requestPushPermission();
    if (result === 'granted') await registerDevice({ force: true });
    await refresh();
  };

  const footer = (
    <View style={styles.footer}>
      {permission === 'granted' ? <NotificationPrefsCard /> : null}
      {permission === 'unsupported' ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>{t('notifications.card.deviceOnly')}</Text>
        </View>
      ) : null}
      {permission === 'undetermined' ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>{t('notifications.card.enable')}</Text>
          <Button label={t('notifications.card.enableButton')} onPress={() => void enable()} />
        </View>
      ) : null}
      {permission === 'denied' ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>{t('notifications.card.disabled')}</Text>
          <Button
            variant="secondary"
            label={t('notifications.card.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('notifications.title')}
        onBack={() => router.back()}
        textAction={
          hasUnread
            ? {
                label: t('notifications.readAll'),
                onPress: () => void markRead(null, items).catch(failed),
              }
            : undefined
        }
      />
      {!online && inbox.isSuccess ? <OfflineBanner /> : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <NotificationRow item={item} locale={locale} onPress={() => void open(item)} />
        )}
        ListEmptyComponent={
          inbox.isPending ? (
            <View testID="notifications-skeleton" style={styles.skeletons}>
              <Skeleton width="100%" height={size.avatarLarge} radius="card" />
              <Skeleton width="100%" height={size.avatarLarge} radius="card" />
            </View>
          ) : inbox.isError ? (
            <EmptyState
              icon="notifications"
              message={t('common.genericError')}
              action={{ label: t('common.retry'), onPress: () => void inbox.refetch() }}
            />
          ) : (
            <EmptyState icon="notifications" message={t('notifications.empty')} />
          )
        }
        ListFooterComponent={footer}
      />
    </SafeAreaView>
  );
}

function NotificationRow({
  item,
  locale,
  onPress,
}: {
  item: InboxItem;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const visual = visuals[item.kind];
  const meta =
    item.kind === 'reminder' || item.unitId === null
      ? `${t('notifications.myNotes')} · ${formatCivil(civilDateOf(item.at), locale, { weekday: 'short' })}`
      : `${units[item.unitId].label} · ${formatTime(item.at)}`;
  const label = [item.read ? null : t('notifications.unread'), item.title, item.body, meta]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [styles.row, item.read ? styles.read : styles.unread, pressedStyle(state)]}
    >
      <View
        testID={`notification-icon-${visual.icon}`}
        style={[styles.circle, { backgroundColor: visual.bg }]}
      >
        <Icon name={visual.icon} color={visual.fg} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{item.title}</Text>
        {item.body ? (
          <Text numberOfLines={2} style={styles.body}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {item.read ? null : <View testID="notification-unread-dot" style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { paddingBottom: space.xxl },
  sectionTitle: {
    ...type.overline,
    color: theme.textMuted,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  unread: { backgroundColor: theme.primarySubtle },
  read: { backgroundColor: theme.surface },
  circle: {
    width: size.notificationCircle,
    height: size.notificationCircle,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: space.xs },
  title: { ...type.listTitle, color: theme.text },
  body: { ...type.caption, color: theme.textBody },
  meta: { ...type.caption, color: theme.textSubtle },
  dot: {
    width: size.unitDot,
    height: size.unitDot,
    borderRadius: radius.pill,
    backgroundColor: theme.primary,
    marginTop: space.sm,
  },
  skeletons: { gap: space.md, padding: space.lg },
  footer: { padding: space.lg },
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: theme.border,
    padding: space.lg,
    gap: space.md,
  },
  cardText: { ...type.body, color: theme.textBody },
});
