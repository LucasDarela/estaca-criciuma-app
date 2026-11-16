import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

/** RNF-02: the persisted cache is valid for 7 days. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** RNF-02: public data is fresh for 5 minutes. */
export const PUBLIC_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * RNF-01: only queries keyed `['public', ...]` reach the disk. Viewer, profile and access
 * queries use other prefixes, so personal data is never persisted.
 */
export function isPublicQueryKey(key: readonly unknown[]): boolean {
  return key[0] === 'public';
}

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'estaca.query-cache',
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  // Bump when the shape of a persisted public query changes: old caches are then dropped.
  buster: '1',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      isPublicQueryKey(query.queryKey) && query.state.status === 'success',
  },
};
