import { SvelteSet } from 'svelte/reactivity';

export interface FlaggedFace {
  assetFaceId: string;
  suspectedOwnerId?: string;
}

export interface ReviewModel {
  readonly excluded: Set<string>;
  readonly declined: Set<string>;
  readonly movingCount: number;
  readonly excludedCount: number;
  toggle(assetFaceId: string): void;
  isExcluded(assetFaceId: string): boolean;
  excludeFaceIds(): string[];
  markDeclined(assetFaceId: string): void;
  isDeclined(assetFaceId: string): boolean;
  declinedFaceIds(): string[];
}

export function createReviewModel(flaggedFaces: FlaggedFace[]): ReviewModel {
  const excluded: SvelteSet<string> = new SvelteSet();
  const declined: SvelteSet<string> = new SvelteSet();

  return {
    excluded,
    declined,

    get movingCount() {
      return flaggedFaces.filter((f) => !excluded.has(f.assetFaceId) && !declined.has(f.assetFaceId)).length;
    },

    get excludedCount() {
      return excluded.size;
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

    isDeclined(assetFaceId: string): boolean {
      return declined.has(assetFaceId);
    },

    declinedFaceIds(): string[] {
      return [...declined];
    },
  };
}
