import type { FaceRepairResolveRequestDto } from '@immich/sdk';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

// Model B (full per-face resolution, docs/plans/2026-07-10-face-cleanup-full-resolution-design.md). Every
// flagged face resolves to exactly one of five terminal states. Slice 1 only wires the `owner` action into
// the UI (+page.svelte), but the model supports all five up front so later slices (stay/lock/other/detach)
// don't need another rework of this file.
export type FaceState = 'owner' | 'other' | 'stay' | 'lock' | 'detach';

export interface FlaggedFace {
  assetFaceId: string;
  // Per-face suspected owner from the persisted scan snapshot — a mixed cluster can flag faces toward
  // different owners, so "move to owner" groups by each face's OWN suspectedOwnerId, not one destination.
  suspectedOwnerId: string;
}

export interface FaceEntry extends FlaggedFace {
  readonly state: FaceState;
  // Only meaningful when state === 'other' (a picked destination); null otherwise.
  readonly destinationPersonId: string | null;
  readonly destinationName: string | null;
}

export type FaceTally = Record<FaceState, number>;

export interface ReviewModel {
  // Ordered snapshot of every flagged face with its current state, for rendering the grid.
  readonly faces: FaceEntry[];
  readonly total: number;
  // Always sums to `total` — the client-side completeness guarantee (W2 / spec E17).
  readonly tally: FaceTally;
  readonly selectedCount: number;

  isSelected(assetFaceId: string): boolean;
  /** Click: toggles one tile in/out of the selection and anchors the next shift-click range. */
  toggleSelect(assetFaceId: string): void;
  /** Shift-click: selects every tile between the last toggled tile and this one, inclusive. */
  selectRange(assetFaceId: string): void;
  selectAll(): void;
  clearSelection(): void;
  /** Returns every face to `owner` (clearing any chosen destination) and clears the selection. */
  reset(): void;
  /** Applies `state` (+ optional destination for `other`) to every currently-selected face, then clears the
   *  selection — mirrors the mockup's `apply(s)` bulk-bar action. */
  applyToSelection(state: FaceState, destination?: { personId: string; name?: string | null }): void;
  /** Pure builder: groups `owner`/`other` faces by destination (owner destination = each face's own
   *  suspectedOwnerId) and emits `stay`/`lock`/`detach` id lists. Never touches the network. */
  buildResolveRequest(personId: string): FaceRepairResolveRequestDto;
}

export function createReviewModel(flaggedFaces: FlaggedFace[]): ReviewModel {
  const order = flaggedFaces.map((f) => f.assetFaceId);
  // Plain Map (not SvelteMap): a static id→index lookup built once from `flaggedFaces`, which never changes
  // for the lifetime of this model instance — nothing reads it reactively.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const indexById = new Map(order.map((id, i) => [id, i]));

  const states: SvelteMap<string, FaceState> = new SvelteMap(order.map((id) => [id, 'owner' as FaceState]));
  const destinations: SvelteMap<string, { personId: string; name: string | null }> = new SvelteMap();
  const selected: SvelteSet<string> = new SvelteSet();
  let lastToggledIndex: number | null = null;

  const clearSelectionState = () => {
    selected.clear();
    lastToggledIndex = null;
  };

  return {
    get faces(): FaceEntry[] {
      return flaggedFaces.map((face) => {
        const destination = destinations.get(face.assetFaceId);
        return {
          ...face,
          state: states.get(face.assetFaceId) ?? 'owner',
          destinationPersonId: destination?.personId ?? null,
          destinationName: destination?.name ?? null,
        };
      });
    },

    get total(): number {
      return order.length;
    },

    get tally(): FaceTally {
      const tally: FaceTally = { owner: 0, other: 0, stay: 0, lock: 0, detach: 0 };
      for (const id of order) {
        const state = states.get(id) ?? 'owner';
        tally[state] += 1;
      }
      return tally;
    },

    get selectedCount(): number {
      return selected.size;
    },

    isSelected(assetFaceId: string): boolean {
      return selected.has(assetFaceId);
    },

    toggleSelect(assetFaceId: string): void {
      if (selected.has(assetFaceId)) {
        selected.delete(assetFaceId);
      } else {
        selected.add(assetFaceId);
      }
      lastToggledIndex = indexById.get(assetFaceId) ?? null;
    },

    selectRange(assetFaceId: string): void {
      const to = indexById.get(assetFaceId);
      if (to === undefined) {
        return;
      }
      const from = lastToggledIndex ?? to;
      const [start, end] = from <= to ? [from, to] : [to, from];
      for (let i = start; i <= end; i++) {
        selected.add(order[i]);
      }
      lastToggledIndex = to;
    },

    selectAll(): void {
      for (const id of order) {
        selected.add(id);
      }
    },

    clearSelection(): void {
      clearSelectionState();
    },

    reset(): void {
      for (const id of order) {
        states.set(id, 'owner');
        destinations.delete(id);
      }
      clearSelectionState();
    },

    applyToSelection(state: FaceState, destination?: { personId: string; name?: string | null }): void {
      for (const id of selected) {
        states.set(id, state);
        if (state === 'other' && destination) {
          destinations.set(id, { personId: destination.personId, name: destination.name ?? null });
        } else {
          destinations.delete(id);
        }
      }
      clearSelectionState();
    },

    buildResolveRequest(personId: string): FaceRepairResolveRequestDto {
      // Plain Map: local bookkeeping scoped to this single pure-function call, discarded on return — no UI
      // reads it, so it never needs to be reactive.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const moveGroups = new Map<string, string[]>();
      const stay: string[] = [];
      const lock: string[] = [];
      const detach: string[] = [];

      const addToMoveGroup = (destinationPersonId: string, assetFaceId: string) => {
        const group = moveGroups.get(destinationPersonId);
        if (group) {
          group.push(assetFaceId);
        } else {
          moveGroups.set(destinationPersonId, [assetFaceId]);
        }
      };

      for (const face of flaggedFaces) {
        const state = states.get(face.assetFaceId) ?? 'owner';
        switch (state) {
          case 'owner': {
            addToMoveGroup(face.suspectedOwnerId, face.assetFaceId);
            break;
          }
          case 'other': {
            const destinationPersonId = destinations.get(face.assetFaceId)?.personId;
            if (destinationPersonId) {
              addToMoveGroup(destinationPersonId, face.assetFaceId);
            }
            break;
          }
          case 'stay': {
            stay.push(face.assetFaceId);
            break;
          }
          case 'lock': {
            lock.push(face.assetFaceId);
            break;
          }
          case 'detach': {
            detach.push(face.assetFaceId);
            break;
          }
        }
      }

      return {
        personId,
        moveToPerson: [...moveGroups.entries()].map(([destinationPersonId, faceIds]) => ({
          destinationPersonId,
          faceIds,
        })),
        stay,
        lock,
        detach,
      };
    },
  };
}
