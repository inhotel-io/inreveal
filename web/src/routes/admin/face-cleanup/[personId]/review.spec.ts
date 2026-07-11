import { describe, expect, it } from 'vitest';
import { createReviewModel, type FlaggedFace } from './review.svelte';

// Model B (full per-face resolution) review model. Every flagged face carries its OWN suspectedOwnerId (a
// mixed cluster can flag faces toward different owners), so "move to owner" is a per-face grouping, not one
// destination. Slice 1 only wires the `owner` bulk action into the UI, but the model supports the full
// 5-state set (`owner`/`other`/`stay`/`lock`/`detach`) up front so later slices don't need another rework.
describe('createReviewModel (Model B / full resolution)', () => {
  const makeFaces = (): FlaggedFace[] => [
    { assetFaceId: 'f1', suspectedOwnerId: 'owner-a' },
    { assetFaceId: 'f2', suspectedOwnerId: 'owner-a' },
    { assetFaceId: 'f3', suspectedOwnerId: 'owner-b' },
  ];

  const sortedGroups = (req: { moveToPerson?: { destinationPersonId: string; faceIds: string[] }[] }) =>
    [...(req.moveToPerson ?? [])].sort((a, b) => a.destinationPersonId.localeCompare(b.destinationPersonId));

  it('starts every face in the owner state with no selection', () => {
    const vm = createReviewModel(makeFaces());
    expect(vm.total).toBe(3);
    expect(vm.selectedCount).toBe(0);
    expect(vm.tally).toEqual({ owner: 3, other: 0, stay: 0, lock: 0, detach: 0 });
    expect(vm.faces.map((f) => f.state)).toEqual(['owner', 'owner', 'owner']);
  });

  // ---- W1: buildResolveRequest groups owner faces by EACH face's own suspectedOwnerId ----

  it("W1: groups default (owner-state) faces by each face's own suspectedOwnerId, not one destination", () => {
    const vm = createReviewModel(makeFaces());
    const req = vm.buildResolveRequest('person-1');

    expect(req.personId).toBe('person-1');
    expect(sortedGroups(req)).toEqual([
      { destinationPersonId: 'owner-a', faceIds: ['f1', 'f2'] },
      { destinationPersonId: 'owner-b', faceIds: ['f3'] },
    ]);
    expect(req.stay).toEqual([]);
    expect(req.lock).toEqual([]);
    expect(req.detach).toEqual([]);
    expect(req.entireCluster).toBeUndefined();
  });

  it('W1: an "other"-state face routes to its chosen destination, not its suspected owner', () => {
    const vm = createReviewModel(makeFaces());
    vm.toggleSelect('f3');
    vm.applyToSelection('other', { personId: 'chosen-1', name: 'Chosen Person' });

    const req = vm.buildResolveRequest('person-1');
    expect(sortedGroups(req)).toEqual([
      { destinationPersonId: 'chosen-1', faceIds: ['f3'] },
      { destinationPersonId: 'owner-a', faceIds: ['f1', 'f2'] },
    ]);
  });

  it('W1: owner and other faces sharing the same destination merge into one group', () => {
    const vm = createReviewModel(makeFaces());
    vm.toggleSelect('f3');
    vm.applyToSelection('other', { personId: 'owner-a', name: 'Owner A' });

    const req = vm.buildResolveRequest('person-1');
    expect(sortedGroups(req)).toEqual([{ destinationPersonId: 'owner-a', faceIds: ['f1', 'f2', 'f3'] }]);
  });

  it('W1: stay/lock/detach faces are emitted as id lists and excluded from moveToPerson', () => {
    const vm = createReviewModel(makeFaces());
    vm.toggleSelect('f1');
    vm.applyToSelection('stay');
    vm.toggleSelect('f2');
    vm.applyToSelection('lock');
    vm.toggleSelect('f3');
    vm.applyToSelection('detach');

    const req = vm.buildResolveRequest('person-1');
    expect(req.moveToPerson).toEqual([]);
    expect(req.stay).toEqual(['f1']);
    expect(req.lock).toEqual(['f2']);
    expect(req.detach).toEqual(['f3']);
  });

  // ---- W2: the outcome tally always sums to N across every sequence of bulk actions ----

  it('W2: tally always sums to N across a sequence of bulk actions', () => {
    const vm = createReviewModel(makeFaces());
    const sumTally = () => Object.values(vm.tally).reduce((a, b) => a + b, 0);
    expect(sumTally()).toBe(3);

    vm.toggleSelect('f1');
    vm.applyToSelection('stay');
    expect(sumTally()).toBe(3);
    expect(vm.tally).toEqual({ owner: 2, other: 0, stay: 1, lock: 0, detach: 0 });

    vm.toggleSelect('f2');
    vm.toggleSelect('f3');
    vm.applyToSelection('lock');
    expect(sumTally()).toBe(3);
    expect(vm.tally).toEqual({ owner: 0, other: 0, stay: 1, lock: 2, detach: 0 });

    vm.selectAll();
    vm.applyToSelection('detach');
    expect(sumTally()).toBe(3);
    expect(vm.tally).toEqual({ owner: 0, other: 0, stay: 0, lock: 0, detach: 3 });

    vm.toggleSelect('f1');
    vm.applyToSelection('owner');
    expect(sumTally()).toBe(3);
    expect(vm.tally).toEqual({ owner: 1, other: 0, stay: 0, lock: 0, detach: 2 });
  });

  it('W2: re-routing an already-routed face keeps the tally at N (no double counting)', () => {
    const vm = createReviewModel(makeFaces());
    vm.toggleSelect('f1');
    vm.applyToSelection('other', { personId: 'chosen-1', name: 'Chosen' });
    vm.toggleSelect('f1');
    vm.applyToSelection('stay');

    expect(Object.values(vm.tally).reduce((a, b) => a + b, 0)).toBe(3);
    expect(vm.tally).toEqual({ owner: 2, other: 0, stay: 1, lock: 0, detach: 0 });
    // the stale "other" destination must not leak back in once re-routed away from "other"
    expect(vm.faces.find((f) => f.assetFaceId === 'f1')?.destinationPersonId).toBeNull();
  });

  // ---- W3: bulk actions mutate per-face state correctly; Reset returns all tiles to owner ----

  it('W3: bulk actions mutate exactly the selected faces and clear the selection afterward', () => {
    const vm = createReviewModel(makeFaces());
    vm.toggleSelect('f1');
    vm.toggleSelect('f2');
    vm.applyToSelection('lock');

    expect(vm.faces.find((f) => f.assetFaceId === 'f1')?.state).toBe('lock');
    expect(vm.faces.find((f) => f.assetFaceId === 'f2')?.state).toBe('lock');
    expect(vm.faces.find((f) => f.assetFaceId === 'f3')?.state).toBe('owner');
    expect(vm.selectedCount).toBe(0); // bulk actions clear the selection (mirrors the mockup's apply(s))
  });

  it('W3: Reset returns every face to owner and clears any chosen destination', () => {
    const vm = createReviewModel(makeFaces());
    vm.toggleSelect('f1');
    vm.applyToSelection('other', { personId: 'chosen-1', name: 'Chosen' });
    vm.toggleSelect('f2');
    vm.applyToSelection('stay');
    expect(vm.tally.owner).toBe(1);

    vm.reset();

    expect(vm.tally).toEqual({ owner: 3, other: 0, stay: 0, lock: 0, detach: 0 });
    for (const face of vm.faces) {
      expect(face.state).toBe('owner');
      expect(face.destinationPersonId).toBeNull();
      expect(face.destinationName).toBeNull();
    }
    expect(vm.selectedCount).toBe(0);

    const req = vm.buildResolveRequest('person-1');
    expect(req.stay).toEqual([]);
    expect(
      (req.moveToPerson ?? [])
        .flatMap((g) => g.faceIds)
        .slice()
        .sort(),
    ).toEqual(['f1', 'f2', 'f3']);
  });

  // ---- selection ops backing P1 (click toggle, shift-range, select-all, clear) ----

  it('selection: click toggles, shift-click selects a range, selectAll/clearSelection work', () => {
    const vm = createReviewModel(makeFaces());

    vm.toggleSelect('f1');
    expect(vm.isSelected('f1')).toBe(true);
    expect(vm.selectedCount).toBe(1);
    vm.toggleSelect('f1'); // toggling again deselects
    expect(vm.isSelected('f1')).toBe(false);
    expect(vm.selectedCount).toBe(0);

    vm.toggleSelect('f1'); // anchor the range at f1
    vm.selectRange('f3'); // shift-click f3 → selects f1..f3 inclusive
    expect(vm.isSelected('f1')).toBe(true);
    expect(vm.isSelected('f2')).toBe(true);
    expect(vm.isSelected('f3')).toBe(true);
    expect(vm.selectedCount).toBe(3);

    vm.clearSelection();
    expect(vm.selectedCount).toBe(0);

    vm.selectAll();
    expect(vm.selectedCount).toBe(3);
  });
});
