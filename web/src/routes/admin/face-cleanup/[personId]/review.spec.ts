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

  it('unmarkDeclined reverses a decline and restores the face to moving', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }, { assetFaceId: 'b' }]);
    vm.markDeclined('a');
    expect(vm.isDeclined('a')).toBe(true);
    expect(vm.movingCount).toBe(1); // a is declined → not moving
    vm.unmarkDeclined('a');
    expect(vm.isDeclined('a')).toBe(false);
    expect(vm.declinedFaceIds()).toEqual([]);
    expect(vm.movingCount).toBe(2); // restored
  });

  it('toggleManual adds/removes a manual pick and movingCount includes it', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }]); // 1 flagged moving
    expect(vm.movingCount).toBe(1);
    vm.toggleManual('m1');
    expect(vm.isManualSelected('m1')).toBe(true);
    expect(vm.movingCount).toBe(2); // 1 flagged + 1 manual
    vm.toggleManual('m1');
    expect(vm.isManualSelected('m1')).toBe(false);
    expect(vm.movingCount).toBe(1);
  });

  it('selectAllLoaded unions the loaded ids; clearManual empties them', () => {
    const vm = createReviewModel([]);
    vm.toggleManual('m1');
    vm.selectAllLoaded(['m1', 'm2', 'm3']);
    expect([...vm.manualFaceIds()].sort()).toEqual(['m1', 'm2', 'm3']);
    vm.clearManual();
    expect(vm.manualFaceIds()).toEqual([]);
  });

  it('entire-cluster mode makes movingCount the cluster total and supersedes individual picks (E15)', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }, { assetFaceId: 'b' }]); // 2 flagged
    vm.selectAllLoaded(['m1', 'm2']); // 2 manual picks
    vm.setClusterTotal(50);
    vm.setEntireCluster(true);
    expect(vm.entireCluster).toBe(true);
    expect(vm.movingCount).toBe(50); // cluster total, not 2 + 2
  });

  it('applyPayload (partial add): approvedPersonIds + excludeFaceIds + manualMove.faceIds', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }, { assetFaceId: 'b' }]);
    vm.toggle('a'); // exclude a
    vm.markDeclined('b'); // decline b
    vm.selectAllLoaded(['m1', 'm2']);
    const payload = vm.applyPayload({ personId: 'p1', destinationPersonId: 'owner' });
    expect(payload.approvedPersonIds).toEqual(['p1']);
    expect([...(payload.excludeFaceIds ?? [])].sort()).toEqual(['a', 'b']);
    expect(payload.manualMove).toEqual({ personId: 'p1', destinationPersonId: 'owner', faceIds: ['m1', 'm2'] });
  });

  it('applyPayload (entire cluster): empty approvedPersonIds + manualMove.entireCluster, picks ignored', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }]);
    vm.selectAllLoaded(['m1']); // ignored in entire-cluster mode
    vm.setEntireCluster(true);
    const payload = vm.applyPayload({ personId: 'p1', destinationPersonId: 'owner' });
    expect(payload.approvedPersonIds).toEqual([]);
    expect(payload.manualMove).toEqual({ personId: 'p1', destinationPersonId: 'owner', entireCluster: true });
  });

  it('applyPayload (legacy flagged-only): no manualMove when nothing manual is selected', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }]);
    vm.toggle('a');
    const payload = vm.applyPayload({ personId: 'p1', destinationPersonId: 'owner' });
    expect(payload.approvedPersonIds).toEqual(['p1']);
    expect(payload.manualMove).toBeUndefined();
  });

  it('applyPayload: emits no manualMove when destinationPersonId is null (E17 guard)', () => {
    const vm = createReviewModel([{ assetFaceId: 'a' }]);
    vm.selectAllLoaded(['m1']);
    const payload = vm.applyPayload({ personId: 'p1', destinationPersonId: null });
    expect(payload.manualMove).toBeUndefined();
  });
});
