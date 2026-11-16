import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';

import { buildUnitTree, type OrgChartLink, type OrgChartMember } from '@/domain/orgChart';
import type { UnitId } from '@/domain/units';
import { makeCalled } from '@/domain/orgChartFixtures';

import { UnitTree } from './UnitTree';

const unit = (
  callingId: string,
  section: OrgChartMember['section'],
  displayName: string,
  namePt: string,
) => makeCalled(callingId, section, { unitId: 'criciuma1', displayName, namePt });

const members: OrgChartMember[] = [
  unit('bishop', 'bishopric', 'Bispo Alves', 'Bispo'),
  unit('bishopric_first_counselor', 'bishopric', 'Primeiro Dias', 'Primeiro Conselheiro'),
  unit('primary_president', 'unit_organizations', 'Prima Rosa', 'Presidente da Primária'),
  unit('young_women_president', 'unit_organizations', 'Moça Lia', 'Presidente das Moças'),
  unit(
    'sunday_school_president',
    'unit_organizations',
    'Dom Nunes',
    'Presidente da Escola Dominical',
  ),
  unit('unit_mission_leader', 'unit_organizations', 'Missão Paz', 'Líder da Missão'),
  unit('unit_executive_secretary', 'unit_clerks', 'Exec Silva', 'Secretário Executivo'),
];
const links: OrgChartLink[] = [
  {
    kind: 'unit_org_counselor',
    unitId: 'criciuma1',
    organization: 'primary',
    counselorCallingId: 'bishopric_first_counselor',
  },
  {
    kind: 'unit_org_counselor',
    unitId: 'criciuma1',
    organization: 'young_women',
    counselorCallingId: 'bishopric_first_counselor',
  },
];

async function setup(
  unitId: UnitId,
  all: OrgChartMember[],
  allLinks: OrgChartLink[],
  editing = false,
) {
  const onPersonPress = jest.fn();
  const onEditOrganization = jest.fn();
  const tree = buildUnitTree(unitId, all, allLinks, { editing });
  await render(
    <UnitTree
      tree={tree}
      editing={editing}
      onPersonPress={onPersonPress}
      onEditOrganization={onEditOrganization}
    />,
  );
  return { onPersonPress, onEditOrganization };
}

describe('UnitTree', () => {
  it('[leadership] CA-13: Criciuma 1 shows Moças before Primária, unassigned Escola Dominical and Others', async () => {
    await setup('criciuma1', members, links);
    const headers = screen.getAllByRole('header').map((h) => h.props.children as string);
    expect(headers).toEqual([
      'Moças',
      'Primária',
      'SEM CONSELHEIRO DEFINIDO',
      'Escola Dominical',
      'SECRETÁRIOS',
      'OUTROS',
    ]);
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel as string);
    expect(labels).toEqual([
      'Bispo Alves, Bispo',
      'Primeiro Dias, Primeiro Conselheiro',
      'Moça Lia, Presidente das Moças',
      'Prima Rosa, Presidente da Primária',
      'Dom Nunes, Presidente da Escola Dominical',
      'Exec Silva, Secretário Executivo',
      'Missão Paz, Líder da Missão',
    ]);
  });

  it('[leadership] CA-14: Acompanhada por lists the high councilor with the role in the title', async () => {
    const user = userEvent.setup();
    const hc = makeCalled('high_councilor', 'high_council', {
      displayName: 'Sumo Reis',
      namePt: 'Sumo Conselheiro',
    });
    const { onPersonPress } = await setup(
      'icara',
      [hc],
      [{ kind: 'high_council_unit', memberCallId: hc.memberCallId, targetUnitId: 'icara' }],
    );
    expect(screen.getByRole('header', { name: 'ACOMPANHADA POR' })).toBeOnTheScreen();
    expect(screen.getByText('Sumo Reis (Sumo Conselheiro)')).toBeOnTheScreen();
    await user.press(screen.getByLabelText('Sumo Reis, Sumo Conselheiro'));
    expect(onPersonPress).toHaveBeenCalledWith(hc);
  });

  it('[leadership] CA-15: an empty branch shows the labels and the empty message', async () => {
    await setup('ramoGaivota', [], []);
    expect(screen.getByLabelText('Presidente do Ramo, sem nome no organograma')).toBeOnTheScreen();
    expect(screen.getByLabelText('1º Conselheiro, sem nome no organograma')).toBeOnTheScreen();
    expect(screen.getByLabelText('2º Conselheiro, sem nome no organograma')).toBeOnTheScreen();
    expect(
      screen.getByText('Ainda não há pessoas no organograma desta unidade.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  });

  it('[leadership] CA-28: editing shows the 5 blocks with Edit and the empty message', async () => {
    const user = userEvent.setup();
    const { onEditOrganization } = await setup('criciuma2', [], [], true);
    expect(screen.getAllByText('Editar')).toHaveLength(5);
    expect(screen.getAllByText('Nenhuma pessoa no organograma.')).toHaveLength(5);
    await user.press(screen.getByLabelText('Editar: Escola Dominical'));
    expect(onEditOrganization).toHaveBeenCalledWith('sunday_school');
  });

  it('[leadership] no Edit buttons outside editing mode', async () => {
    await setup('criciuma1', members, links);
    expect(screen.queryByText('Editar')).not.toBeOnTheScreen();
  });
});
