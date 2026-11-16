import type { Query } from '@tanstack/react-query';

import {
  isPublicQueryKey,
  persistOptions,
  PERSIST_MAX_AGE_MS,
  PUBLIC_STALE_TIME_MS,
} from './queryPersistence';

function fakeQuery(queryKey: readonly unknown[], status: 'success' | 'error' | 'pending'): Query {
  return { queryKey, state: { status } } as unknown as Query;
}

describe('queryPersistence', () => {
  it('CA-19: persists only queries whose key starts with "public"', () => {
    const shouldDehydrate = persistOptions.dehydrateOptions!.shouldDehydrateQuery!;
    expect(shouldDehydrate(fakeQuery(['public', 'events', 'month', '2026-11'], 'success'))).toBe(
      true,
    );
    expect(shouldDehydrate(fakeQuery(['viewer', 'user-id'], 'success'))).toBe(false);
    expect(shouldDehydrate(fakeQuery(['access'], 'success'))).toBe(false);
    expect(shouldDehydrate(fakeQuery(['profile'], 'success'))).toBe(false);
  });

  it('CA-19: does not persist public queries that have not succeeded', () => {
    const shouldDehydrate = persistOptions.dehydrateOptions!.shouldDehydrateQuery!;
    expect(shouldDehydrate(fakeQuery(['public', 'event', 'x'], 'error'))).toBe(false);
    expect(shouldDehydrate(fakeQuery(['public', 'event', 'x'], 'pending'))).toBe(false);
  });

  it('isPublicQueryKey checks the first element only', () => {
    expect(isPublicQueryKey(['public'])).toBe(true);
    expect(isPublicQueryKey([])).toBe(false);
    expect(isPublicQueryKey(['x', 'public'])).toBe(false);
  });

  it('CA-19: keeps the cache for 7 days and treats data as fresh for 5 minutes', () => {
    expect(persistOptions.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    expect(PERSIST_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(PUBLIC_STALE_TIME_MS).toBe(5 * 60 * 1000);
  });

  it('has a buster so a format change invalidates old caches', () => {
    expect(persistOptions.buster).toBe('1');
  });
});
