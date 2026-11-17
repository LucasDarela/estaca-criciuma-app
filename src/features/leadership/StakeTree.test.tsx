import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { buildStakeTree, type OrgChartLink, type OrgChartMember } from '@/domain/orgChart';
import { makeCalled } from '@/domain/orgChartFixtures';

import { StakeTree } from './StakeTree';

const president = makeCalled('stake_president', 'stake_presidency', {
  displayName: 'Presidente Souza',
  namePt: 'Presidente da Estaca',
  sortOrder: 10,
});
const first = makeCalled('stake_first_counselor', 'stake_presidency', {
  displayName: 'Primeiro Lima',
  namePt: 'Primeiro Conselheiro',
  sortOrder: 20,
});
const patriarch = makeCalled('stake_patriarch', 'stake_presidency', {
  displayName: 'Patriarca Reis',
  namePt: 'Patriarca da Estaca',
  sortOrder: 40,
});
const hcs = ['Bruno', 'Carlos', 'Álvaro', 'Daniel', 'Éder', 'Fábio'].map((displayName) =>
  makeCalled('high_councilor', 'high_council', {
    displayName,
    namePt: 'Sumo Conselheiro',
    sortOrder: 50,
  }),
);
const clerks = [
  makeCalled('stake_executive_secretary', 'stake_clerks', {
    displayName: 'Exec',
    namePt: 'Secretário Executivo',
    sortOrder: 60,
  }),
  makeCalled('stake_clerk', 'stake_clerks', {
    displayName: 'Clerk',
    namePt: 'Secretário',
    sortOrder: 80,
  }),
];
const links: OrgChartLink[] = hcs.map((m, index) =>
  index < 3
    ? {
        kind: 'high_council_counselor',
        memberCallId: m.memberCallId,
        counselorCallingId: 'stake_first_counselor',
      }
    : {
        kind: 'high_council_counselor',
        memberCallId: m.memberCallId,
        counselorCallingId: 'stake_second_counselor',
      },
);
const members: OrgChartMember[] = [president, first, patriarch, ...hcs, ...clerks];

async function setup(extra: OrgChartMember[] = [], editing = false) {
  const onPersonPress = jest.fn();
  const onEditHighCouncilor = jest.fn();
  const tree = buildStakeTree([...members, ...extra], links);
  await render(
    <StakeTree
      tree={tree}
      editing={editing}
      onPersonPress={onPersonPress}
      onEditHighCouncilor={onEditHighCouncilor}
    />,
  );
  return { onPersonPress, onEditHighCouncilor };
}

afterEach(() => jest.restoreAllMocks());

describe('StakeTree', () => {
  it('[leadership] CA-11: shows the top, the two columns, the clerks and the patriarch in reading order', async () => {
    await setup();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
    expect(labels).toEqual([
      'Presidente Souza, Presidente da Estaca',
      'Primeiro Lima, Primeiro Conselheiro',
      'Álvaro, Sumo Conselheiro',
      'Bruno, Sumo Conselheiro',
      'Carlos, Sumo Conselheiro',
      'Daniel, Sumo Conselheiro',
      'Éder, Sumo Conselheiro',
      'Fábio, Sumo Conselheiro',
      'Exec, Secretário Executivo',
      'Clerk, Secretário',
      'Patriarca Reis, Patriarca da Estaca',
    ]);
    expect(screen.getByText('Presidente')).toBeOnTheScreen();
    expect(screen.getByText('1º Conselheiro')).toBeOnTheScreen();
    expect(screen.getByText('2º Conselheiro')).toBeOnTheScreen();
  });

  it('[leadership] RNF-09: a position without a person is text announced with its label', async () => {
    await setup();
    expect(screen.getByLabelText('2º Conselheiro, sem nome no organograma')).toBeOnTheScreen();
  });

  it('[leadership] CA-12: unassigned high councilors have their own header, only when there are any', async () => {
    await setup();
    expect(screen.queryByText('SEM CONSELHEIRO DEFINIDO')).not.toBeOnTheScreen();
    const orphan = makeCalled('high_councilor', 'high_council', {
      displayName: 'Sem Vínculo',
      namePt: 'Sumo Conselheiro',
    });
    await setup([orphan]);
    expect(screen.getByRole('header', { name: 'SEM CONSELHEIRO DEFINIDO' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Sem Vínculo, Sumo Conselheiro')).toBeOnTheScreen();
  });

  it('[leadership] RNF-10: section overlines are headers', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'SECRETÁRIOS DA ESTACA' })).toBeOnTheScreen();
  });

  it('[leadership] RNF-10: the tree lines are hidden from screen readers', async () => {
    await setup();
    expect(
      screen.getByTestId('tree-connector', { includeHiddenElements: true }).props,
    ).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(
      screen.getAllByTestId('column-rail', { includeHiddenElements: true })[0].props,
    ).toMatchObject({
      accessibilityElementsHidden: true,
    });
  });

  it('[leadership] RNF-11: stacks the columns with a 1.6x font scale', async () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1.6 });
    await setup();
    const columns = StyleSheet.flatten(screen.getByTestId('tree-columns').props.style);
    expect(columns.flexDirection).toBeUndefined();
  });

  it('[leadership] RNF-11: keeps two columns with a normal font scale', async () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
    await setup();
    const columns = StyleSheet.flatten(screen.getByTestId('tree-columns').props.style);
    expect(columns.flexDirection).toBe('row');
  });

  it('[leadership] RF-24: editing shows an edit icon on each high councilor', async () => {
    const user = userEvent.setup();
    const { onEditHighCouncilor } = await setup([], true);
    expect(screen.getAllByLabelText(/^Editar acompanhamento de /)).toHaveLength(6);
    await user.press(screen.getByLabelText('Editar acompanhamento de Bruno'));
    expect(onEditHighCouncilor).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Bruno' }),
    );
  });

  it('[leadership] no edit icons outside editing mode', async () => {
    await setup();
    expect(screen.queryByLabelText(/^Editar acompanhamento de /)).not.toBeOnTheScreen();
  });

  it('[leadership] pressing a person reports it', async () => {
    const user = userEvent.setup();
    const { onPersonPress } = await setup();
    await user.press(screen.getByLabelText('Presidente Souza, Presidente da Estaca'));
    expect(onPersonPress).toHaveBeenCalledWith(president);
  });
});
