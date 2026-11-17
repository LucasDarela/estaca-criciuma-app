import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FilterChip } from '@/components/FilterChip';
import { Sheet } from '@/components/Sheet';
import {
  counselorCallings,
  orgCounselorOf,
  type LinkOrganization,
  type OrgChartLink,
  type UnitCounselorCallingId,
} from '@/domain/orgChart';
import { unitKind, type UnitId } from '@/domain/units';
import { space, theme, type } from '@/theme/theme';

import { setUnitOrgCounselor } from './api';
import { ChipGroup } from './ChipGroup';
import { useLinkSave } from './useLinkSave';

export type OrgCounselorSheetProps = {
  unitId: UnitId;
  organization: LinkOrganization | null;
  links: readonly OrgChartLink[];
  onSaved: () => void;
  onClose: () => void;
};

/** RF-25: which counselor of the bishopric (or branch presidency) follows an organization. */
export function OrgCounselorSheet({
  unitId,
  organization,
  links,
  onSaved,
  onClose,
}: OrgCounselorSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      visible={organization !== null}
      onClose={onClose}
      accessibilityLabel={
        organization ? t(`leadership.org.${organization}`) : t('leadership.edit.sheetTitle')
      }
    >
      {/* Mounted only while open, so every opening starts from the saved link. */}
      {organization ? (
        <OrgCounselorForm
          unitId={unitId}
          organization={organization}
          links={links}
          onSaved={onSaved}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function OrgCounselorForm({
  unitId,
  organization,
  links,
  onSaved,
  onClose,
}: Omit<OrgCounselorSheetProps, 'organization'> & { organization: LinkOrganization }) {
  const { t } = useTranslation();
  const [first, second] = counselorCallings(unitKind(unitId)) as [
    UnitCounselorCallingId,
    UnitCounselorCallingId,
  ];
  const [counselor, setCounselor] = useState<UnitCounselorCallingId | null>(
    orgCounselorOf(unitId, organization, links),
  );
  const done = () => {
    onSaved();
    onClose();
  };
  const { save, loading } = useLinkSave({ onSuccess: done, onGone: done });

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {t(`leadership.org.${organization}`)}
      </Text>
      <ChipGroup label={t('leadership.edit.counselor')} role="radiogroup">
        <FilterChip
          label={t('leadership.slot.firstCounselor')}
          selected={counselor === first}
          onPress={() => setCounselor(first)}
        />
        <FilterChip
          label={t('leadership.slot.secondCounselor')}
          selected={counselor === second}
          onPress={() => setCounselor(second)}
        />
        <FilterChip
          label={t('leadership.edit.none')}
          selected={counselor === null}
          onPress={() => setCounselor(null)}
        />
      </ChipGroup>
      <Button
        label={t('leadership.edit.save')}
        loading={loading}
        onPress={() =>
          void save(() =>
            setUnitOrgCounselor({ unitId, organization, counselorCallingId: counselor }),
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
