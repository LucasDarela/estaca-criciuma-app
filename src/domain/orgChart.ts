import { callingName, normalizeSearch, type Calling, type OrgChartSection } from './callings';
import type { Locale } from './profile';
import { STAKE_UNIT_ID, unitIds, unitKind, type UnitId } from './units';

/** One visible calling in the org chart (a person with 2 visible callings is 2 members). */
export type OrgChartMember = {
  memberCallId: string;
  unitId: UnitId;
  section: OrgChartSection;
  calling: Pick<Calling, 'id' | 'namePt' | 'nameEn' | 'nameEs'>;
  displayName: string;
  sortOrder: number;
};

export type StakeCounselorCallingId = 'stake_first_counselor' | 'stake_second_counselor';
export type UnitCounselorCallingId =
  | 'bishopric_first_counselor'
  | 'bishopric_second_counselor'
  | 'branch_first_counselor'
  | 'branch_second_counselor';
export type LinkOrganization =
  'elders_quorum' | 'relief_society' | 'young_women' | 'primary' | 'sunday_school';
export type OrgBlockId = LinkOrganization | 'young_men' | 'other';

export type OrgChartLink =
  | {
      kind: 'high_council_counselor';
      memberCallId: string;
      counselorCallingId: StakeCounselorCallingId;
    }
  | { kind: 'high_council_unit'; memberCallId: string; targetUnitId: UnitId }
  | {
      kind: 'unit_org_counselor';
      unitId: UnitId;
      organization: LinkOrganization;
      counselorCallingId: UnitCounselorCallingId;
    };

/** RF-04 order. */
export const linkOrganizations: readonly LinkOrganization[] = [
  'elders_quorum',
  'relief_society',
  'young_women',
  'primary',
  'sunday_school',
];
/** RF-10 block order in a ward or branch. */
export const unitBlockOrder: readonly OrgBlockId[] = [
  'elders_quorum',
  'relief_society',
  'young_women',
  'primary',
  'sunday_school',
  'other',
];
/** RF-10 block order in the stake. */
export const stakeBlockOrder: readonly OrgBlockId[] = [
  'relief_society',
  'young_women',
  'primary',
  'young_men',
  'sunday_school',
  'other',
];

/** i18n key suffix of the short label (`leadership.slot.*`). */
export type SlotLabel =
  'stakePresident' | 'bishop' | 'branchPresident' | 'firstCounselor' | 'secondCounselor';
export type Slot = { callingId: string; label: SlotLabel; people: OrgChartMember[] };
export type OrgBlock = { organization: OrgBlockId; people: OrgChartMember[] };

export type StakeColumn = { slot: Slot; highCouncilors: OrgChartMember[] };
export type StakeTree = {
  president: Slot;
  columns: [StakeColumn, StakeColumn];
  /** RF-11.3: high councilors with no counselor link. */
  unassigned: OrgChartMember[];
  clerks: OrgChartMember[];
  /** `stake_presidency` minus the 3 fixed slots (e.g. the patriarch). */
  otherPresidency: OrgChartMember[];
  /** `stake_organizations`, in `stakeBlockOrder`, non-empty only. */
  organizations: OrgBlock[];
};

export type UnitColumn = { slot: Slot; blocks: OrgBlock[] };
export type UnitTree = {
  kind: 'ward' | 'branch';
  /** RF-12.1 */
  supervisedBy: OrgChartMember[];
  top: Slot;
  columns: [UnitColumn, UnitColumn];
  /** RF-12.4 (with editing: every unlinked block, even empty). */
  unassigned: OrgBlock[];
  clerks: OrgChartMember[];
  /** Block `other` plus the bishopric minus the 3 fixed slots. */
  others: OrgChartMember[];
  /** RF-12.7: no visible person in the unit. */
  isEmpty: boolean;
};

const elderQuorumCallings = [
  'elders_quorum_president',
  'elders_quorum_counselor_1',
  'elders_quorum_counselor_2',
  'elders_quorum_secretary',
];

const prefixOrganizations: readonly [LinkOrganization | 'young_men', readonly string[]][] = [
  ['relief_society', ['relief_society_', 'stake_relief_society_']],
  ['young_women', ['young_women_', 'stake_young_women_']],
  ['young_men', ['stake_young_men_']],
  ['primary', ['primary_', 'stake_primary_']],
  ['sunday_school', ['sunday_school_', 'stake_sunday_school_']],
];

/** RF-10. `null` when the section is not an organizations section. */
export function organizationOf(callingId: string, section: OrgChartSection): OrgBlockId | null {
  if (section !== 'unit_organizations' && section !== 'stake_organizations') return null;
  const order = section === 'stake_organizations' ? stakeBlockOrder : unitBlockOrder;
  let found: OrgBlockId = 'other';
  if (elderQuorumCallings.includes(callingId)) {
    found = 'elders_quorum';
  } else {
    for (const [organization, prefixes] of prefixOrganizations) {
      if (prefixes.some((prefix) => callingId.startsWith(prefix))) {
        found = organization;
        break;
      }
    }
  }
  return order.includes(found) ? found : 'other';
}

/** RF-13: `sortOrder`, then `displayName` ignoring case and accents. */
export function compareMembers(a: OrgChartMember, b: OrgChartMember): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const nameA = normalizeSearch(a.displayName);
  const nameB = normalizeSearch(b.displayName);
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  return a.memberCallId < b.memberCallId ? -1 : a.memberCallId > b.memberCallId ? 1 : 0;
}

/** The two counselor calling ids of a unit kind, 1st then 2nd. */
export function counselorCallings(kind: 'stake' | 'ward' | 'branch'): [string, string] {
  if (kind === 'stake') return ['stake_first_counselor', 'stake_second_counselor'];
  if (kind === 'ward') return ['bishopric_first_counselor', 'bishopric_second_counselor'];
  return ['branch_first_counselor', 'branch_second_counselor'];
}

const topCalling = {
  stake: 'stake_president',
  ward: 'bishop',
  branch: 'branch_president',
} as const;
const topLabel = {
  stake: 'stakePresident',
  ward: 'bishop',
  branch: 'branchPresident',
} as const satisfies Record<string, SlotLabel>;

/** RF-24: current counselor of a high councilor (null = none). */
export function counselorOf(
  memberCallId: string,
  links: readonly OrgChartLink[],
): StakeCounselorCallingId | null {
  for (const link of links) {
    if (link.kind === 'high_council_counselor' && link.memberCallId === memberCallId) {
      return link.counselorCallingId;
    }
  }
  return null;
}

/** RF-25: current counselor of an organization in a unit. */
export function orgCounselorOf(
  unitId: UnitId,
  organization: LinkOrganization,
  links: readonly OrgChartLink[],
): UnitCounselorCallingId | null {
  for (const link of links) {
    if (
      link.kind === 'unit_org_counselor' &&
      link.unitId === unitId &&
      link.organization === organization
    ) {
      return link.counselorCallingId;
    }
  }
  return null;
}

/** RF-18: units a high councilor supervises, in `unitIds` order. */
export function supervisedUnits(memberCallId: string, links: readonly OrgChartLink[]): UnitId[] {
  const targets = new Set<string>();
  for (const link of links) {
    if (link.kind === 'high_council_unit' && link.memberCallId === memberCallId) {
      targets.add(link.targetUnitId);
    }
  }
  return unitIds.filter((id) => targets.has(id));
}

/** RF-18: organizations linked to a unit counselor calling, in `linkOrganizations` order. */
export function supervisedOrganizations(
  unitId: UnitId,
  callingId: string,
  links: readonly OrgChartLink[],
): LinkOrganization[] {
  return linkOrganizations.filter(
    (organization) => orgCounselorOf(unitId, organization, links) === callingId,
  );
}

function sorted(people: OrgChartMember[]): OrgChartMember[] {
  return [...people].sort(compareMembers);
}

function makeSlot(
  unitMembers: readonly OrgChartMember[],
  callingId: string,
  label: SlotLabel,
): Slot {
  return {
    callingId,
    label,
    people: sorted(unitMembers.filter((m) => m.calling.id === callingId)),
  };
}

function groupByOrganization(
  people: readonly OrgChartMember[],
  section: OrgChartSection,
): Map<OrgBlockId, OrgChartMember[]> {
  const groups = new Map<OrgBlockId, OrgChartMember[]>();
  for (const person of people) {
    const organization = organizationOf(person.calling.id, section);
    if (organization === null) continue;
    groups.set(organization, [...(groups.get(organization) ?? []), person]);
  }
  return groups;
}

/** RF-11. */
export function buildStakeTree(
  members: readonly OrgChartMember[],
  links: readonly OrgChartLink[],
): StakeTree {
  const stake = members.filter((m) => m.unitId === STAKE_UNIT_ID);
  const [firstId, secondId] = counselorCallings('stake');
  const fixed = [topCalling.stake, firstId, secondId];
  const highCouncil = stake.filter((m) => m.section === 'high_council');
  const column = (callingId: string, label: SlotLabel): StakeColumn => ({
    slot: makeSlot(stake, callingId, label),
    highCouncilors: sorted(
      highCouncil.filter((m) => counselorOf(m.memberCallId, links) === callingId),
    ),
  });
  const groups = groupByOrganization(
    stake.filter((m) => m.section === 'stake_organizations'),
    'stake_organizations',
  );
  return {
    president: makeSlot(stake, topCalling.stake, topLabel.stake),
    columns: [column(firstId, 'firstCounselor'), column(secondId, 'secondCounselor')],
    unassigned: sorted(highCouncil.filter((m) => counselorOf(m.memberCallId, links) === null)),
    clerks: sorted(stake.filter((m) => m.section === 'stake_clerks')),
    otherPresidency: sorted(
      stake.filter((m) => m.section === 'stake_presidency' && !fixed.includes(m.calling.id)),
    ),
    organizations: stakeBlockOrder
      .filter((organization) => (groups.get(organization) ?? []).length > 0)
      .map((organization) => ({ organization, people: sorted(groups.get(organization) ?? []) })),
  };
}

/** RF-12. `unitId` must be a ward or a branch. With `editing`, the 5 link blocks always exist (RF-25). */
export function buildUnitTree(
  unitId: UnitId,
  members: readonly OrgChartMember[],
  links: readonly OrgChartLink[],
  options: { editing?: boolean } = {},
): UnitTree {
  const kind = unitKind(unitId) === 'branch' ? 'branch' : 'ward';
  const editing = options.editing === true;
  const unitMembers = members.filter((m) => m.unitId === unitId);
  const [firstId, secondId] = counselorCallings(kind);
  const fixed = [topCalling[kind], firstId, secondId];
  const groups = groupByOrganization(
    unitMembers.filter((m) => m.section === 'unit_organizations'),
    'unit_organizations',
  );
  const blockOf = (organization: LinkOrganization): OrgBlock => ({
    organization,
    people: sorted(groups.get(organization) ?? []),
  });
  const visibleBlocks = (organizations: readonly LinkOrganization[]): OrgBlock[] =>
    organizations.map(blockOf).filter((block) => editing || block.people.length > 0);
  const column = (callingId: string, label: SlotLabel): UnitColumn => ({
    slot: makeSlot(unitMembers, callingId, label),
    blocks: visibleBlocks(
      linkOrganizations.filter(
        (organization) => orgCounselorOf(unitId, organization, links) === callingId,
      ),
    ),
  });
  const supervisors = members.filter(
    (m) =>
      m.unitId === STAKE_UNIT_ID &&
      m.section === 'high_council' &&
      supervisedUnits(m.memberCallId, links).includes(unitId),
  );
  return {
    kind,
    supervisedBy: sorted(supervisors),
    top: makeSlot(unitMembers, topCalling[kind], topLabel[kind]),
    columns: [column(firstId, 'firstCounselor'), column(secondId, 'secondCounselor')],
    unassigned: visibleBlocks(
      linkOrganizations.filter(
        (organization) => orgCounselorOf(unitId, organization, links) === null,
      ),
    ),
    clerks: sorted(unitMembers.filter((m) => m.section === 'unit_clerks')),
    others: sorted([
      ...(groups.get('other') ?? []),
      ...unitMembers.filter((m) => m.section === 'bishopric' && !fixed.includes(m.calling.id)),
    ]),
    isEmpty: unitMembers.length === 0,
  };
}

/** RF-15: visible people with section `bishopric` in the unit. */
export function bishopricCount(members: readonly OrgChartMember[], unitId: UnitId): number {
  return members.filter((m) => m.unitId === unitId && m.section === 'bishopric').length;
}

/** RF-17: [] when the trimmed term has fewer than 2 characters; matches name or calling name. */
export function searchMembers(
  members: readonly OrgChartMember[],
  term: string,
  locale: Locale,
): OrgChartMember[] {
  const needle = normalizeSearch(term);
  if (needle.length < 2) return [];
  return sorted(
    members.filter(
      (m) =>
        normalizeSearch(m.displayName).includes(needle) ||
        normalizeSearch(callingName(m.calling, locale)).includes(needle),
    ),
  );
}
