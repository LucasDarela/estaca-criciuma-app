import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { OrgChartLink } from '@/domain/orgChart';
import { makeCalled } from '@/domain/orgChartFixtures';

import { LeadershipError, setHighCouncilorLinks } from './api';
import { HighCouncilorLinkSheet } from './HighCouncilorLinkSheet';
import { newClient, Providers } from './testSupport';

jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  setHighCouncilorLinks: jest.fn(),
}));

const person = makeCalled('high_councilor', 'high_council', {
  displayName: 'Caetano Sumo',
  namePt: 'Sumo Conselheiro',
});
const links: OrgChartLink[] = [
  {
    kind: 'high_council_counselor',
    memberCallId: person.memberCallId,
    counselorCallingId: 'stake_first_counselor',
  },
  { kind: 'high_council_unit', memberCallId: person.memberCallId, targetUnitId: 'icara' },
];

async function setup() {
  const onSaved = jest.fn();
  const onClose = jest.fn();
  await render(
    <Providers client={newClient()}>
      <HighCouncilorLinkSheet person={person} links={links} onSaved={onSaved} onClose={onClose} />
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

describe('HighCouncilorLinkSheet', () => {
  it('[leadership] RF-24: starts from the saved links, with the person as the title', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'Caetano Sumo' })).toBeOnTheScreen();
    expect(selected('1º Conselheiro')).toBe(true);
    expect(selected('2º Conselheiro')).toBe(false);
    expect(selected('Nenhum')).toBe(false);
    expect(selected('Içara')).toBe(true);
    expect(selected('Criciúma 1')).toBe(false);
  });

  it('[leadership] RNF-13: the chip groups are labelled', async () => {
    await setup();
    expect(screen.getByLabelText('Conselheiro').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByLabelText('Unidades que acompanha').props.accessibilityRole).toBe('list');
  });

  it('[leadership] CA-27: saves the counselor and the units, then closes and reloads', async () => {
    const user = userEvent.setup();
    (setHighCouncilorLinks as jest.Mock).mockResolvedValue(undefined);
    const { onSaved, onClose } = await setup();
    await user.press(screen.getByRole('button', { name: '2º Conselheiro' }));
    await user.press(screen.getByRole('button', { name: 'Araranguá' }));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(setHighCouncilorLinks).toHaveBeenCalledWith({
      highCouncilorCallId: person.memberCallId,
      counselorCallingId: 'stake_second_counselor',
      unitIds: ['icara', 'ararangua'],
    });
    expect(await screen.findByText('Acompanhamento salvo')).toBeOnTheScreen();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('[leadership] Nenhum clears the counselor and a chip can be unmarked', async () => {
    const user = userEvent.setup();
    (setHighCouncilorLinks as jest.Mock).mockResolvedValue(undefined);
    await setup();
    await user.press(screen.getByRole('button', { name: 'Nenhum' }));
    await user.press(screen.getByRole('button', { name: 'Içara' }));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(setHighCouncilorLinks).toHaveBeenCalledWith({
      highCouncilorCallId: person.memberCallId,
      counselorCallingId: null,
      unitIds: [],
    });
  });

  it('[leadership] a second press while saving does not send twice', async () => {
    const user = userEvent.setup();
    (setHighCouncilorLinks as jest.Mock).mockReturnValue(new Promise(() => {}));
    await setup();
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(setHighCouncilorLinks).toHaveBeenCalledTimes(1);
  });

  it('[leadership] CA-29: forbidden and then a network failure keep the sheet open', async () => {
    const user = userEvent.setup();
    const { onClose, onSaved } = await setup();
    (setHighCouncilorLinks as jest.Mock).mockRejectedValueOnce(new LeadershipError('forbidden'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Você não tem permissão para editar este organograma.'),
    ).toBeOnTheScreen();
    (setHighCouncilorLinks as jest.Mock).mockRejectedValueOnce(new LeadershipError('network'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Sem conexão. Verifique a internet e tente de novo.'),
    ).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeOnTheScreen();
  });

  it('[leadership] RF-26: not_found shows the message, closes and reloads', async () => {
    const user = userEvent.setup();
    const { onClose, onSaved } = await setup();
    (setHighCouncilorLinks as jest.Mock).mockRejectedValueOnce(new LeadershipError('not_found'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Esta pessoa não está mais no sumo conselho.'),
    ).toBeOnTheScreen();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('[leadership] RF-26: no_counselor and any other error keep the sheet open', async () => {
    const user = userEvent.setup();
    const { onClose } = await setup();
    (setHighCouncilorLinks as jest.Mock).mockRejectedValueOnce(new LeadershipError('no_counselor'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText(
        'Ninguém tem este chamado agora. Conceda o chamado em Acessos primeiro.',
      ),
    ).toBeOnTheScreen();
    (setHighCouncilorLinks as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await user.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });
});
