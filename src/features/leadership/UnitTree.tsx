import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type {
  LinkOrganization,
  OrgChartMember,
  OrgBlock,
  UnitTree as UnitTreeData,
} from '@/domain/orgChart';
import { space, theme, type } from '@/theme/theme';

import { OrgBlockView } from './OrgBlockView';
import { PersonRow } from './PersonRow';
import { Section } from './Section';
import { ColumnRail, TreeConnector } from './TreeLines';
import { TreeSlot } from './TreeSlot';
import { useStackedColumns } from './useStackedColumns';

export type UnitTreeProps = {
  tree: UnitTreeData;
  editing: boolean;
  onPersonPress: (member: OrgChartMember) => void;
  onEditOrganization: (organization: LinkOrganization) => void;
};

/** RF-12: the tree of a ward or branch. The JSX order is the reading order (RNF-10). */
export function UnitTree({ tree, editing, onPersonPress, onEditOrganization }: UnitTreeProps) {
  const { t } = useTranslation();
  const stacked = useStackedColumns();

  const block = (item: OrgBlock) => (
    <OrgBlockView
      key={item.organization}
      block={item}
      editing={editing}
      onPersonPress={onPersonPress}
      onEdit={() => onEditOrganization(item.organization as LinkOrganization)}
    />
  );

  return (
    <View>
      {tree.supervisedBy.length > 0 ? (
        <View style={styles.supervised}>
          <Section title={t('leadership.section.supervisedBy')}>
            {tree.supervisedBy.map((person) => (
              <PersonRow
                key={person.memberCallId}
                member={person}
                title={t('leadership.supervisedBy', { name: person.displayName })}
                onPress={onPersonPress}
              />
            ))}
          </Section>
        </View>
      ) : null}
      <TreeSlot slot={tree.top} size="large" onPersonPress={onPersonPress} />
      <TreeConnector />
      <View testID="tree-columns" style={stacked ? styles.stacked : styles.columns}>
        {tree.columns.map((column) => (
          <View key={column.slot.callingId} style={stacked ? undefined : styles.column}>
            <TreeSlot slot={column.slot} size="default" onPersonPress={onPersonPress} />
            {column.blocks.length > 0 ? <ColumnRail>{column.blocks.map(block)}</ColumnRail> : null}
          </View>
        ))}
      </View>
      {tree.isEmpty ? <Text style={styles.empty}>{t('leadership.empty.unit')}</Text> : null}
      {tree.unassigned.length > 0 ? (
        <Section title={t('leadership.section.unassigned')}>{tree.unassigned.map(block)}</Section>
      ) : null}
      {tree.clerks.length > 0 ? (
        <Section title={t('leadership.section.clerks')}>
          {tree.clerks.map((person) => (
            <PersonRow
              key={person.memberCallId}
              member={person}
              showCalling
              onPress={onPersonPress}
            />
          ))}
        </Section>
      ) : null}
      {tree.others.length > 0 ? (
        <Section title={t('leadership.section.others')}>
          {tree.others.map((person) => (
            <PersonRow
              key={person.memberCallId}
              member={person}
              showCalling
              onPress={onPersonPress}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: space.md },
  column: { flex: 1 },
  stacked: { gap: space.lg },
  supervised: { marginBottom: space.xl },
  empty: { ...type.body, color: theme.textMuted, textAlign: 'center', marginTop: space.xl },
});
