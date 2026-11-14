// Routes only compose screens; tests and logic live in src/features (expo-router bundles
// every file under src/app, so a test file here would ship in the app).
export { RootRedirect as default } from '@/features/navigation/RootRedirect';
