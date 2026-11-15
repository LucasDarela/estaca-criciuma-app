import { canManageAccess, grantableRoles, groupsFor } from './access';
import type { Membership } from './permissions';

const member: Membership[] = [];
const bishop: Membership[] = [
  { unitId: 'criciuma1', role: 'unit_leader', leadershipGroup: 'bishops' },
];
const stake: Membership[] = [
  { unitId: 'estaca', role: 'stake_leader', leadershipGroup: 'stake_presidency' },
];
const admin: Membership[] = [{ unitId: 'estaca', role: 'admin', leadershipGroup: null }];

describe('canManageAccess', () => {
  it('is true only for stake_leader and admin', () => {
    expect(canManageAccess(stake)).toBe(true);
    expect(canManageAccess(admin)).toBe(true);
    expect(canManageAccess(bishop)).toBe(false);
    expect(canManageAccess(member)).toBe(false);
  });
});

describe('grantableRoles', () => {
  it('CA-17: stake_leader cannot grant admin; admin can', () => {
    expect(grantableRoles(stake, 'estaca')).toEqual(['stake_leader']);
    expect(grantableRoles(admin, 'estaca')).toEqual(['stake_leader', 'admin']);
  });

  it('offers unit roles for units other than the stake', () => {
    expect(grantableRoles(stake, 'icara')).toEqual(['unit_leader', 'unit_publisher']);
    expect(grantableRoles(admin, 'icara')).toEqual(['unit_leader', 'unit_publisher']);
  });

  it('offers nothing to a bishop or a member', () => {
    expect(grantableRoles(bishop, 'criciuma1')).toEqual([]);
    expect(grantableRoles(member, 'estaca')).toEqual([]);
  });
});

describe('groupsFor', () => {
  it('stake: presidency or none', () => {
    expect(groupsFor('estaca')).toEqual(['stake_presidency', null]);
  });

  it('units: bishops, presidents or none', () => {
    expect(groupsFor('ramoGaivota')).toEqual(['bishops', 'presidents', null]);
  });
});
