import { describe, expect, it } from 'vitest';
import { createFaceCleanupModel } from './face-cleanup.svelte';

type PersonOverride = {
  personId?: string;
  ownerId?: string;
  personName?: string | null;
  faceCount?: number;
  thumbnailFaceId?: string | null;
  eligible?: number;
  flagged?: number;
  flaggedFraction?: number;
  suspectedOwners?: {
    ownerPersonId: string;
    ownerName: string | null;
    thumbnailFaceId: string | null;
    count: number;
  }[];
  recommendation?: 'confident' | 'review-first';
  reviewReasons?: string[];
};

const person = (over: PersonOverride = {}) => ({
  personId: 'p',
  ownerId: 'o',
  personName: null,
  faceCount: 10,
  thumbnailFaceId: null,
  eligible: 10,
  flagged: 8,
  flaggedFraction: 0.8,
  suspectedOwners: [],
  recommendation: 'confident' as const,
  reviewReasons: [],
  ...over,
});

describe('createFaceCleanupModel', () => {
  it('groups review-first before confident and pre-selects confident only', () => {
    const vm = createFaceCleanupModel([
      person({ personId: 'c1', recommendation: 'confident' }),
      person({ personId: 'r1', recommendation: 'review-first', reviewReasons: ['named'], personName: 'Jula' }),
    ]);
    expect(vm.reviewFirst.map((p) => p.personId)).toEqual(['r1']);
    expect(vm.confident.map((p) => p.personId)).toEqual(['c1']);
    expect(vm.selected.has('c1')).toBe(true);
    expect(vm.selected.has('r1')).toBe(false);
  });

  it('review-first not selectable until opened; opening enables it', () => {
    const vm = createFaceCleanupModel([person({ personId: 'r1', recommendation: 'review-first' })]);
    expect(vm.canSelect('r1')).toBe(false);
    vm.open('r1');
    expect(vm.canSelect('r1')).toBe(true);
    vm.toggle('r1');
    expect(vm.selected.has('r1')).toBe(true);
  });

  it('toggle + clear update selectedCount', () => {
    const vm = createFaceCleanupModel([person({ personId: 'c1' }), person({ personId: 'c2' })]);
    expect(vm.selectedCount).toBe(2);
    vm.toggle('c1');
    expect(vm.selectedCount).toBe(1);
    vm.clear();
    expect(vm.selectedCount).toBe(0);
  });
});
