import type { Calling } from '@/domain/callings';

/** A small catalog for tests of the account screens. */
function make(overrides: Partial<Calling> & Pick<Calling, 'id' | 'namePt'>): Calling {
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

export const bishop = make({
  id: 'bishop',
  namePt: 'Bispo',
  nameEn: 'Bishop',
  nameEs: 'Obispo',
  level: 'ward',
  access: 'unit_leader',
  notifyGroup: 'bishoprics',
  orgChartSection: 'bishopric',
  sortOrder: 20,
});
export const branchPresident = make({
  id: 'branch_president',
  namePt: 'Presidente do Ramo',
  level: 'branch',
  access: 'unit_leader',
  notifyGroup: 'bishoprics',
  orgChartSection: 'bishopric',
  sortOrder: 30,
});
export const primaryPresident = make({
  id: 'primary_president',
  namePt: 'Presidente da Primária',
  nameEn: 'Primary President',
  access: 'unit_publisher',
  notifyGroup: 'primary_presidency',
  orgChartSection: 'unit_organizations',
  sortOrder: 50,
});
export const sundaySchoolTeacher = make({
  id: 'sunday_school_teacher',
  namePt: 'Professor da Escola Dominical',
  sortOrder: 60,
});
export const highCouncilor = make({
  id: 'high_councilor',
  namePt: 'Sumo Conselheiro',
  level: 'stake',
  access: 'stake_leader',
  notifyGroup: 'high_council',
  orgChartSection: 'high_council',
  sortOrder: 5,
});
export const stakeReliefSocietyPresident = make({
  id: 'stake_relief_society_president',
  namePt: 'Presidente da Sociedade de Socorro da Estaca',
  level: 'stake',
  access: 'stake_publisher',
  notifyGroup: 'relief_society_presidency',
  orgChartSection: 'stake_organizations',
  sortOrder: 6,
});
export const retired = make({
  id: 'retired',
  namePt: 'Chamado Antigo',
  level: 'stake',
  sortOrder: 7,
  active: false,
});

export const testCatalog: Calling[] = [
  bishop,
  branchPresident,
  primaryPresident,
  sundaySchoolTeacher,
  highCouncilor,
  stakeReliefSocietyPresident,
  retired,
];
