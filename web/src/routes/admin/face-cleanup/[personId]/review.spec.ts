import { describe, expect, it } from 'vitest';
import { createReviewModel } from './review.svelte';

describe('createReviewModel', () => {
  it('starts with all faces moving (none excluded)', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }, { assetFaceId: 'b' }]);
    expect(vm.movingCount).toBe(2);
    expect(vm.excludeFaceIds()).toEqual([]);
  });

  it('toggling a face excludes it and decrements movingCount; re-toggle restores', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }, { assetFaceId: 'b' }]);
    vm.toggle('a');
    expect(vm.isExcluded('a')).toBe(true);
    expect(vm.movingCount).toBe(1);
    expect(vm.excludeFaceIds()).toEqual(['a']);
    vm.toggle('a');
    expect(vm.movingCount).toBe(2);
  });

  it('tracks declined faces separately from excluded', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }, { assetFaceId: 'b' }]);
    vm.toggle('a'); // exclude a (transient)
    vm.markDeclined('b'); // decline b (persistent intent)
    expect(vm.isExcluded('a')).toBe(true);
    expect(vm.isDeclined('b')).toBe(true);
    expect(vm.isExcluded('b')).toBe(false);
    expect(vm.declinedFaceIds()).toEqual(['b']);
  });
});
