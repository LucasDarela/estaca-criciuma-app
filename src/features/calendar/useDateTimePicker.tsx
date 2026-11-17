import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { space } from '@/theme/theme';

/** ADR 0005: Sao Paulo has had a fixed UTC-3 offset since 2019, so the zone name is equivalent. */
const PICKER_TIME_ZONE = 'America/Sao_Paulo';

export type PickerMode = 'date' | 'time';

type Pending = { mode: PickerMode; label: string; onPick: (date: Date) => void };

/**
 * Native date and time pickers (RNF-05). The picker shows and returns the Sao Paulo wall clock
 * whatever the device zone is: read the result with `toSaoPauloWallTime`, never with the local
 * getters of `Date`. Android opens its own dialog; on iOS `element` is a sheet that must be
 * rendered by the caller.
 */
export function useDateTimePicker(): {
  open: (mode: PickerMode, value: Date, onPick: (date: Date) => void, label: string) => void;
  element: ReactNode;
} {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [current, setCurrent] = useState<Date>(() => new Date());

  const open = useCallback(
    (mode: PickerMode, value: Date, onPick: (date: Date) => void, label: string) => {
      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value,
          mode,
          is24Hour: true,
          timeZoneName: PICKER_TIME_ZONE,
          onChange: (event: DateTimePickerEvent, date?: Date) => {
            if (event.type === 'set' && date) onPick(date);
          },
        });
        return;
      }
      setCurrent(value);
      setPending({ mode, label, onPick });
    },
    [],
  );

  const element =
    Platform.OS === 'ios' && pending ? (
      <Sheet visible onClose={() => setPending(null)} accessibilityLabel={pending.label}>
        <View style={styles.content}>
          <DateTimePicker
            value={current}
            mode={pending.mode}
            display="spinner"
            locale={i18n.language}
            is24Hour
            timeZoneName={PICKER_TIME_ZONE}
            onChange={(_, date) => {
              if (date) setCurrent(date);
            }}
          />
          <Button
            label={t('events.meeting.done')}
            onPress={() => {
              pending.onPick(current);
              setPending(null);
            }}
          />
        </View>
      </Sheet>
    ) : null;

  return { open, element };
}

const styles = StyleSheet.create({ content: { gap: space.md } });
