import type { FaceRepairApplyRequestDto } from '@immich/sdk';
import { SvelteSet } from 'svelte/reactivity';

export interface FlaggedFace {
  assetFaceId: string;
  suspectedOwnerId?: string;
}

export interface ReviewModel {
  readonly excluded: Set<string>;
  readonly declined: Set<string>;
  readonly manualSelected: Set<string>;
  readonly movingCount: number;
  readonly excludedCount: number;
  readonly entireCluster: boolean;
  toggle(assetFaceId: string): void;
  isExcluded(assetFaceId: string): boolean;
  excludeFaceIds(): string[];
  markDeclined(assetFaceId: string): void;
  unmarkDeclined(assetFaceId: string): void;
  isDeclined(assetFaceId: string): boolean;
  declinedFaceIds(): string[];
  toggleManual(assetFaceId: string): void;
  isManualSelected(assetFaceId: string): boolean;
  selectAllLoaded(assetFaceIds: string[]): void;
  clearManual(): void;
  manualFaceIds(): string[];
  setEntireCluster(on: boolean): void;
  setClusterTotal(total: number): void;
  applyPayload(input: { personId: string; destinationPersonId: string | null }): FaceRepairApplyRequestDto;
}

export function createReviewModel(flaggedFaces: FlaggedFace[]): ReviewModel {
  const excluded: SvelteSet<string> = new SvelteSet();
  const declined: SvelteSet<string> = new SvelteSet();
  const manualSelected: SvelteSet<string> = new SvelteSet();
  let entireCluster = $state(false);
  let clusterTotal = $state(0);

  const flaggedMovingCount = () =>
    flaggedFaces.filter((f) => !excluded.has(f.assetFaceId) && !declined.has(f.assetFaceId)).length;

  return {
    excluded,
    declined,
    manualSelected,

    get movingCount() {
      return entireCluster ? clusterTotal : flaggedMovingCount() + manualSelected.size;
    },

    get excludedCount() {
      return excluded.size;
    },

    get entireCluster() {
      return entireCluster;
    },

    toggle(assetFaceId: string): void {
      if (excluded.has(assetFaceId)) {
        excluded.delete(assetFaceId);
      } else {
        excluded.add(assetFaceId);
      }
    },

    isExcluded(assetFaceId: string): boolean {
      return excluded.has(assetFaceId);
    },

    excludeFaceIds(): string[] {
      return [...excluded];
    },

    markDeclined(assetFaceId: string): void {
      declined.add(assetFaceId);
    },

    unmarkDeclined(assetFaceId: string): void {
      declined.delete(assetFaceId);
    },

    isDeclined(assetFaceId: string): boolean {
      return declined.has(assetFaceId);
    },

    declinedFaceIds(): string[] {
      return [...declined];
    },

    toggleManual(assetFaceId: string): void {
      if (manualSelected.has(assetFaceId)) {
        manualSelected.delete(assetFaceId);
      } else {
        manualSelected.add(assetFaceId);
      }
    },

    isManualSelected(assetFaceId: string): boolean {
      return manualSelected.has(assetFaceId);
    },

    selectAllLoaded(assetFaceIds: string[]): void {
      for (const id of assetFaceIds) {
        manualSelected.add(id);
      }
    },

    clearManual(): void {
      manualSelected.clear();
    },

    manualFaceIds(): string[] {
      return [...manualSelected];
    },

    setEntireCluster(on: boolean): void {
      entireCluster = on;
    },

    setClusterTotal(total: number): void {
      clusterTotal = total;
    },

    applyPayload({ personId, destinationPersonId }): FaceRepairApplyRequestDto {
      if (entireCluster && destinationPersonId) {
        return {
          approvedPersonIds: [],
          excludeFaceIds: [],
          manualMove: { personId, destinationPersonId, entireCluster: true },
        };
      }
      const payload: FaceRepairApplyRequestDto = {
        approvedPersonIds: [personId],
        excludeFaceIds: [...excluded, ...declined],
      };
      if (manualSelected.size > 0 && destinationPersonId) {
        payload.manualMove = { personId, destinationPersonId, faceIds: [...manualSelected] };
      }
      return payload;
    },
  };
}
