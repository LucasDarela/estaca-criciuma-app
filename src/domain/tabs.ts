import type { ViewerKind } from './permissions';

export type TabRoute =
  'agenda' | 'board' | 'leadership' | 'notes' | 'callings' | 'profile' | 'sign-in';

/** Every tab route that exists as a file under `src/app/(tabs)`. */
export const allTabRoutes: readonly TabRoute[] = [
  'agenda',
  'board',
  'leadership',
  'notes',
  'callings',
  'profile',
  'sign-in',
];

/** Subset of the icon names in `components/icons` (domain cannot import components). */
export type TabIcon =
  | 'calendar_month'
  | 'campaign'
  | 'account_tree'
  | 'edit_note'
  | 'assignment_ind'
  | 'account_circle'
  | 'login';

/** `labelKey` is an i18n key; the navigation layer translates it (domain has no i18n). */
export type TabSpec = { route: TabRoute; icon: TabIcon; labelKey: `tabs.${string}` };

const agenda: TabSpec = { route: 'agenda', icon: 'calendar_month', labelKey: 'tabs.agenda' };
const board: TabSpec = { route: 'board', icon: 'campaign', labelKey: 'tabs.board' };
const leadership: TabSpec = {
  route: 'leadership',
  icon: 'account_tree',
  labelKey: 'tabs.leadership',
};
const notes: TabSpec = { route: 'notes', icon: 'edit_note', labelKey: 'tabs.notes' };
const callings: TabSpec = { route: 'callings', icon: 'assignment_ind', labelKey: 'tabs.callings' };
const profile: TabSpec = { route: 'profile', icon: 'account_circle', labelKey: 'tabs.profile' };
const signIn: TabSpec = { route: 'sign-in', icon: 'login', labelKey: 'tabs.signIn' };

const tabsByKind: Record<ViewerKind, readonly TabSpec[]> = {
  visitor: [agenda, board, leadership, signIn],
  member: [agenda, board, leadership, notes, profile],
  leader: [agenda, board, leadership, notes, callings],
};

/** Bottom tabs for a viewer kind, in display order. */
export function tabsFor(kind: ViewerKind): readonly TabSpec[] {
  return tabsByKind[kind];
}
