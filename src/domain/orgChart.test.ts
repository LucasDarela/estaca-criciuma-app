import {
  bishopricCount,
  buildStakeTree,
  buildUnitTree,
  compareMembers,
  counselorCallings,
  counselorOf,
  organizationOf,
  orgCounselorOf,
  searchMembers,
  supervisedOrganizations,
  supervisedUnits,
  type OrgChartLink,
} from './orgChart';
import { makeCalled } from './orgChartFixtures';

const names = (people: { displayName: string }[]) => people.map((p) => p.displayName);

describe('organizationOf', () => {
  it('[leadership] RF-10: maps callings to organizations', () => {
    expect(organizationOf('elders_quorum_president', 'unit_organizations')).toBe('elders_quorum');
    expect(organizationOf('elders_quorum_secretary', 'unit_organizations')).toBe('elders_quorum');
    expect(organizationOf('relief_society_counselor_1', 'unit_organizations')).toBe(
      'relief_society',
    );
    expect(organizationOf('stake_relief_society_president', 'stake_organizations')).toBe(
      'relief_society',
    );
    expect(organizationOf('young_women_president', 'unit_organizations')).toBe('young_women');
    expect(organizationOf('stake_young_men_president', 'stake_organizations')).toBe('young_men');
    expect(organizationOf('primary_president', 'unit_organizations')).toBe('primary');
    expect(organizationOf('stake_sunday_school_president', 'stake_organizations')).toBe(
      'sunday_school',
    );
  });

  it('[leadership] RF-10: anything else in an organizations section is other', () => {
    expect(organizationOf('unit_mission_leader', 'unit_organizations')).toBe('other');
    expect(organizationOf('elders_quorum_other', 'unit_organizations')).toBe('other');
    expect(organizationOf('custom_calling', 'stake_organizations')).toBe('other');
  });

  it('[leadership] RF-10: other sections are not organizations', () => {
    expect(organizationOf('bishop', 'bishopric')).toBeNull();
    expect(organizationOf('unit_clerk', 'unit_clerks')).toBeNull();
  });
});

describe('compareMembers', () => {
  it('[leadership] RF-13: ties on sortOrder are ordered by name without accents', () => {
    const a = makeCalled('high_councilor', 'high_council', {
      displayName: 'Álvaro',
      sortOrder: 50,
    });
    const b = makeCalled('high_councilor', 'high_council', { displayName: 'Abel', sortOrder: 50 });
    const c = makeCalled('high_councilor', 'high_council', { displayName: 'Zé', sortOrder: 40 });
    expect(names([a, b, c].sort(compareMembers))).toEqual(['Zé', 'Abel', 'Álvaro']);
  });
});

describe('buildStakeTree', () => {
  // CA-11: president, 1st counselor, 6 high councilors (3 per counselor), 2 clerks, patriarch;
  // the 2nd counselor is not visible.
  const president = makeCalled('stake_president', 'stake_presidency', {
    displayName: 'Presidente',
    sortOrder: 10,
  });
  const first = makeCalled('stake_first_counselor', 'stake_presidency', {
    displayName: 'Primeiro',
    sortOrder: 20,
  });
  const patriarch = makeCalled('stake_patriarch', 'stake_presidency', {
    displayName: 'Patriarca',
    sortOrder: 40,
  });
  const hcs = ['Bruno', 'Carlos', 'Álvaro', 'Daniel', 'Éder', 'Fábio'].map((displayName) =>
    makeCalled('high_councilor', 'high_council', { displayName, sortOrder: 50 }),
  );
  const clerks = [
    makeCalled('stake_clerk', 'stake_clerks', { displayName: 'Clerk', sortOrder: 80 }),
    makeCalled('stake_executive_secretary', 'stake_clerks', { displayName: 'Exec', sortOrder: 60 }),
  ];
  const links: OrgChartLink[] = [
    ...hcs.slice(0, 3).map((m) => ({
      kind: 'high_council_counselor' as const,
      memberCallId: m.memberCallId,
      counselorCallingId: 'stake_first_counselor' as const,
    })),
    ...hcs.slice(3).map((m) => ({
      kind: 'high_council_counselor' as const,
      memberCallId: m.memberCallId,
      counselorCallingId: 'stake_second_counselor' as const,
    })),
  ];
  const members = [president, first, patriarch, ...hcs, ...clerks];

  it('[leadership] CA-11: builds the stake tree', () => {
    const tree = buildStakeTree(members, links);
    expect(names(tree.president.people)).toEqual(['Presidente']);
    expect(tree.columns[0].slot.label).toBe('firstCounselor');
    expect(names(tree.columns[0].slot.people)).toEqual(['Primeiro']);
    expect(names(tree.columns[0].highCouncilors)).toEqual(['Álvaro', 'Bruno', 'Carlos']);
    expect(tree.columns[1].slot.label).toBe('secondCounselor');
    expect(tree.columns[1].slot.people).toEqual([]);
    expect(names(tree.columns[1].highCouncilors)).toEqual(['Daniel', 'Éder', 'Fábio']);
    expect(names(tree.clerks)).toEqual(['Exec', 'Clerk']);
    expect(names(tree.otherPresidency)).toEqual(['Patriarca']);
    expect(tree.unassigned).toEqual([]);
  });

  it('[leadership] CA-12: a high councilor without link is unassigned', () => {
    const orphan = makeCalled('high_councilor', 'high_council', { displayName: 'Sem Vínculo' });
    const tree = buildStakeTree([...members, orphan], links);
    expect(names(tree.unassigned)).toEqual(['Sem Vínculo']);
    expect(buildStakeTree(members, links).unassigned).toEqual([]);
  });

  it('[leadership] the stake tree groups organizations, with young_men and without empty blocks', () => {
    const org = [
      makeCalled('stake_young_men_president', 'stake_organizations', { displayName: 'Rapaz' }),
      makeCalled('stake_relief_society_president', 'stake_organizations', {
        displayName: 'Socorro',
      }),
      makeCalled('stake_sunday_school_president', 'stake_organizations', {
        displayName: 'Dominical',
      }),
    ];
    const tree = buildStakeTree([...members, ...org], links);
    expect(tree.organizations.map((b) => b.organization)).toEqual([
      'relief_society',
      'young_men',
      'sunday_school',
    ]);
  });

  it('[leadership] a person with 2 callings appears in both places', () => {
    const twice = makeCalled('stake_clerk', 'stake_clerks', {
      memberCallId: 'x1',
      displayName: 'Dois',
    });
    const twice2 = makeCalled('high_councilor', 'high_council', {
      memberCallId: 'x2',
      displayName: 'Dois',
    });
    const tree = buildStakeTree([twice, twice2], []);
    expect(names(tree.clerks)).toEqual(['Dois']);
    expect(names(tree.unassigned)).toEqual(['Dois']);
  });

  it('[leadership] ignores members of other units', () => {
    const elsewhere = makeCalled('bishop', 'bishopric', { unitId: 'icara', displayName: 'Bispo' });
    expect(buildStakeTree([elsewhere], []).president.people).toEqual([]);
  });
});

describe('buildUnitTree', () => {
  const bishop = makeCalled('bishop', 'bishopric', {
    unitId: 'criciuma1',
    displayName: 'Bispo',
    sortOrder: 400,
  });
  const counselor1 = makeCalled('bishopric_first_counselor', 'bishopric', {
    unitId: 'criciuma1',
    displayName: 'Primeiro',
  });
  const counselor2 = makeCalled('bishopric_second_counselor', 'bishopric', {
    unitId: 'criciuma1',
    displayName: 'Segundo',
  });
  const primary = makeCalled('primary_president', 'unit_organizations', {
    unitId: 'criciuma1',
    displayName: 'Primária',
  });
  const youngWomen = makeCalled('young_women_president', 'unit_organizations', {
    unitId: 'criciuma1',
    displayName: 'Moça',
  });
  const sundaySchool = makeCalled('sunday_school_president', 'unit_organizations', {
    unitId: 'criciuma1',
    displayName: 'Dominical',
  });
  const mission = makeCalled('unit_mission_leader', 'unit_organizations', {
    unitId: 'criciuma1',
    displayName: 'Missão',
  });
  const executive = makeCalled('unit_executive_secretary', 'unit_clerks', {
    unitId: 'criciuma1',
    displayName: 'Exec',
  });
  const members = [
    bishop,
    counselor1,
    counselor2,
    primary,
    youngWomen,
    sundaySchool,
    mission,
    executive,
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

  it('[leadership] CA-13: builds Criciuma 1 with Moças before Primária', () => {
    const tree = buildUnitTree('criciuma1', members, links);
    expect(tree.kind).toBe('ward');
    expect(tree.top.label).toBe('bishop');
    expect(names(tree.top.people)).toEqual(['Bispo']);
    expect(tree.columns[0].blocks.map((b) => b.organization)).toEqual(['young_women', 'primary']);
    expect(tree.columns[1].blocks).toEqual([]);
    expect(tree.unassigned.map((b) => b.organization)).toEqual(['sunday_school']);
    expect(names(tree.others)).toEqual(['Missão']);
    expect(names(tree.clerks)).toEqual(['Exec']);
    expect(tree.isEmpty).toBe(false);
  });

  it('[leadership] CA-14: lists the high councilors that supervise the unit', () => {
    const hc = makeCalled('high_councilor', 'high_council', { displayName: 'Sumo' });
    const other = makeCalled('high_councilor', 'high_council', { displayName: 'Outro' });
    const tree = buildUnitTree(
      'icara',
      [hc, other],
      [
        { kind: 'high_council_unit', memberCallId: hc.memberCallId, targetUnitId: 'icara' },
        { kind: 'high_council_unit', memberCallId: other.memberCallId, targetUnitId: 'criciuma1' },
      ],
    );
    expect(names(tree.supervisedBy)).toEqual(['Sumo']);
  });

  it('[leadership] CA-15: an empty branch has the three labels and no people', () => {
    const tree = buildUnitTree('ramoGaivota', [bishop], []);
    expect(tree.kind).toBe('branch');
    expect(tree.isEmpty).toBe(true);
    expect(tree.top.label).toBe('branchPresident');
    expect(tree.top.callingId).toBe('branch_president');
    expect(tree.columns.map((c) => c.slot.label)).toEqual(['firstCounselor', 'secondCounselor']);
    expect(tree.columns.map((c) => c.slot.callingId)).toEqual([
      'branch_first_counselor',
      'branch_second_counselor',
    ]);
    expect([tree.top, ...tree.columns.map((c) => c.slot)].every((s) => s.people.length === 0)).toBe(
      true,
    );
  });

  it('[leadership] editing shows the 5 link blocks, even empty', () => {
    const tree = buildUnitTree('criciuma2', [], [], { editing: true });
    expect(tree.unassigned.map((b) => b.organization)).toEqual([
      'elders_quorum',
      'relief_society',
      'young_women',
      'primary',
      'sunday_school',
    ]);
    expect(buildUnitTree('criciuma2', [], []).unassigned).toEqual([]);
  });

  it('[leadership] young_men is a stake block only; in a unit it falls into others', () => {
    const odd = makeCalled('young_men_president', 'unit_organizations', {
      unitId: 'criciuma1',
      displayName: 'Odd',
    });
    const tree = buildUnitTree('criciuma1', [odd], []);
    expect(names(tree.others)).toEqual(['Odd']);
  });

  it('[leadership] other bishopric members go to others', () => {
    const extra = makeCalled('bishopric_executive_secretary', 'bishopric', {
      unitId: 'criciuma1',
      displayName: 'Extra',
    });
    expect(names(buildUnitTree('criciuma1', [bishop, extra], []).others)).toEqual(['Extra']);
  });
});

describe('helpers', () => {
  it('[leadership] RF-15: counts the visible bishopric', () => {
    const a = makeCalled('bishop', 'bishopric', { unitId: 'icara' });
    const b = makeCalled('bishopric_first_counselor', 'bishopric', { unitId: 'icara' });
    const c = makeCalled('unit_clerk', 'unit_clerks', { unitId: 'icara' });
    expect(bishopricCount([a, b, c], 'icara')).toBe(2);
    expect(bishopricCount([a, b, c], 'criciuma1')).toBe(0);
  });

  it('[leadership] CA-18: searches by name and calling, ignoring accents', () => {
    const clerk = makeCalled('unit_executive_secretary', 'unit_clerks', {
      displayName: 'Maria',
      namePt: 'Secretário Executivo',
      sortOrder: 20,
    });
    const clerk2 = makeCalled('stake_clerk', 'stake_clerks', {
      displayName: 'José',
      namePt: 'Secretário da Estaca',
      sortOrder: 10,
    });
    const other = makeCalled('bishop', 'bishopric', { displayName: 'Carlos', namePt: 'Bispo' });
    const all = [clerk, clerk2, other];
    expect(names(searchMembers(all, 'secretario', 'pt-BR'))).toEqual(['José', 'Maria']);
    expect(names(searchMembers(all, 'jose', 'pt-BR'))).toEqual(['José']);
    expect(searchMembers(all, 'zzz', 'pt-BR')).toEqual([]);
    expect(searchMembers(all, 's', 'pt-BR')).toEqual([]);
    expect(searchMembers(all, '  s ', 'pt-BR')).toEqual([]);
  });

  it('[leadership] CA-18: searches the calling name in the interface language', () => {
    const m = makeCalled('bishop', 'bishopric', {
      displayName: 'Carlos',
      namePt: 'Bispo',
      nameEn: 'Bishop',
    });
    expect(searchMembers([m], 'bishop', 'en-US')).toHaveLength(1);
    expect(searchMembers([m], 'bishop', 'pt-BR')).toHaveLength(0);
  });

  it('[leadership] RF-18: supervised units follow unitIds order', () => {
    const links: OrgChartLink[] = [
      { kind: 'high_council_unit', memberCallId: 'a', targetUnitId: 'ramoGaivota' },
      { kind: 'high_council_unit', memberCallId: 'a', targetUnitId: 'criciuma2' },
      { kind: 'high_council_unit', memberCallId: 'b', targetUnitId: 'icara' },
    ];
    expect(supervisedUnits('a', links)).toEqual(['criciuma2', 'ramoGaivota']);
    expect(supervisedUnits('z', links)).toEqual([]);
  });

  it('[leadership] RF-18: supervised organizations follow the RF-10 order', () => {
    const links: OrgChartLink[] = [
      {
        kind: 'unit_org_counselor',
        unitId: 'icara',
        organization: 'sunday_school',
        counselorCallingId: 'bishopric_first_counselor',
      },
      {
        kind: 'unit_org_counselor',
        unitId: 'icara',
        organization: 'relief_society',
        counselorCallingId: 'bishopric_first_counselor',
      },
      {
        kind: 'unit_org_counselor',
        unitId: 'icara',
        organization: 'primary',
        counselorCallingId: 'bishopric_second_counselor',
      },
    ];
    expect(supervisedOrganizations('icara', 'bishopric_first_counselor', links)).toEqual([
      'relief_society',
      'sunday_school',
    ]);
  });

  it('[leadership] RF-24, RF-25: current counselors', () => {
    const links: OrgChartLink[] = [
      {
        kind: 'high_council_counselor',
        memberCallId: 'a',
        counselorCallingId: 'stake_second_counselor',
      },
      {
        kind: 'unit_org_counselor',
        unitId: 'icara',
        organization: 'primary',
        counselorCallingId: 'bishopric_second_counselor',
      },
    ];
    expect(counselorOf('a', links)).toBe('stake_second_counselor');
    expect(counselorOf('b', links)).toBeNull();
    expect(orgCounselorOf('icara', 'primary', links)).toBe('bishopric_second_counselor');
    expect(orgCounselorOf('icara', 'young_women', links)).toBeNull();
  });

  it('[leadership] counselorCallings by unit kind', () => {
    expect(counselorCallings('stake')).toEqual(['stake_first_counselor', 'stake_second_counselor']);
    expect(counselorCallings('ward')).toEqual([
      'bishopric_first_counselor',
      'bishopric_second_counselor',
    ]);
    expect(counselorCallings('branch')).toEqual([
      'branch_first_counselor',
      'branch_second_counselor',
    ]);
  });
});
