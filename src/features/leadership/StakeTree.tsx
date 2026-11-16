import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { OrgChartMember, StakeTree as StakeTreeData } from '@/domain/orgChart';
import { space } from '@/theme/theme';

import { OrgBlockView } from './OrgBlockView';
import { PersonRow } from './PersonRow';
import { Card, Section } from './Section';
import { ColumnRail, TreeConnector } from './TreeLines';
import { TreeSlot } from './TreeSlot';
import { useStackedColumns } from './useStackedColumns';

export type StakeTreeProps = {
  tree: StakeTreeData;
  editing: boolean;
  onPersonPress: (member: OrgChartMember) => void;
  onEditHighCouncilor: (member: OrgChartMember) => void;
};

/** RF-11: the stake tree, top to bottom. The JSX order is the reading order (RNF-10). */
export function StakeTree({ tree, editing, onPersonPress, onEditHighCouncilor }: StakeTreeProps) {
  const { t } = useTranslation();
  const stacked = useStackedColumns();
  const onEdit = editing ? onEditHighCouncilor : undefined;
  return (
    <View>
      <TreeSlot slot={tree.president} size="large" onPersonPress={onPersonPress} />
      <TreeConnector />
      <View testID="tree-columns" style={stacked ? styles.stacked : styles.columns}>
        {tree.columns.map((column) => (
          <View key={column.slot.callingId} style={stacked ? undefined : styles.column}>
            <TreeSlot slot={column.slot} size="default" onPersonPress={onPersonPress} />
            {column.highCouncilors.length > 0 ? (
              <ColumnRail>
                {column.highCouncilors.map((person) => (
                  <PersonRow
                    key={person.memberCallId}
                    member={person}
                    onPress={onPersonPress}
                    onEdit={onEdit}
                  />
                ))}
              </ColumnRail>
            ) : null}
          </View>
        ))}
      </View>
      {tree.unassigned.length > 0 ? (
        <Section title={t('leadership.section.unassigned')}>
          {tree.unassigned.map((person) => (
            <PersonRow
              key={person.memberCallId}
              member={person}
              onPress={onPersonPress}
              onEdit={onEdit}
            />
          ))}
        </Section>
      ) : null}
      {tree.clerks.length > 0 ? (
        <Section title={t('leadership.section.stakeClerks')}>
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
      {tree.otherPresidency.map((person) => (
        <View key={person.memberCallId} style={styles.single}>
          <Card>
            <PersonRow member={person} showCalling onPress={onPersonPress} />
          </Card>
        </View>
      ))}
      {tree.organizations.length > 0 ? (
        <Section title={t('leadership.section.stakeOrganizations')}>
          {tree.organizations.map((block) => (
            <OrgBlockView key={block.organization} block={block} onPersonPress={onPersonPress} />
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
  single: { marginTop: space.xl },
});
