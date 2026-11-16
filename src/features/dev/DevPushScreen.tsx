import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AudiencePicker } from '@/components/AudiencePicker';
import { Button } from '@/components/Button';
import { ListItem } from '@/components/ListItem';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { UnitPickerSheet } from '@/components/UnitPickerSheet';
import { useToast } from '@/components/toast/ToastProvider';
import { isAudienceValid, type AudienceKey } from '@/domain/audience';
import { unitIds, type UnitId } from '@/domain/units';
import { PushError, pushErrorMessageKey, sendPush } from '@/lib/push';
import { space, theme, units as unitTokens } from '@/theme/theme';

/** Dev-only form to try `sendPush` on a real device (QA step 3 of push-notifications). */
export function DevPushScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const [itemId, setItemId] = useState('');
  const [unitId, setUnitId] = useState<UnitId>('estaca');
  const [audience, setAudience] = useState<AudienceKey[]>([]);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    try {
      const { recipients } = await sendPush({ kind: 'event', itemId: itemId.trim(), audience });
      toast.show({ message: t('dev.push.result', { count: recipients }), tone: 'success' });
    } catch (thrown) {
      const code = thrown instanceof PushError ? thrown.code : 'unknown';
      toast.show({ message: t(pushErrorMessageKey[code]) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('dev.push.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <TextField
          label={t('dev.push.eventId')}
          value={itemId}
          onChangeText={setItemId}
          autoCapitalize="none"
        />
        <ListItem
          title={t('dev.push.unit')}
          subtitle={unitTokens[unitId].label}
          trailing={{ kind: 'chevron' }}
          onPress={() => setPicking(true)}
        />
        <AudiencePicker unitId={unitId} value={audience} onChange={setAudience} />
        <View>
          <Button
            label={t('dev.push.send')}
            loading={loading}
            disabled={itemId.trim() === '' || !isAudienceValid(audience, unitId)}
            onPress={() => void send()}
          />
        </View>
      </ScrollView>
      <UnitPickerSheet
        visible={picking}
        title={t('dev.push.unit')}
        noneLabel={unitTokens.estaca.label}
        value={unitId}
        units={unitIds.filter((id) => id !== 'estaca')}
        onSelect={(next) => {
          setUnitId(next ?? 'estaca');
          setAudience([]);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

/** Production builds go back to the Agenda, like the component catalog. */
export function DevPushRoute() {
  return __DEV__ ? <DevPushScreen /> : <Redirect href="/agenda" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: space.lg, gap: space.lg },
});
