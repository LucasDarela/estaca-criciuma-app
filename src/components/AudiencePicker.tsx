import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  audienceOptions,
  audienceSummary,
  toggleAudience,
  type AudienceKey,
} from '@/domain/audience';
import { STAKE_UNIT_ID, unitKind, type UnitId } from '@/domain/units';
import { radius, size, space, stroke, theme, type, units } from '@/theme/theme';

import { Icon } from './icons/Icon';
import { minTouchSlop, pressedStyle } from './pressable';

export type AudiencePickerProps = {
  unitId: UnitId;
  value: readonly AudienceKey[];
  onChange: (next: AudienceKey[]) => void;
};

/**
 * RF-13. "Send to" chips for the audience of a push (the `Notificar` option of event-form and
 * board). Tapping the first chip selects or clears everyone; the summary tells who gets the push.
 */
export function AudiencePicker({ unitId, value, onChange }: AudiencePickerProps) {
  const { t } = useTranslation();
  const isStake = unitId === STAKE_UNIT_ID;
  const kind = unitKind(unitId);

  const labelOf = (key: AudienceKey): string => {
    if (key === 'all') return t(`push.audience.all.${kind}`);
    if (key === 'leaders') return t(`push.audience.leaders.${isStake ? 'stake' : 'unit'}`);
    const isOrganization = [
      'relief_society',
      'elders_quorum',
      'young_women',
      'young_men',
      'primary',
      'temple_family_history',
    ].includes(key);
    return isOrganization ? t(`push.audience.organizations.${key}`) : t(`callings.groups.${key}`);
  };

  const summary = audienceSummary(value, unitId);
  const summaryText =
    summary.kind === 'empty'
      ? t('push.audience.summary.empty')
      : summary.kind === 'everyone'
        ? t(`push.audience.summary.everyone.${summary.unitKind}`)
        : t('push.audience.summary.groups', { groups: summary.keys.map(labelOf).join(', ') });

  // The live region does not announce on iOS, so the change is also announced explicitly.
  const announced = useRef(summaryText);
  useEffect(() => {
    if (announced.current === summaryText) return;
    announced.current = summaryText;
    AccessibilityInfo.announceForAccessibility(summaryText);
  }, [summaryText]);

  const unitName = isStake ? t('push.audience.stakeUpper') : units[unitId].label.toUpperCase();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('push.audience.title', { unit: unitName })}</Text>
      <View style={styles.chips}>
        {audienceOptions(unitId).map((key) => {
          const checked = value.includes(key);
          const color = checked ? theme.primary : theme.text;
          const icon = key === 'all' ? 'groups' : checked ? 'check' : 'add';
          return (
            <Pressable
              key={key}
              accessibilityRole="checkbox"
              accessibilityLabel={labelOf(key)}
              accessibilityState={{ checked }}
              hitSlop={minTouchSlop(size.typeChip)}
              onPress={() => onChange(toggleAudience(value, key, unitId))}
              style={(state) => [
                styles.chip,
                checked ? styles.checked : styles.unchecked,
                pressedStyle(state),
              ]}
            >
              <Icon name={icon} size={size.iconSearch} color={color} />
              <Text style={[styles.label, { color }]}>{labelOf(key)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {summaryText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  title: { ...type.overline, color: theme.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: size.typeChip,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
  },
  checked: { backgroundColor: theme.primarySubtle, borderColor: theme.primary },
  unchecked: { backgroundColor: theme.surface, borderColor: theme.borderStrong },
  label: type.caption,
  summary: { ...type.caption, color: theme.textMuted },
});
