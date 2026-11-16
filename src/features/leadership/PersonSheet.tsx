import * as Clipboard from 'expo-clipboard';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Skeleton } from '@/components/Skeleton';
import { useToast } from '@/components/toast/ToastProvider';
import { callingName } from '@/domain/callings';
import {
  supervisedOrganizations,
  supervisedUnits,
  type OrgChartLink,
  type OrgChartMember,
} from '@/domain/orgChart';
import { formatPhone, phoneSpeech, telUrl, whatsappUrl } from '@/domain/phone';
import { useLocale } from '@/i18n/useLocale';
import { useAuthSession } from '@/lib/authSession';
import { size, space, theme, type, units } from '@/theme/theme';

import { useOrgChartPhones } from './api';

export type PersonSheetProps = {
  person: OrgChartMember | null;
  links: readonly OrgChartLink[];
  onClose: () => void;
};

/** RF-18, RF-19: who the person is, what they supervise, and how to reach them. */
export function PersonSheet({ person, links, onClose }: PersonSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet
      visible={person !== null}
      onClose={onClose}
      accessibilityLabel={person?.displayName ?? t('leadership.title')}
    >
      {person ? <PersonDetails person={person} links={links} /> : null}
    </Sheet>
  );
}

function supervisesList(
  person: OrgChartMember,
  links: readonly OrgChartLink[],
  t: (key: string) => string,
): string {
  if (person.section === 'high_council') {
    return supervisedUnits(person.memberCallId, links)
      .map((id) => units[id].label)
      .join(', ');
  }
  return supervisedOrganizations(person.unitId, person.calling.id, links)
    .map((organization) => t(`leadership.org.${organization}`))
    .join(', ');
}

function PersonDetails({
  person,
  links,
}: {
  person: OrgChartMember;
  links: readonly OrgChartLink[];
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const supervises = supervisesList(person, links, t);
  return (
    <View style={styles.content}>
      <View style={styles.identity}>
        <Avatar name={person.displayName} size="large" />
        <Text accessibilityRole="header" style={styles.name}>
          {person.displayName}
        </Text>
        <Text style={styles.subtitle}>
          {t('leadership.person.subtitle', {
            calling: callingName(person.calling, locale),
            unit: units[person.unitId].label,
          })}
        </Text>
        {supervises !== '' ? (
          <Text style={styles.subtitle}>
            {t('leadership.person.supervises', { list: supervises })}
          </Text>
        ) : null}
      </View>
      <ContactArea person={person} />
    </View>
  );
}

function ContactArea({ person }: { person: OrgChartMember }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const session = useAuthSession();
  const userId = session.status === 'signedIn' ? session.userId : null;
  const phones = useOrgChartPhones(userId, true);

  if (userId === null) {
    return (
      <View style={styles.contact}>
        <Text style={styles.note}>{t('leadership.contact.signIn')}</Text>
        <Button
          variant="ghost"
          size="compact"
          label={t('leadership.contact.signInButton')}
          onPress={() => router.push({ pathname: '/sign-in', params: { returnTo: pathname } })}
        />
      </View>
    );
  }
  if (phones.isPending) {
    return phones.fetchStatus === 'paused' ? (
      <Text style={styles.note}>{t('leadership.contact.offline')}</Text>
    ) : (
      <Skeleton width="60%" height={size.icon} />
    );
  }
  if (phones.isError) {
    return (
      <View style={styles.contact}>
        <Text style={styles.note}>{t('leadership.contact.error')}</Text>
        <Button
          variant="ghost"
          size="compact"
          label={t('common.retry')}
          onPress={() => void phones.refetch()}
        />
      </View>
    );
  }
  const phone = phones.data[person.memberCallId];
  return phone ? <PhoneActions phone={phone} name={person.displayName} /> : null;
}

function PhoneActions({ phone, name }: { phone: string; name: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const formatted = formatPhone(phone);
  const whatsapp = whatsappUrl(phone);

  async function open(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ message: t('common.genericError') });
    }
  }

  async function copy() {
    await Clipboard.setStringAsync(formatted);
    toast.show({ message: t('leadership.contact.copied'), tone: 'success' });
  }

  return (
    <View style={styles.contact}>
      <Text
        accessibilityLabel={phoneSpeech(phone)}
        onLongPress={() => void copy()}
        style={styles.phone}
      >
        {formatted}
      </Text>
      <View style={styles.buttons}>
        <Button
          variant="secondary"
          size="compact"
          icon="call"
          label={t('leadership.contact.call')}
          accessibilityLabel={t('leadership.contact.callLabel', { name })}
          onPress={() => void open(telUrl(phone))}
        />
        {whatsapp ? (
          <Button
            variant="outline"
            size="compact"
            icon="chat"
            label={t('leadership.contact.whatsapp')}
            accessibilityLabel={t('leadership.contact.whatsappLabel', { name })}
            onPress={() => void open(whatsapp)}
          />
        ) : null}
        <Button
          variant="ghost"
          size="compact"
          icon="content_copy"
          label={t('leadership.contact.copy')}
          accessibilityLabel={t('leadership.contact.copyLabel', { name })}
          onPress={() => void copy()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg },
  identity: { alignItems: 'center', gap: space.xs },
  name: { ...type.headline, color: theme.heading, textAlign: 'center', marginTop: space.sm },
  subtitle: { ...type.caption, color: theme.textMuted, textAlign: 'center' },
  contact: { alignItems: 'center', gap: space.sm },
  note: { ...type.body, color: theme.textMuted, textAlign: 'center' },
  phone: { ...type.headline, color: theme.text },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
});
