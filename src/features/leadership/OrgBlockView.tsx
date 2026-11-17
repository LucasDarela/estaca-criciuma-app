import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import type { OrgBlock, OrgChartMember } from '@/domain/orgChart';
import { space, theme, type } from '@/theme/theme';

import { PersonRow } from './PersonRow';

export type OrgBlockViewProps = {
  block: OrgBlock;
  editing?: boolean;
  onPersonPress: (member: OrgChartMember) => void;
  onEdit?: () => void;
};

/** An organization with its people (RF-10); in editing mode it always shows and has an Edit button (RF-25). */
export function OrgBlockView({ block, editing = false, onPersonPress, onEdit }: OrgBlockViewProps) {
  const { t } = useTranslation();
  const name = t(`leadership.org.${block.organization}`);
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {name}
        </Text>
        {editing && onEdit ? (
          <Button
            variant="ghost"
            size="compact"
            label={t('leadership.edit.button')}
            accessibilityLabel={`${t('leadership.edit.button')}: ${name}`}
            onPress={onEdit}
          />
        ) : null}
      </View>
      {block.people.length === 0 && editing ? (
        <Text style={styles.empty}>{t('leadership.empty.org')}</Text>
      ) : null}
      {block.people.map((person) => (
        <PersonRow key={person.memberCallId} member={person} showCalling onPress={onPersonPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.fieldLabel, color: theme.primary, flexShrink: 1 },
  empty: { ...type.caption, color: theme.textMuted, paddingVertical: space.sm },
});
