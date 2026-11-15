/** Returns EXPO_PUBLIC_PRIVACY_URL when it starts with https://; otherwise null (no link shown). */
export function privacyUrl(): string | null {
  // Direct property access: Expo only inlines `process.env.EXPO_PUBLIC_*` literally.
  const url = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim();
  return url && url.startsWith('https://') ? url : null;
}
