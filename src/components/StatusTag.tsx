import { theme } from '@/theme/theme';

import { Tag } from './Tag';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning';

const tones = {
  neutral: { bg: theme.surfaceMuted, fg: theme.textMuted },
  info: { bg: theme.primarySubtle, fg: theme.primary },
  success: { bg: theme.successSubtle, fg: theme.success },
  warning: { bg: theme.warningSubtle, fg: theme.warningText },
} as const;

export function StatusTag({ tone, label }: { tone: StatusTone; label: string }) {
  return <Tag label={label} bg={tones[tone].bg} fg={tones[tone].fg} />;
}
