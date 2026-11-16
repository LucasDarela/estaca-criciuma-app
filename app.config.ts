import type { ExpoConfig } from 'expo/config';

// Brand color (theme.primary). Duplicated here because app config runs outside the app bundle.
const BRAND_BLUE = '#005175';

const config: ExpoConfig = {
  name: 'Estaca Criciúma',
  slug: 'estaca-criciuma',
  scheme: 'estacacriciuma',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: BRAND_BLUE,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-font',
    'expo-localization',
    'expo-secure-store',
    'expo-sharing',
    ['expo-calendar', { calendarPermission: 'Permite adicionar eventos da estaca à sua agenda.' }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: BRAND_BLUE,
      },
    ],
  ],
};

export default config;
