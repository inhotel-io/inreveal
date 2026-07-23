import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUGGESTION_SNOOZE_MS, isSuggestionSnoozed, snoozeSuggestions } from '$lib/utils/face-suggestion-snooze';

// Snooze entries are scoped per signed-in user (mirrors cmdk-recent.spec.ts's hoisted-mock pattern) so a
// shared/demo browser with multiple accounts never lets user A's snooze hide user B's suggestions.
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { current: { id: 'user-a' } as { id: string } | null },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: {
    get authenticated() {
      return mockAuth.current !== null;
    },
    get user() {
      return mockAuth.current;
    },
  },
}));

describe('face-suggestion-snooze', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuth.current = { id: 'user-a' };
  });
  afterEach(() => vi.useRealTimers());

  it('is not snoozed when nothing is stored', () => {
    expect(isSuggestionSnoozed('p1', 3)).toBe(false);
  });

  it('snoozes a person at a given count and hides until the count grows', () => {
    snoozeSuggestions('p1', 3);
    expect(isSuggestionSnoozed('p1', 3)).toBe(true);
    expect(isSuggestionSnoozed('p1', 3)).toBe(true);
    // more suggestions than at snooze time → resurface
    expect(isSuggestionSnoozed('p1', 4)).toBe(false);
  });

  it('a fewer/equal count stays snoozed; other people are unaffected', () => {
    snoozeSuggestions('p1', 5);
    expect(isSuggestionSnoozed('p1', 2)).toBe(true);
    expect(isSuggestionSnoozed('p2', 1)).toBe(false);
  });

  it('expires after SUGGESTION_SNOOZE_MS', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T00:00:00Z'));
    snoozeSuggestions('p1', 3);
    expect(isSuggestionSnoozed('p1', 3)).toBe(true);

    vi.setSystemTime(new Date(Date.now() + SUGGESTION_SNOOZE_MS + 1000));
    expect(isSuggestionSnoozed('p1', 3)).toBe(false);
  });

  it('survives corrupt JSON without throwing', () => {
    localStorage.setItem('gallery-face-suggestion-snooze', '{not json');
    expect(isSuggestionSnoozed('p1', 1)).toBe(false);
    expect(() => snoozeSuggestions('p1', 1)).not.toThrow();
  });

  it('scopes snooze per user — user B is not snoozed by user A on the same browser', () => {
    mockAuth.current = { id: 'user-a' };
    snoozeSuggestions('p1', 5);
    expect(isSuggestionSnoozed('p1', 5)).toBe(true);

    mockAuth.current = { id: 'user-b' };
    expect(isSuggestionSnoozed('p1', 5)).toBe(false);

    // and user A's snooze is untouched by user B's session
    mockAuth.current = { id: 'user-a' };
    expect(isSuggestionSnoozed('p1', 5)).toBe(true);
  });

  it('is never snoozed (and never persists) while signed out', () => {
    mockAuth.current = null;
    expect(isSuggestionSnoozed('p1', 5)).toBe(false);
    expect(() => snoozeSuggestions('p1', 5)).not.toThrow();
    expect(localStorage.getItem('gallery-face-suggestion-snooze')).toBeNull();
  });

  it('resurfaces after reject-elsewhere churn: baseline rebases down, a genuinely-new suggestion re-shows', () => {
    // Snoozed at 10 pending suggestions.
    snoozeSuggestions('p1', 10);
    expect(isSuggestionSnoozed('p1', 10)).toBe(true);

    // A later banner fetch sees 6 (4 rejected elsewhere, e.g. from the admin console) — still <= 10, so it
    // stays snoozed, but the baseline rebases DOWN to 6.
    expect(isSuggestionSnoozed('p1', 6)).toBe(true);

    // A further fetch sees 8 — 8 is still LESS than the ORIGINAL snooze count (10), but it is MORE than the
    // rebased baseline (6), so a genuinely new suggestion must resurface the banner.
    expect(isSuggestionSnoozed('p1', 8)).toBe(false);
  });
});
