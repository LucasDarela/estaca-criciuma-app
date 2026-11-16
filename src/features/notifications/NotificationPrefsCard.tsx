import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { ListItem } from '@/components/ListItem';
import { useToast } from '@/components/toast/ToastProvider';
import { applyToggle, prefToggles, type PrefToggle } from '@/domain/notifications';
import { unitKind, type UnitId } from '@/domain/units';
import { getDevicePushToken } from '@/lib/push';
import { radius, space, stroke, theme, type, units as unitColors } from '@/theme/theme';

import { useViewer } from '../viewer/ViewerProvider';
import { fetchDeviceUnits, setDeviceUnits } from './api';

type DeviceUnits = { token: string; units: UnitId[] };

const deviceUnitsKey = ['device-units'] as const;

async function loadDeviceUnits(): Promise<DeviceUnits | null> {
  const token = await getDevicePushToken();
  if (!token) return null;
  // A device that is not registered yet starts from the default (the stake only).
  return { token, units: (await fetchDeviceUnits(token)) ?? ['estaca'] };
}

/** RF-17. "Receber avisos de": which units this device gets notices from. Only with permission. */
export function NotificationPrefsCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const viewer = useViewer();
  const homeUnitId = viewer.profile?.homeUnitId ?? null;
  const query = useQuery({ queryKey: deviceUnitsKey, queryFn: loadDeviceUnits });

  if (!query.data) return null;
  const { token, units } = query.data;

  const labels = (toggle: PrefToggle): { title: string; switchLabel: string } => {
    if (toggle.key === 'estaca') {
      const unit = t('notifications.prefs.stake');
      return { title: unit, switchLabel: t('notifications.prefs.switchLabel', { unit }) };
    }
    if (toggle.key === 'others') {
      const title = t('notifications.prefs.others');
      return { title, switchLabel: t('notifications.prefs.switchLabelOthers') };
    }
    const unitId: UnitId = toggle.key === 'home' ? (homeUnitId as UnitId) : toggle.key;
    const unit = unitColors[unitId].label;
    const title =
      toggle.key === 'home'
        ? t(
            unitKind(unitId) === 'branch'
              ? 'notifications.prefs.myBranch'
              : 'notifications.prefs.myWard',
            { unit },
          )
        : unit;
    return { title, switchLabel: t('notifications.prefs.switchLabel', { unit }) };
  };

  const change = async (toggle: PrefToggle, on: boolean) => {
    const next = applyToggle(units, toggle, on);
    // Optimistic: the switch moves at once and goes back if the server refuses.
    client.setQueryData<DeviceUnits>(deviceUnitsKey, { token, units: next });
    try {
      await setDeviceUnits(token, next);
    } catch {
      client.setQueryData<DeviceUnits>(deviceUnitsKey, { token, units });
      toast.show({ message: t('common.genericError') });
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('notifications.prefs.title')}
      </Text>
      {prefToggles(units, homeUnitId).map((toggle) => {
        const { title, switchLabel } = labels(toggle);
        return (
          <ListItem
            key={toggle.key}
            title={title}
            trailing={{
              kind: 'switch',
              value: toggle.on,
              label: switchLabel,
              onValueChange: (on) => void change(toggle, on),
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: theme.border,
    paddingVertical: space.sm,
  },
  title: {
    ...type.callout,
    color: theme.text,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
