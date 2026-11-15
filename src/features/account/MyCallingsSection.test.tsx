import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { MemberCall } from '@/domain/callings';
import i18n from '@/i18n';

import { setOrgChartConsent } from './api';
import { bishop, sundaySchoolTeacher } from './callingFixtures';
import { MyCallingsSection } from './MyCallingsSection';

jest.mock('./api', () => ({ ...jest.requireActual('./api'), setOrgChartConsent: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const bishopCall = (consent: MemberCall['orgChartConsent']): MemberCall => ({
  id: 'mc-bispo',
  unitId: 'criciuma1',
  calling: bishop,
  orgChartConsent: consent,
});
const teacherCall: MemberCall = {
  id: 'mc-prof',
  unitId: 'criciuma1',
  calling: sundaySchoolTeacher,
  orgChartConsent: null,
};

async function setup(calls: MemberCall[]) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MyCallingsSection calls={calls} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (setOrgChartConsent as jest.Mock).mockResolvedValue(undefined);
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => jest.restoreAllMocks());

describe('MyCallingsSection', () => {
  it('shows nothing without callings', async () => {
    await setup([]);
    expect(screen.queryByText('MEUS CHAMADOS')).toBeNull();
  });

  it('[roles] CA-16: a calling without a section shows name and unit, with no switch', async () => {
    await setup([teacherCall]);
    expect(screen.getByText('MEUS CHAMADOS')).toBeTruthy();
    expect(screen.getByText('Professor da Escola Dominical')).toBeTruthy();
    expect(screen.getByText('Criciúma 1')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('[roles] RNF-08: the switch is announced with the calling name and reflects the consent', async () => {
    await setup([bishopCall('accepted')]);
    const toggle = screen.getByRole('switch', { name: 'Mostrar Bispo no organograma' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('[roles] CA-13: turning the switch on saves accepted', async () => {
    await setup([bishopCall('declined')]);
    await fireEvent.press(screen.getByRole('switch', { name: 'Mostrar Bispo no organograma' }));
    await waitFor(() => expect(setOrgChartConsent).toHaveBeenCalledWith('mc-bispo', true));
  });

  it('[roles] CA-14: turning the switch off saves declined', async () => {
    await setup([bishopCall('accepted')]);
    await fireEvent.press(screen.getByRole('switch', { name: 'Mostrar Bispo no organograma' }));
    await waitFor(() => expect(setOrgChartConsent).toHaveBeenCalledWith('mc-bispo', false));
  });

  it('[roles] CA-24: in en-US the calling shows its English name', async () => {
    await i18n.changeLanguage('en-US');
    await setup([bishopCall('pending'), teacherCall]);
    expect(screen.getByText('Bishop')).toBeTruthy();
    // No English name: falls back to pt-BR.
    expect(screen.getByText('Professor da Escola Dominical')).toBeTruthy();
    expect(screen.getByText('MY CALLINGS')).toBeTruthy();
  });
});
