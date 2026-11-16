import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FilterChip } from '@/components/FilterChip';
import { Sheet } from '@/components/Sheet';
import {
  counselorOf,
  supervisedUnits,
  type OrgChartLink,
  type OrgChartMember,
  type StakeCounselorCallingId,
} from '@/domain/orgChart';
import type { UnitId } from '@/domain/units';
import { space, theme, type, unitOrder, units } from '@/theme/theme';

import { setHighCouncilorLinks } from './api';
import { ChipGroup } from './ChipGroup';
import { useLinkSave } from './useLinkSave';

export type HighCouncilorLinkSheetProps = {
  person: OrgChartMember | null;
  links: readonly OrgChartLink[];
  onSaved: () => void;
  onClose: () => void;
};

const followableUnits = unitOrder.filter((id) => id !== 'estaca');

/** RF-24: which stake counselor a high councilor follows, and which units he supervises. */
export function HighCouncilorLinkSheet({
  person,
  links,
  onSaved,
  onClose,
}: HighCouncilorLinkSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      visible={person !== null}
      onClose={onClose}
      accessibilityLabel={person?.displayName ?? t('leadership.edit.sheetTitle')}
    >
      {/* Mounted only while open, so every opening starts from the saved links. */}
      {person ? (
        <HighCouncilorForm person={person} links={links} onSaved={onSaved} onClose={onClose} />
      ) : null}
    </Sheet>
  );
}

function HighCouncilorForm({
  person,
  links,
  onSaved,
  onClose,
}: {
  person: OrgChartMember;
  links: readonly OrgChartLink[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [counselor, setCounselor] = useState<StakeCounselorCallingId | null>(
    counselorOf(person.memberCallId, links),
  );
  const [selected, setSelected] = useState<readonly UnitId[]>(
    supervisedUnits(person.memberCallId, links),
  );
  const { save, loading } = useLinkSave({
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onGone: () => {
      onSaved();
      onClose();
    },
  });

  const toggle = (id: UnitId) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {person.displayName}
      </Text>
      <ChipGroup label={t('leadership.edit.counselor')} role="radiogroup">
        <FilterChip
          label={t('leadership.slot.firstCounselor')}
          selected={counselor === 'stake_first_counselor'}
          onPress={() => setCounselor('stake_first_counselor')}
        />
        <FilterChip
          label={t('leadership.slot.secondCounselor')}
          selected={counselor === 'stake_second_counselor'}
          onPress={() => setCounselor('stake_second_counselor')}
        />
        <FilterChip
          label={t('leadership.edit.none')}
          selected={counselor === null}
          onPress={() => setCounselor(null)}
        />
      </ChipGroup>
      <ChipGroup label={t('leadership.edit.units')} role="list">
        {followableUnits.map((id) => (
          <FilterChip
            key={id}
            label={units[id].label}
            dotColor={units[id].dot}
            selected={selected.includes(id)}
            onPress={() => toggle(id)}
          />
        ))}
      </ChipGroup>
      <Button
        label={t('leadership.edit.save')}
        loading={loading}
        onPress={() =>
          void save(() =>
            setHighCouncilorLinks({
              highCouncilorCallId: person.memberCallId,
              counselorCallingId: counselor,
              unitIds: followableUnits.filter((id) => selected.includes(id)),
            }),
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg },
  title: { ...type.headline, color: theme.heading },
});
