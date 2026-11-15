import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast/ToastProvider';
import type { MemberCall } from '@/domain/callings';

import { AccountError, setOrgChartConsent } from './api';
import { bishop, primaryPresident, sundaySchoolTeacher } from './callingFixtures';
import { OrgChartConsentCard } from './OrgChartConsentCard';

jest.mock('./api', () => ({ ...jest.requireActual('./api'), setOrgChartConsent: jest.fn() }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const call = (id: string, calling: MemberCall['calling'], consent: MemberCall['orgChartConsent']) =>
  ({ id, unitId: 'criciuma1', calling, orgChartConsent: consent }) satisfies MemberCall;

async function setup(calls: MemberCall[]) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <OrgChartConsentCard calls={calls} />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  (setOrgChartConsent as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('OrgChartConsentCard', () => {
  it('[roles] CA-13: shows the question and Mostrar saves accepted and shows the toast', async () => {
    await setup([call('mc-bispo', bishop, 'pending')]);
    expect(
      screen.getByText(
        'Você recebeu o chamado Bispo em Criciúma 1. Quer que seu nome e seu chamado apareçam no organograma público da estaca?',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }));
    await waitFor(() => expect(setOrgChartConsent).toHaveBeenCalledWith('mc-bispo', true));
    expect(await screen.findByText('Seu nome aparece no organograma.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
  });

  it('[roles] CA-14: Agora não saves declined and the card goes away', async () => {
    await setup([call('mc-bispo', bishop, 'pending')]);
    await fireEvent.press(screen.getByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(setOrgChartConsent).toHaveBeenCalledWith('mc-bispo', false));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Agora não' })).toBeNull());
    expect(screen.queryByText('Seu nome aparece no organograma.')).toBeNull();
  });

  it('[roles] with two pending callings, one card at a time and the oldest first', async () => {
    await setup([
      call('mc-bispo', bishop, 'pending'),
      call('mc-primaria', primaryPresident, 'pending'),
    ]);
    expect(screen.getByText(/chamado Bispo em/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Agora não' }));
    expect(await screen.findByText(/chamado Presidente da Primária em/)).toBeTruthy();
  });

  it('[roles] CA-16: no card without a pending calling', async () => {
    await setup([
      call('mc-prof', sundaySchoolTeacher, null),
      call('mc-bispo', bishop, 'accepted'),
      call('mc-primaria', primaryPresident, 'declined'),
    ]);
    expect(screen.queryByRole('button', { name: 'Mostrar' })).toBeNull();
  });

  it('a failure keeps the card and shows the error', async () => {
    (setOrgChartConsent as jest.Mock).mockRejectedValue(new AccountError('network'));
    await setup([call('mc-bispo', bishop, 'pending')]);
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }));
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar' })).toBeTruthy();
  });
});
