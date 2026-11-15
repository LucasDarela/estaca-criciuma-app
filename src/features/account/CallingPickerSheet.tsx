import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ListItem } from '@/components/ListItem';
import { SearchField } from '@/components/SearchField';
import { Sheet } from '@/components/Sheet';
import {
  callingName,
  callingsForUnit,
  matchesCalling,
  normalizeSearch,
  type Calling,
} from '@/domain/callings';
import type { UnitId } from '@/domain/units';
import { useLocale } from '@/i18n/useLocale';
import { space, theme, type } from '@/theme/theme';

export type CallingPickerSheetProps = {
  visible: boolean;
  unitId: UnitId;
  catalog: readonly Calling[];
  /** RF-13: only the admin gets "Administração", first on the stake list. */
  includeAdmin: boolean;
  onSelect: (callingId: string | 'admin') => void;
  onClose: () => void;
};

type Row = { id: string; title: string; subtitle?: string };

/** RF-13: searchable list of the active callings that fit the unit. */
export function CallingPickerSheet({
  visible,
  unitId,
  catalog,
  includeAdmin,
  onSelect,
  onClose,
}: CallingPickerSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} accessibilityLabel={t('account.access.calling')}>
      {/* Mounted only while open, so every opening starts with an empty search. */}
      {visible ? (
        <PickerContent
          unitId={unitId}
          catalog={catalog}
          includeAdmin={includeAdmin}
          onSelect={onSelect}
        />
      ) : null}
    </Sheet>
  );
}

function PickerContent({
  unitId,
  catalog,
  includeAdmin,
  onSelect,
}: Pick<CallingPickerSheetProps, 'unitId' | 'catalog' | 'includeAdmin' | 'onSelect'>) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { height } = useWindowDimensions();
  const [term, setTerm] = useState('');

  const rows = useMemo<Row[]>(() => {
    const adminLabel = t('account.access.admin');
    const adminRow: Row[] =
      includeAdmin && matchesText(adminLabel, term) ? [{ id: 'admin', title: adminLabel }] : [];
    const callingRows = callingsForUnit(catalog, unitId)
      .filter((calling) => matchesCalling(calling, term))
      .map((calling) => ({
        id: calling.id,
        title: callingName(calling, locale),
        subtitle: calling.access === 'none' ? undefined : t(`callings.access.${calling.access}`),
      }));
    return [...adminRow, ...callingRows];
  }, [catalog, unitId, includeAdmin, term, locale, t]);

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('account.access.calling')}
      </Text>
      <SearchField
        value={term}
        onChangeText={setTerm}
        placeholder={t('callings.catalog.search')}
        size="compact"
      />
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('callings.catalog.empty', { term: term.trim() })}</Text>
      ) : (
        <FlatList
          style={{ maxHeight: height * 0.5 }}
          data={rows}
          keyExtractor={(row) => row.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ListItem
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => onSelect(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

/** Same rule as `matchesCalling`, for a plain label: under 2 characters nothing is filtered. */
function matchesText(label: string, term: string): boolean {
  const needle = normalizeSearch(term);
  return needle.length < 2 || normalizeSearch(label).includes(needle);
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  title: { ...type.headline, color: theme.heading },
  empty: { ...type.body, color: theme.textMuted, paddingVertical: space.lg },
});
