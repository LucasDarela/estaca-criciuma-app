/** A stake unit id; same values as `units.id` in the database. Order = display order. */
export type UnitId =
  'estaca' | 'criciuma1' | 'criciuma2' | 'criciuma3' | 'icara' | 'ararangua' | 'ramoGaivota';

export const STAKE_UNIT_ID = 'estaca' satisfies UnitId;

export const unitIds: readonly UnitId[] = [
  'estaca',
  'criciuma1',
  'criciuma2',
  'criciuma3',
  'icara',
  'ararangua',
  'ramoGaivota',
];

export function isUnitId(value: string): value is UnitId {
  return (unitIds as readonly string[]).includes(value);
}

export type UnitKind = 'stake' | 'ward' | 'branch';

/** Same values as `units.kind` in the database. */
export function unitKind(id: UnitId): UnitKind {
  if (id === STAKE_UNIT_ID) return 'stake';
  return id === 'ramoGaivota' ? 'branch' : 'ward';
}
