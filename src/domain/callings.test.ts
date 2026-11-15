import {
  accessesForLevel,
  callingFromRow,
  callingName,
  callingsForUnit,
  levelFitsUnit,
  matchesCalling,
  membershipsFromCalls,
  normalizeSearch,
  notifyGroups,
  sectionsForLevel,
  type Calling,
  type MemberCall,
} from './callings';
import { canLead, canPublish, viewerKind } from './permissions';
import { tabsFor } from './tabs';

function calling(overrides: Partial<Calling> & Pick<Calling, 'id' | 'namePt'>): Calling {
  return {
    nameEn: null,
    nameEs: null,
    level: 'ward_branch',
    access: 'none',
    notifyGroup: null,
    orgChartSection: null,
    sortOrder: 10,
    active: true,
    ...overrides,
  };
}

const bishop = calling({
  id: 'bishop',
  namePt: 'Bispo',
  nameEn: 'Bishop',
  nameEs: 'Obispo',
  level: 'ward',
  access: 'unit_leader',
  sortOrder: 20,
});
const branchPresident = calling({
  id: 'branch_president',
  namePt: 'Presidente do Ramo',
  level: 'branch',
  access: 'unit_leader',
  sortOrder: 30,
});
const clerk = calling({
  id: 'unit_clerk',
  namePt: 'Secretário',
  access: 'unit_leader',
  sortOrder: 40,
});
const primaryPresident = calling({
  id: 'primary_president',
  namePt: 'Presidente da Primária',
  nameEn: 'Primary President',
  access: 'unit_publisher',
  sortOrder: 50,
});
const sundayTeacher = calling({
  id: 'sunday_school_teacher',
  namePt: 'Professor da Escola Dominical',
  sortOrder: 60,
});
const highCouncilor = calling({
  id: 'high_councilor',
  namePt: 'Sumo Conselheiro',
  level: 'stake',
  access: 'stake_leader',
  sortOrder: 5,
});
const stakeRsPresident = calling({
  id: 'stake_relief_society_president',
  namePt: 'Presidente da Sociedade de Socorro da Estaca',
  level: 'stake',
  access: 'stake_publisher',
  sortOrder: 6,
});
const inactive = calling({ id: 'old', namePt: 'Antigo', level: 'stake', active: false });
const catalog = [
  bishop,
  branchPresident,
  clerk,
  primaryPresident,
  sundayTeacher,
  highCouncilor,
  stakeRsPresident,
  inactive,
];

const held = (c: Calling, unitId: MemberCall['unitId']): MemberCall => ({
  id: `mc-${c.id}`,
  unitId,
  calling: c,
  orgChartConsent: null,
});

const session = { userId: 'u1' };

describe('[roles] CA-05: mirror of can_publish / can_lead for a unit calling', () => {
  const memberships = membershipsFromCalls([held(primaryPresident, 'icara')]);

  it('can publish to own unit, cannot lead, cannot publish elsewhere', () => {
    expect(canPublish(memberships, 'icara')).toBe(true);
    expect(canLead(memberships, 'icara')).toBe(false);
    expect(canPublish(memberships, 'criciuma1')).toBe(false);
  });
});

describe('[roles] CA-06: mirror of can_publish / can_lead for a stake_publisher calling', () => {
  const memberships = membershipsFromCalls([held(stakeRsPresident, 'estaca')]);

  it('publishes only to the stake and never leads', () => {
    expect(canPublish(memberships, 'estaca')).toBe(true);
    expect(canPublish(memberships, 'icara')).toBe(false);
    expect(canLead(memberships, 'estaca')).toBe(false);
    expect(viewerKind(session, memberships)).toBe('member');
  });
});

describe('[roles] CA-07: a person with high_councilor and sunday_school_teacher', () => {
  it('is a leader and gets the Chamados tab', () => {
    const memberships = membershipsFromCalls([
      held(highCouncilor, 'estaca'),
      held(sundayTeacher, 'criciuma3'),
    ]);
    const kind = viewerKind(session, memberships);
    expect(kind).toBe('leader');
    expect(tabsFor(kind).map((tab) => tab.route)).toContain('callings');
  });
});

describe('membershipsFromCalls', () => {
  it('ignores callings without access and inactive ones', () => {
    const memberships = membershipsFromCalls([
      held(sundayTeacher, 'icara'),
      held({ ...bishop, active: false }, 'criciuma1'),
      held(clerk, 'icara'),
    ]);
    expect(memberships).toEqual([{ unitId: 'icara', role: 'unit_leader' }]);
  });
});

describe('[roles] CA-10: callingsForUnit', () => {
  it('Ramo Gaivota gets branch and ward_branch callings, never Bispo, by sortOrder', () => {
    const ids = callingsForUnit(catalog, 'ramoGaivota').map((c) => c.id);
    expect(ids).toEqual([
      'branch_president',
      'unit_clerk',
      'primary_president',
      'sunday_school_teacher',
    ]);
  });

  it('a ward gets Bispo and ward_branch callings, never Presidente do Ramo', () => {
    const ids = callingsForUnit(catalog, 'icara').map((c) => c.id);
    expect(ids).toContain('bishop');
    expect(ids).not.toContain('branch_president');
  });

  it('the stake gets only active stake callings', () => {
    expect(callingsForUnit(catalog, 'estaca').map((c) => c.id)).toEqual([
      'high_councilor',
      'stake_relief_society_president',
    ]);
  });
});

describe('levelFitsUnit', () => {
  it('matches the unit kind', () => {
    expect(levelFitsUnit('stake', 'estaca')).toBe(true);
    expect(levelFitsUnit('stake', 'icara')).toBe(false);
    expect(levelFitsUnit('ward', 'icara')).toBe(true);
    expect(levelFitsUnit('ward', 'ramoGaivota')).toBe(false);
    expect(levelFitsUnit('branch', 'ramoGaivota')).toBe(true);
    expect(levelFitsUnit('ward_branch', 'estaca')).toBe(false);
    expect(levelFitsUnit('ward_branch', 'ramoGaivota')).toBe(true);
  });
});

describe('[roles] CA-17: search', () => {
  it('normalizeSearch trims, lowercases and drops accents', () => {
    expect(normalizeSearch('  PRIMÁRIA ')).toBe('primaria');
  });

  it('primaria finds Presidente da Primária', () => {
    expect(matchesCalling(primaryPresident, 'primaria')).toBe(true);
    expect(matchesCalling(bishop, 'primaria')).toBe(false);
  });

  it('looks in the English and Spanish names too', () => {
    expect(matchesCalling(bishop, 'obispo')).toBe(true);
    expect(matchesCalling(primaryPresident, 'primary')).toBe(true);
  });

  it('a term shorter than 2 characters does not filter', () => {
    expect(matchesCalling(bishop, 'p')).toBe(true);
    expect(matchesCalling(bishop, '')).toBe(true);
  });
});

describe('[roles] CA-24: callingName', () => {
  it('uses the name of the locale', () => {
    expect(callingName(bishop, 'en-US')).toBe('Bishop');
    expect(callingName(bishop, 'es-MX')).toBe('Obispo');
    expect(callingName(bishop, 'pt-BR')).toBe('Bispo');
  });

  it('falls back to pt-BR when the translation is missing', () => {
    expect(callingName(clerk, 'en-US')).toBe('Secretário');
    expect(callingName(primaryPresident, 'es-MX')).toBe('Presidente da Primária');
  });
});

describe('level options', () => {
  it('accessesForLevel', () => {
    expect(accessesForLevel('stake')).toEqual(['none', 'stake_publisher', 'stake_leader']);
    expect(accessesForLevel('ward')).toEqual(['none', 'unit_publisher', 'unit_leader']);
    expect(accessesForLevel('ward_branch')).toEqual(['none', 'unit_publisher', 'unit_leader']);
  });

  it('sectionsForLevel', () => {
    expect(sectionsForLevel('stake')).toEqual([
      'stake_presidency',
      'high_council',
      'stake_clerks',
      'stake_organizations',
    ]);
    expect(sectionsForLevel('branch')).toEqual(['bishopric', 'unit_clerks', 'unit_organizations']);
  });

  it('notifyGroups has the 13 groups of RF-04', () => {
    expect(notifyGroups).toHaveLength(13);
    expect(notifyGroups[0]).toBe('stake_presidency');
  });
});

describe('callingFromRow', () => {
  const row = {
    id: 'bishop',
    name_pt: 'Bispo',
    name_en: 'Bishop',
    name_es: null,
    level: 'ward',
    access: 'unit_leader',
    notify_group: 'bishoprics',
    org_chart_section: 'bishopric',
    sort_order: 20,
    active: true,
  };

  it('maps the columns', () => {
    expect(callingFromRow(row)).toEqual({
      id: 'bishop',
      namePt: 'Bispo',
      nameEn: 'Bishop',
      nameEs: null,
      level: 'ward',
      access: 'unit_leader',
      notifyGroup: 'bishoprics',
      orgChartSection: 'bishopric',
      sortOrder: 20,
      active: true,
    });
  });

  it('drops rows with unknown values', () => {
    expect(callingFromRow({ ...row, level: 'galaxy' })).toBeNull();
    expect(callingFromRow({ ...row, access: 'root' })).toBeNull();
    expect(callingFromRow({ ...row, notify_group: 'x' })).toBeNull();
    expect(callingFromRow({ ...row, org_chart_section: 'x' })).toBeNull();
  });
});
