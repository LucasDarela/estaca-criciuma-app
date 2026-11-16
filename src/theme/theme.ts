/**
 * Design tokens for the Estaca Criciúma app.
 *
 * Source: "Design System" project on claude.ai/design (section 09 · Tokens), extended with the
 * values the section 06 components use but the original theme.ts did not name.
 * Values marked "derived" were created for digital UI and must be validated against the
 * official color file from the Church's Visual Identity Office (VIO).
 *
 * Rule: screens and components consume `theme`, `units`, `space`, `radius`, `type`,
 * `elevation` and `size`. The raw palette (`colors`) is only referenced inside this file.
 */

// UnitId lives in the domain layer (it cannot import from here); re-exported for existing callers.
import type { UnitId } from '@/domain/units';

export type { UnitId };

/** Base palette. Scales from the Church's communication guide (10 light → 40 dark). */
export const colors = {
  blue5: '#E6F2F5', // derived
  blue10: '#7DE3F4',
  blue20: '#01B6D1',
  blue30: '#007DA5',
  blue35: '#005175', // brand color
  blue40: '#003057',

  green10: '#BED21E',
  green20: '#6DB344',
  green40: '#235C35',

  yellow10: '#FFB81C',
  yellow20: '#F68D2E',
  yellow40: '#674730',

  red10: '#FC4E6D',
  red20: '#BD0057',
  red40: '#6E0D33',

  gray5: '#F6F7F7',
  gray10: '#D0D3D3',
  gray20: '#A9ADAD',
  gray30: '#878A8C',
  gray40: '#53575B',
  gray50: '#212225',

  white: '#FFFFFF',
} as const;

/** Semantic tokens. This is what the UI uses. */
export const theme = {
  primary: colors.blue35,
  primaryPressed: colors.blue40,
  primarySubtle: colors.blue5,
  onPrimary: colors.white,
  onPrimaryMuted: '#D6EBF1', // derived · secondary text on brand blue (inverted signature)
  link: colors.blue30,
  info: colors.blue30,

  success: colors.green40,
  successSubtle: '#E7F0EA', // derived
  warning: colors.yellow20,
  warningText: colors.yellow40, // text on warning backgrounds (AA contrast)
  warningSubtle: '#FDEEDF', // derived
  danger: colors.red20,
  dangerSubtle: '#F8E3EC', // derived
  onDanger: colors.white,

  text: colors.gray50,
  textBody: '#3A3D40', // derived · long paragraphs
  textMuted: colors.gray40,
  textSubtle: '#6B6F73', // derived · timestamps, placeholders, inactive TabBar icon
  textDisabled: colors.gray30,
  heading: colors.blue40, // large serif headings

  bg: colors.gray5,
  surface: colors.white,
  surfaceMuted: '#F0F2F2', // derived · SearchField, icon buttons
  surfaceDisabled: '#ECEEEE', // derived · disabled button, Segmented track
  border: '#E3E5E5', // derived · cards, bars
  borderStrong: colors.gray10, // outline button, unselected chips
  divider: '#EEF0F0', // derived · list row separator
  iconMuted: colors.gray20, // chevrons

  focusRing: colors.blue5,
  toastBg: colors.gray50,
  toastAccent: colors.blue10,
  scrim: 'rgba(0,48,87,0.4)', // derived · bottom sheet / modal backdrop
} as const;

export type UnitColors = {
  /** Display name. A proper noun, so it is not translated. */
  label: string;
  /** Marker: dot, EventCard side bar. Never used as text color. */
  dot: string;
  /** UnitTag background. */
  tint: string;
  /** UnitTag text; always the 40 tone (or equivalent) for AA contrast. */
  text: string;
};

export const units: Record<UnitId, UnitColors> = {
  estaca: { label: 'Estaca', dot: colors.blue35, tint: '#E6F2F5', text: colors.blue35 },
  criciuma1: { label: 'Criciúma 1', dot: colors.blue30, tint: '#E3F3F8', text: '#00607F' },
  criciuma2: { label: 'Criciúma 2', dot: colors.green40, tint: '#E7F0EA', text: colors.green40 },
  criciuma3: { label: 'Criciúma 3', dot: colors.yellow20, tint: '#FDEEDF', text: colors.yellow40 },
  icara: { label: 'Içara', dot: colors.red20, tint: '#F8E3EC', text: '#9A0047' },
  ararangua: { label: 'Araranguá', dot: colors.green20, tint: '#EDF6E7', text: colors.green40 },
  ramoGaivota: { label: 'Ramo Gaivota', dot: colors.red40, tint: '#F3E4EA', text: colors.red40 },
};

export const unitOrder: readonly UnitId[] = [
  'estaca',
  'criciuma1',
  'criciuma2',
  'criciuma3',
  'icara',
  'ararangua',
  'ramoGaivota',
];

/** Spacing · base 4. `lg` is the horizontal screen margin; `xl` separates sections. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = {
  tag: 6,
  input: 12,
  button: 14,
  buttonCompact: 12, // derived
  segmentedThumb: 9, // derived
  toast: 14, // derived
  emptyState: 14, // derived
  card: 16,
  sheet: 24,
  pill: 999,
} as const;

/** Fixed component sizes and touch targets. */
export const size = {
  touchMinIos: 44,
  touchMinAndroid: 48,
  button: 52,
  buttonCompact: 44,
  input: 52,
  search: 44,
  chip: 36,
  segmented: 34,
  avatar: 44,
  avatarLarge: 64,
  iconButton: 44,
  icon: 24,
  tabBarIcon: 26,
  switchWidth: 51,
  switchHeight: 31,
  badge: 20,
  tabBar: 84, // derived · includes the safe area
  headerAvatar: 36, // derived · ScreenHeader avatar
  switchWidthCompact: 46, // derived
  switchHeightCompact: 28, // derived
  searchCompact: 40, // derived
  sheetHandleWidth: 36, // derived
  sheetHandleHeight: 5, // derived
  unitDot: 8, // derived
  eventCardBar: 4, // derived
  iconSearch: 20, // derived
  codeBoxWidth: 48, // derived · one OTP digit box
  codeBoxHeight: 56, // derived
  checkbox: 24, // derived · consent checkbox
  monthCell: 41, // derived · calendar month grid cell height
  dayCircle: 30, // derived · day number circle in the month and week strips
  periodArrow: 32, // derived · previous/next period buttons
  typeChip: 32, // derived · event type filter chips
  unitFilterMaxWidth: 142, // derived · unit filter button on the agenda
  dayHourHeight: 44, // derived · one hour of the day timeline
  nowLine: 2, // derived · current time line of the day view
} as const;

/** Border and ring widths. */
export const stroke = {
  hairline: 1, // derived
  strong: 1.5, // derived
  focusRing: 4, // derived
} as const;

/** Interaction feedback and animation timings. */
export const motion = {
  pressedOpacity: 0.7, // derived
  sheetSlideMs: 250, // derived
  reducedFadeMs: 150, // derived
  toastMs: 4000, // derived
  toastWithActionMs: 6000, // derived
} as const;

/**
 * Family names follow the @expo-google-fonts/noto-serif and /noto-sans packages.
 * Noto stands in for McKay Pro (serif) and Zoram (sans) until the official files are licensed.
 */
export const fontFamily = {
  serifRegular: 'NotoSerif_400Regular',
  serifItalic: 'NotoSerif_400Regular_Italic',
  serifSemiBold: 'NotoSerif_600SemiBold',
  sansRegular: 'NotoSans_400Regular',
  sansMedium: 'NotoSans_500Medium',
  sansSemiBold: 'NotoSans_600SemiBold',
  sansBold: 'NotoSans_700Bold',
  mono: 'NotoSansMono_400Regular',
} as const;

export const type = {
  display: { fontFamily: fontFamily.serifSemiBold, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: fontFamily.serifSemiBold, fontSize: 26, lineHeight: 32 },
  headline: { fontFamily: fontFamily.sansSemiBold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fontFamily.sansRegular, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fontFamily.sansSemiBold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fontFamily.sansMedium, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  /** Note body text and moments of reflection. */
  reading: { fontFamily: fontFamily.serifRegular, fontSize: 16, lineHeight: 26 },
  button: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, lineHeight: 22 },
  tabLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.1,
  },
  headerTitle: { fontFamily: fontFamily.serifSemiBold, fontSize: 28, lineHeight: 34 }, // derived
  fieldLabel: { fontFamily: fontFamily.sansSemiBold, fontSize: 13, lineHeight: 18 }, // derived
  fieldError: { fontFamily: fontFamily.sansRegular, fontSize: 12.5, lineHeight: 17 }, // derived
  buttonCompact: { fontFamily: fontFamily.sansSemiBold, fontSize: 15, lineHeight: 20 }, // derived
  tag: { fontFamily: fontFamily.sansBold, fontSize: 12, lineHeight: 16 }, // derived
  badge: { fontFamily: fontFamily.sansBold, fontSize: 11.5, lineHeight: 14 }, // derived
  listTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 15, lineHeight: 20 }, // derived
  cardTitle: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, lineHeight: 22 }, // derived
  avatarLarge: { fontFamily: fontFamily.serifSemiBold, fontSize: 24, lineHeight: 30 }, // derived
  signatureName: { fontFamily: fontFamily.serifSemiBold, fontSize: 26, lineHeight: 32 }, // derived
  signatureTagline: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.4,
  }, // derived
} as const;

/** System font scale cap for TabBar labels (`maxFontSizeMultiplier`). */
export const maxFontScale = { tabLabel: 1.6 } as const;

/**
 * Elevation. 0 = flat with a `theme.border` border (default).
 * Each level carries an iOS shadow and an approximate Android `elevation`.
 */
export const elevation = {
  0: { borderWidth: 1, borderColor: theme.border },
  1: {
    shadowColor: colors.blue40,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  2: {
    shadowColor: colors.blue40,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;

export const tokens = {
  colors,
  theme,
  units,
  unitOrder,
  space,
  radius,
  size,
  stroke,
  motion,
  fontFamily,
  type,
  elevation,
} as const;
