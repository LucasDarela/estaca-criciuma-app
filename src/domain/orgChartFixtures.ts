import type { OrgChartMember } from './orgChart';

let sequence = 0;

/** An org chart member with sensible defaults; override what the test cares about. */
export function makeMember(overrides: Partial<OrgChartMember> = {}): OrgChartMember {
  sequence += 1;
  const callingId = overrides.calling?.id ?? 'high_councilor';
  return {
    memberCallId: `call-${sequence}`,
    unitId: 'estaca',
    section: 'high_council',
    calling: { id: callingId, namePt: callingId, nameEn: null, nameEs: null },
    displayName: `Pessoa ${sequence}`,
    sortOrder: 100,
    ...overrides,
  };
}

/** A member whose calling has only the pt-BR name `namePt` (and optional en/es names). */
export function makeCalled(
  callingId: string,
  section: OrgChartMember['section'],
  overrides: Partial<OrgChartMember> & { namePt?: string; nameEn?: string | null } = {},
): OrgChartMember {
  const { namePt, nameEn, ...rest } = overrides;
  return makeMember({
    section,
    calling: { id: callingId, namePt: namePt ?? callingId, nameEn: nameEn ?? null, nameEs: null },
    ...rest,
  });
}
