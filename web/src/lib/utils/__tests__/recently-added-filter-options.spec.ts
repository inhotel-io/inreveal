import { describe, expect, it } from 'vitest';
import { shouldShowRecentlyAddedCount } from '$lib/utils/recently-added-filter-options';

describe('shouldShowRecentlyAddedCount', () => {
  it('hides the count while loading or for an empty account', () => {
    // No buckets loaded yet (assetCount is transiently 0) and no filters: showing
    // "0 items" would flash a wrong count. The EmptyPlaceholder communicates emptiness.
    expect(shouldShowRecentlyAddedCount(0, false)).toBe(false);
  });

  it('shows "0 items" when a filter matched nothing', () => {
    // Informative: tells the user their filter matched nothing, rather than
    // looking like an empty account.
    expect(shouldShowRecentlyAddedCount(0, true)).toBe(true);
  });

  it('shows the count for a populated view without filters', () => {
    expect(shouldShowRecentlyAddedCount(5, false)).toBe(true);
  });

  it('shows the count for a populated filtered view', () => {
    expect(shouldShowRecentlyAddedCount(5, true)).toBe(true);
  });

  it('shows the count at the singular boundary (plural wording is left to i18n)', () => {
    expect(shouldShowRecentlyAddedCount(1, false)).toBe(true);
  });
});
