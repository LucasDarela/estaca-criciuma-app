import type { UnitId } from '@/domain/units';
import { units } from '@/theme/theme';

import { Tag } from './Tag';

export function UnitTag({ unitId }: { unitId: UnitId }) {
  const unit = units[unitId];
  return <Tag label={unit.label} bg={unit.tint} fg={unit.text} />;
}
