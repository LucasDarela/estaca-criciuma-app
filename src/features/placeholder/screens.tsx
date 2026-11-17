import { ComingSoonScreen } from './ComingSoonScreen';

// One named export per tab so each route file only re-exports.
export const AgendaPlaceholder = () => <ComingSoonScreen titleKey="tabs.agenda" />;
export const BoardPlaceholder = () => <ComingSoonScreen titleKey="tabs.board" />;
export const NotesPlaceholder = () => <ComingSoonScreen titleKey="tabs.notes" />;
export const CallingsPlaceholder = () => <ComingSoonScreen titleKey="tabs.callings" />;
export const ProfilePlaceholder = () => <ComingSoonScreen titleKey="tabs.profile" />;
export const SignInPlaceholder = () => <ComingSoonScreen titleKey="tabs.signIn" />;
