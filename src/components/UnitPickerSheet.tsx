import { StyleSheet, Text, View } from 'react-native';

import type { UnitId } from '@/domain/units';
import { space, theme, type, units as unitTokens } from '@/theme/theme';

import { ListItem } from './ListItem';
import { Sheet } from './Sheet';

export type UnitPickerSheetProps = {
  visible: boolean;
  title: string;
  /** Label of the "no unit" option, listed first (e.g. "Prefiro não informar"). */
  noneLabel: string;
  /** null = no unit chosen. */
  value: UnitId | null;
  units: readonly UnitId[];
  /** Message shown under the title (e.g. the unit is locked). */
  error?: string;
  onSelect: (unitId: UnitId | null) => void;
  onClose: () => void;
};

/** Single-choice unit picker: the "none" option first, then each unit with its color dot. */
export function UnitPickerSheet({
  visible,
  title,
  noneLabel,
  value,
  units,
  error,
  onSelect,
  onClose,
}: UnitPickerSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={title}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <ListItem
          title={noneLabel}
          selected={value === null}
          trailing={value === null ? { kind: 'check' } : undefined}
          onPress={() => onSelect(null)}
        />
        {units.map((unitId) => (
          <ListItem
            key={unitId}
            title={unitTokens[unitId].label}
            leading={{ kind: 'unitDot', unitId }}
            selected={value === unitId}
            trailing={value === unitId ? { kind: 'check' } : undefined}
            onPress={() => onSelect(unitId)}
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.xs },
  title: { ...type.headline, color: theme.heading, paddingBottom: space.sm },
  error: { ...type.fieldError, color: theme.danger, paddingBottom: space.sm },
});
