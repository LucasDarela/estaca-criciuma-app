import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { size, space, theme } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { useEvent } from './api';
import { EventFormScreen } from './EventFormScreen';

function FormSkeleton() {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View testID="event-form-skeleton" style={styles.skeleton}>
        <Skeleton width="40%" height={size.iconSearch} />
        <Skeleton width="90%" height={size.input} />
        <Skeleton width="90%" height={size.input} />
      </View>
    </SafeAreaView>
  );
}

/** `/event/new`: only for people who can publish somewhere (RF-01). */
export function EventFormRoute() {
  const viewer = useViewer();
  if (!viewer.loaded) return <FormSkeleton />;
  if (viewer.publishableUnits.length === 0) return <Redirect href="/agenda" />;
  return <EventFormScreen mode="new" />;
}

/** `/event/[id]/edit`: only for people who can publish in the event's unit (RF-02). */
export function EventEditRoute() {
  const { t } = useTranslation();
  const router = useRouter();
  const viewer = useViewer();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useEvent(id);
  const event = query.data;

  if (!viewer.loaded || event === undefined) return <FormSkeleton />;
  if (event === null) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <EmptyState
          icon="event"
          message={t('calendar.detail.gone')}
          action={{
            label: t('calendar.detail.seeAgenda'),
            onPress: () => router.replace('/agenda'),
          }}
        />
      </SafeAreaView>
    );
  }
  if (!viewer.canPublish(event.unitId)) {
    return <Redirect href={{ pathname: '/event/[id]', params: { id } }} />;
  }
  return <EventFormScreen mode="edit" event={event} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  skeleton: { gap: space.lg, padding: space.lg },
});
