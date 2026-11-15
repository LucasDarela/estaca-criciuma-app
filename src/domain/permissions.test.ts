import {
  canLead,
  canPublish,
  isAdmin,
  isRole,
  isStakeLeader,
  leadableUnits,
  publishableUnits,
  viewerKind,
  type Membership,
} from './permissions';
import { unitIds, type UnitId } from './units';

const session = { userId: 'u1' };
const unitLeader = (unitId: UnitId): Membership => ({ unitId, role: 'unit_leader' });
const unitPublisher = (unitId: UnitId): Membership => ({ unitId, role: 'unit_publisher' });
const stakeLeader: Membership = { unitId: 'estaca', role: 'stake_leader' };
const stakePublisher: Membership = { unitId: 'estaca', role: 'stake_publisher' };
const admin: Membership = { unitId: 'estaca', role: 'admin' };

describe('CA-08: viewerKind', () => {
  it('is visitor without a session', () => {
    expect(viewerKind(null, [])).toBe('visitor');
  });

  it('is visitor without a session even with memberships', () => {
    expect(viewerKind(null, [stakeLeader])).toBe('visitor');
  });

  it('is member with a session and no roles', () => {
    expect(viewerKind(session, [])).toBe('member');
  });

  it('is member with only unit_publisher', () => {
    expect(viewerKind(session, [unitPublisher('icara')])).toBe('member');
  });

  it('is leader with unit_leader', () => {
    expect(viewerKind(session, [unitLeader('criciuma1')])).toBe('leader');
  });

  it('is leader with stake_leader', () => {
    expect(viewerKind(session, [stakeLeader])).toBe('leader');
  });

  it('[roles] CA-06: is member with stake_publisher alone', () => {
    expect(viewerKind(session, [stakePublisher])).toBe('member');
  });

  it('is member with admin alone', () => {
    expect(viewerKind(session, [admin])).toBe('member');
  });

  it('is leader with admin + unit_leader', () => {
    expect(viewerKind(session, [admin, unitLeader('icara')])).toBe('leader');
  });

  it('is leader with unit_leader + unit_publisher in different units', () => {
    expect(viewerKind(session, [unitLeader('criciuma1'), unitPublisher('icara')])).toBe('leader');
  });
});

describe('CA-08: canPublish / canLead', () => {
  it('no roles: nothing', () => {
    expect(canPublish([], 'estaca')).toBe(false);
    expect(canLead([], 'estaca')).toBe(false);
    expect(publishableUnits([])).toEqual([]);
    expect(leadableUnits([])).toEqual([]);
  });

  it('unit_publisher: publishes only own unit, never leads', () => {
    const m = [unitPublisher('icara')];
    expect(canPublish(m, 'icara')).toBe(true);
    expect(canPublish(m, 'criciuma1')).toBe(false);
    expect(canPublish(m, 'estaca')).toBe(false);
    expect(canLead(m, 'icara')).toBe(false);
    expect(publishableUnits(m)).toEqual(['icara']);
    expect(leadableUnits(m)).toEqual([]);
  });

  it('unit_leader: publishes and leads only own unit', () => {
    const m = [unitLeader('criciuma1')];
    expect(canPublish(m, 'criciuma1')).toBe(true);
    expect(canPublish(m, 'icara')).toBe(false);
    expect(canLead(m, 'criciuma1')).toBe(true);
    expect(canLead(m, 'icara')).toBe(false);
    expect(canLead(m, 'estaca')).toBe(false);
    expect(publishableUnits(m)).toEqual(['criciuma1']);
    expect(leadableUnits(m)).toEqual(['criciuma1']);
  });

  it('stake_leader: publishes and leads everywhere, in unitIds order', () => {
    const m = [stakeLeader];
    for (const id of unitIds) {
      expect(canPublish(m, id)).toBe(true);
      expect(canLead(m, id)).toBe(true);
    }
    expect(publishableUnits(m)).toEqual([...unitIds]);
    expect(leadableUnits(m)).toEqual([...unitIds]);
  });

  it('[roles] CA-06: stake_publisher publishes only to the stake and never leads', () => {
    const m = [stakePublisher];
    expect(canPublish(m, 'estaca')).toBe(true);
    expect(canPublish(m, 'icara')).toBe(false);
    expect(canLead(m, 'estaca')).toBe(false);
    expect(publishableUnits(m)).toEqual(['estaca']);
    expect(leadableUnits(m)).toEqual([]);
  });

  it('admin alone: publishes everywhere, leads nowhere (RN-04)', () => {
    const m = [admin];
    for (const id of unitIds) {
      expect(canPublish(m, id)).toBe(true);
      expect(canLead(m, id)).toBe(false);
    }
    expect(publishableUnits(m)).toEqual([...unitIds]);
    expect(leadableUnits(m)).toEqual([]);
  });

  it('sums roles per unit: unit_leader in criciuma1 + unit_publisher in icara', () => {
    const m = [unitLeader('criciuma1'), unitPublisher('icara')];
    expect(publishableUnits(m)).toEqual(['criciuma1', 'icara']);
    expect(leadableUnits(m)).toEqual(['criciuma1']);
    expect(canLead(m, 'icara')).toBe(false);
  });

  it('admin + unit_leader: publishes everywhere, leads only the leader unit', () => {
    const m = [admin, unitLeader('icara')];
    expect(publishableUnits(m)).toEqual([...unitIds]);
    expect(leadableUnits(m)).toEqual(['icara']);
  });
});

describe('role guards and flags', () => {
  it('isRole', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('stake_publisher')).toBe(true);
    expect(isRole('member')).toBe(false);
  });

  it('isAdmin and isStakeLeader', () => {
    expect(isAdmin([admin])).toBe(true);
    expect(isAdmin([stakeLeader])).toBe(false);
    expect(isStakeLeader([stakeLeader])).toBe(true);
    expect(isStakeLeader([admin])).toBe(false);
  });
});
