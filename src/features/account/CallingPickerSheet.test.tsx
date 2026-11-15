import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '@/i18n';
import type { UnitId } from '@/domain/units';

import { CallingPickerSheet } from './CallingPickerSheet';
import { testCatalog } from './callingFixtures';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const onSelect = jest.fn();

async function setup(unitId: UnitId, includeAdmin = false) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CallingPickerSheet
        visible
        unitId={unitId}
        catalog={testCatalog}
        includeAdmin={includeAdmin}
        onSelect={onSelect}
        onClose={jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => jest.restoreAllMocks());

describe('CallingPickerSheet', () => {
  it('[roles] CA-10: Ramo Gaivota lists Presidente do Ramo and the ward-and-branch callings, never Bispo', async () => {
    await setup('ramoGaivota');
    expect(screen.getByText('Presidente do Ramo')).toBeTruthy();
    expect(screen.getByText('Presidente da Primária')).toBeTruthy();
    expect(screen.queryByText('Bispo')).toBeNull();
    expect(screen.queryByText('Sumo Conselheiro')).toBeNull();
  });

  it('shows the access label as the subtitle, only when the calling gives access', async () => {
    await setup('icara');
    expect(screen.getByText('Liderança da unidade')).toBeTruthy(); // Bispo
    expect(screen.getByText('Publicação da unidade')).toBeTruthy(); // Presidente da Primária
    expect(screen.getByRole('button', { name: 'Professor da Escola Dominical' })).toBeTruthy();
  });

  it('lists the stake callings by sort order, without the inactive ones', async () => {
    await setup('estaca');
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    const stake = names.filter((n: string) => /Sumo|Sociedade|Antigo/.test(n));
    expect(stake).toEqual([
      'Sumo Conselheiro, Liderança da estaca',
      'Presidente da Sociedade de Socorro da Estaca, Publicação da estaca',
    ]);
  });

  it('[roles] CA-11: Administração is listed first, only when includeAdmin', async () => {
    await setup('estaca', true);
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    const first = labels.find((n: string) => /Administração|Sumo Conselheiro|Sociedade/.test(n));
    expect(first).toBe('Administração');
  });

  it('[roles] CA-11: no Administração without includeAdmin', async () => {
    await setup('estaca', false);
    expect(screen.queryByText('Administração')).toBeNull();
  });

  it('[roles] CA-17: searching without accents filters the list', async () => {
    await setup('icara');
    await fireEvent.changeText(screen.getByLabelText('Buscar chamado'), 'primaria');
    expect(screen.getByText('Presidente da Primária')).toBeTruthy();
    expect(screen.queryByText('Bispo')).toBeNull();
  });

  it('shows the empty message when nothing matches', async () => {
    await setup('icara');
    await fireEvent.changeText(screen.getByLabelText('Buscar chamado'), 'zzzz');
    expect(screen.getByText('Nenhum chamado encontrado para "zzzz".')).toBeTruthy();
  });

  it('[roles] CA-24: names follow the interface language, with the pt-BR fallback', async () => {
    await i18n.changeLanguage('en-US');
    await setup('icara');
    expect(screen.getByText('Bishop')).toBeTruthy();
    expect(screen.getByText('Professor da Escola Dominical')).toBeTruthy();
  });

  it('selecting a row calls onSelect with the calling id', async () => {
    await setup('icara');
    await fireEvent.press(screen.getByRole('button', { name: /^Bispo/ }));
    expect(onSelect).toHaveBeenCalledWith('bishop');
  });
});
