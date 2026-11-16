import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { AudienceKey } from '@/domain/audience';
import type { UnitId } from '@/domain/units';

import { AudiencePicker } from './AudiencePicker';

function Harness({ unitId, initial = [] }: { unitId: UnitId; initial?: AudienceKey[] }) {
  const [value, setValue] = useState<AudienceKey[]>(initial);
  return <AudiencePicker unitId={unitId} value={value} onChange={setValue} />;
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('AudiencePicker', () => {
  it('CA-07: tapping "Todos da ala" in icara selects everything and summarizes it', async () => {
    await render(<Harness unitId="icara" />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Todos da ala' }));
    expect(screen.getByRole('checkbox', { name: 'Todos da ala' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Primária' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bispados' })).toBeChecked();
    expect(
      screen.getByText('Todos os membros da ala com o app receberão o aviso.'),
    ).toBeOnTheScreen();
  });

  it('CA-08: with nothing selected the summary asks for a group', async () => {
    await render(<Harness unitId="icara" />);
    expect(
      screen.getByText('Selecione ao menos um grupo para enviar a notificação.'),
    ).toBeOnTheScreen();
  });

  it('CA-08: clearing everything shows the empty summary again', async () => {
    await render(<Harness unitId="icara" initial={['all']} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Todos da ala' }));
    expect(
      screen.getByText('Selecione ao menos um grupo para enviar a notificação.'),
    ).toBeOnTheScreen();
  });

  it('lists the chosen groups in the order of the options', async () => {
    await render(<Harness unitId="icara" />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Primária' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bispados' }));
    expect(screen.getByText('Push para: Bispados, Primária.')).toBeOnTheScreen();
  });

  it('uses the branch wording in a branch', async () => {
    await render(<Harness unitId="ramoGaivota" />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Todos do ramo' }));
    expect(
      screen.getByText('Todos os membros do ramo com o app receberão o aviso.'),
    ).toBeOnTheScreen();
  });

  it('the stake title and options include the stake-only groups', async () => {
    await render(<Harness unitId="estaca" />);
    expect(screen.getByText('ENVIAR PARA · ESTACA')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Toda a estaca' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Sumo conselho' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Líderes' })).toBeOnTheScreen();
  });

  it('a unit title uses the unit name and has no stake-only groups', async () => {
    await render(<Harness unitId="icara" />);
    expect(screen.getByText('ENVIAR PARA · IÇARA')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Sumo conselho' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Todos os líderes' })).toBeOnTheScreen();
  });

  it('RNF-11: chips are checkboxes with their checked state', async () => {
    await render(<Harness unitId="icara" initial={['primary']} />);
    expect(screen.getByRole('checkbox', { name: 'Primária' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Moças' })).not.toBeChecked();
  });

  it('RNF-11: a change in the summary is announced, and the first render is not', async () => {
    await render(<Harness unitId="icara" />);
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Primária' }));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Push para: Primária.');
  });
});
