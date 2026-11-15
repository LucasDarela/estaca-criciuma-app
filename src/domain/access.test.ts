import { canManageAccess } from './access';
import type { Membership } from './permissions';

const member: Membership[] = [];
const bishop: Membership[] = [{ unitId: 'criciuma1', role: 'unit_leader' }];
const stake: Membership[] = [{ unitId: 'estaca', role: 'stake_leader' }];
const stakePublisher: Membership[] = [{ unitId: 'estaca', role: 'stake_publisher' }];
const admin: Membership[] = [{ unitId: 'estaca', role: 'admin' }];

describe('canManageAccess', () => {
  it('is true only for stake_leader and admin', () => {
    expect(canManageAccess(stake)).toBe(true);
    expect(canManageAccess(admin)).toBe(true);
    expect(canManageAccess(bishop)).toBe(false);
    expect(canManageAccess(stakePublisher)).toBe(false);
    expect(canManageAccess(member)).toBe(false);
  });
});
