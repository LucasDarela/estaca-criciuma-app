import { unitOrder } from '@/theme/theme';

import { isUnitId, STAKE_UNIT_ID, unitIds, unitKind } from './units';

describe('units', () => {
  it('unitIds matches unitOrder from the theme', () => {
    expect(unitIds).toEqual(unitOrder);
  });

  it('STAKE_UNIT_ID is the first unit', () => {
    expect(STAKE_UNIT_ID).toBe(unitIds[0]);
  });

  it('isUnitId accepts known ids and rejects the rest', () => {
    expect(isUnitId('icara')).toBe(true);
    expect(isUnitId('ramoGaivota')).toBe(true);
    expect(isUnitId('unknown')).toBe(false);
    expect(isUnitId('')).toBe(false);
  });

  it('unitKind maps each unit to stake, ward or branch', () => {
    expect(unitKind('estaca')).toBe('stake');
    expect(unitKind('ramoGaivota')).toBe('branch');
    expect(unitIds.filter((id) => unitKind(id) === 'ward')).toHaveLength(5);
  });
});
