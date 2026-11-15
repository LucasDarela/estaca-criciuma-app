import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';

import type { MemberCall } from '@/domain/callings';
import {
  canLead,
  canPublish,
  isAdmin,
  isStakeLeader,
  leadableUnits,
  publishableUnits,
  viewerKind,
  type Membership,
  type ViewerKind,
  type ViewerSession,
} from '@/domain/permissions';
import type { Profile } from '@/domain/profile';
import type { UnitId } from '@/domain/units';

import { fetchViewerData, viewerQueryKey, type ViewerData } from './api';

export type Viewer = {
  kind: ViewerKind;
  userId: string | null;
  /** False while the signed-in person's profile and roles are still loading for the first time. */
  loaded: boolean;
  profile: Profile | null;
  memberships: readonly Membership[];
  /** The person's callings (RF-16), oldest grant first. */
  calls: readonly MemberCall[];
  canPublish: (unitId: UnitId) => boolean;
  canLead: (unitId: UnitId) => boolean;
  publishableUnits: UnitId[];
  leadableUnits: UnitId[];
  isAdmin: boolean;
  isStakeLeader: boolean;
};

const ViewerContext = createContext<Viewer | null>(null);

const emptyData: ViewerData = { profile: null, memberships: [], calls: [] };

export function ViewerProvider({
  session,
  children,
}: {
  session: ViewerSession | null;
  children: React.ReactNode;
}) {
  const userId = session?.userId ?? null;
  const query = useQuery({
    queryKey: viewerQueryKey(userId ?? ''),
    queryFn: () => fetchViewerData(userId as string),
    enabled: userId !== null,
    // 7.6: a revoked role reaches the app on the next load (return to the app or every 5 min).
    refetchInterval: 5 * 60_000,
  });
  // Without a session, or on a failure with no cache, `data` is empty and nothing is granted.
  const data = userId === null ? emptyData : (query.data ?? emptyData);

  const viewer = useMemo<Viewer>(() => {
    const { profile, memberships, calls } = data;
    return {
      kind: viewerKind(userId === null ? null : { userId }, memberships),
      userId,
      loaded: userId === null || query.isSuccess,
      profile,
      memberships,
      calls,
      canPublish: (unitId) => canPublish(memberships, unitId),
      canLead: (unitId) => canLead(memberships, unitId),
      publishableUnits: publishableUnits(memberships),
      leadableUnits: leadableUnits(memberships),
      isAdmin: isAdmin(memberships),
      isStakeLeader: isStakeLeader(memberships),
    };
  }, [userId, data, query.isSuccess]);

  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (!viewer) throw new Error('useViewer must be used inside ViewerProvider');
  return viewer;
}
