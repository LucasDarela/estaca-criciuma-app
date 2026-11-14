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
