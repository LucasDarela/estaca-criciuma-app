import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { LinkOrganization, OrgChartLink } from '@/domain/orgChart';
import type { UnitId } from '@/domain/units';

import { LeadershipError, setUnitOrgCounselor } from './api';
import { OrgCounselorSheet } from './OrgCounselorSheet';
import { newClient, Providers } from './testSupport';

jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  setUnitOrgCounselor: jest.fn(),
}));

const links: OrgChartLink[] = [
  {
    kind: 'unit_org_counselor',
    unitId: 'criciuma1',
    organization: 'primary',
    counselorCallingId: 'bishopric_second_counselor',
  },
];

async function setup(
  unitId: UnitId = 'criciuma1',
  organization: LinkOrganization = 'sunday_school',
) {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  await render(
    <Providers client={newClient()}>
      <OrgCounselorSheet
        unitId={unitId}
        organization={organization}
        links={links}
        onSaved={onSaved}
        onClose={onClose}
      />
    </Providers>,
  );
  return { onSaved, onClose };
}

const selected = (name: string) =>
  screen.getByRole('button', { name }).props.accessibilityState?.selected as boolean;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('OrgCounselorSheet', () => {
  it('[leadership] RF-25: the organization is the title and Nenhum is marked without a link', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'Escola Dominical' })).toBeOnTheScreen();
    expect(selected('Nenhum')).toBe(true);
    expect(screen.getByLabelText('Conselheiro').props.accessibilityRole).toBe('radiogroup');
  });

  it('[leadership] RF-25: the current counselor starts marked', async () => {
    await setup('criciuma1', 'primary');
    expect(selected('2º Conselheiro')).toBe(true);
    expect(selected('1º Conselheiro')).toBe(false);
  });

  it('[leadership] CA-28: saving links the organization to the first counselor', async () => {
    const user = userEvent.setup();
    (setUnitOrgCounselor as jest.Mock).mockResolvedValue(undefined);
    const { onSaved, onClose } = await setup();
    await user.press(screen.getByRole('button', { name: '1º Conselheiro' }));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(setUnitOrgCounselor).toHaveBeenCalledWith({
      unitId: 'criciuma1',
      organization: 'sunday_school',
      counselorCallingId: 'bishopric_first_counselor',
    });
    expect(await screen.findByText('Acompanhamento salvo')).toBeOnTheScreen();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('[leadership] a branch uses the branch counselor callings', async () => {
    const user = userEvent.setup();
    (setUnitOrgCounselor as jest.Mock).mockResolvedValue(undefined);
    await setup('ramoGaivota', 'primary');
    await user.press(screen.getByRole('button', { name: '2º Conselheiro' }));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(setUnitOrgCounselor).toHaveBeenCalledWith({
      unitId: 'ramoGaivota',
      organization: 'primary',
      counselorCallingId: 'branch_second_counselor',
    });
  });

  it('[leadership] CA-28: no_counselor shows the message and the sheet stays open', async () => {
    const user = userEvent.setup();
    (setUnitOrgCounselor as jest.Mock).mockRejectedValue(new LeadershipError('no_counselor'));
    const { onClose } = await setup();
    await user.press(screen.getByRole('button', { name: '1º Conselheiro' }));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText(
        'Ninguém tem este chamado agora. Conceda o chamado em Acessos primeiro.',
      ),
    ).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('[leadership] CA-29: forbidden and then network keep the sheet open', async () => {
    const user = userEvent.setup();
    const { onClose } = await setup();
    (setUnitOrgCounselor as jest.Mock).mockRejectedValueOnce(new LeadershipError('forbidden'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Você não tem permissão para editar este organograma.'),
    ).toBeOnTheScreen();
    (setUnitOrgCounselor as jest.Mock).mockRejectedValueOnce(new LeadershipError('network'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });
});
