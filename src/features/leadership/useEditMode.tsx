import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { OfflineBanner } from '@/components/OfflineBanner';
import type { HeaderAction } from '@/components/ScreenHeader';

import type { OrgChartData } from './api';
import { EditBanner } from './EditBanner';

/**
 * RF-23: the Editar header action, the banners (offline first, then edit) and the edit state shared
 * by the stake and unit screens. Edit mode needs a connection: going offline leaves it.
 */
export function useEditMode({
  canEdit,
  online,
  status,
  onDone,
}: {
  canEdit: boolean;
  online: boolean;
  status: OrgChartData['status'];
  /** Runs after Concluir (reload the links). */
  onDone: () => void;
}): {
  editing: boolean;
  exit: () => void;
  actions: HeaderAction[] | undefined;
  banners: ReactNode;
} {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  // Adjusted during render (no effect), so no frame shows edit icons while offline.
  if (editing && (!online || !canEdit)) setEditing(false);
  const active = editing && online && canEdit;

  const actions: HeaderAction[] | undefined =
    canEdit && !active
      ? [
          {
            icon: 'edit',
            accessibilityLabel: online ? t('leadership.edit.button') : t('leadership.edit.offline'),
            disabled: !online,
            onPress: () => setEditing(true),
          },
        ]
      : undefined;

  const banners = (
    <>
      {!online && status === 'success' ? <OfflineBanner /> : null}
      {active ? (
        <EditBanner
          onDone={() => {
            setEditing(false);
            onDone();
          }}
        />
      ) : null}
    </>
  );

  return { editing: active, exit: () => setEditing(false), actions, banners };
}
