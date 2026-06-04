import { SvelteSet } from 'svelte/reactivity';

export interface FlaggedFace {
  assetFaceId: string;
  suspectedOwnerId?: string;
}

export interface ReviewModel {
  readonly excluded: Set<string>;
  readonly movingCount: number;
  readonly excludedCount: number;
  toggle(assetFaceId: string): void;
  isExcluded(assetFaceId: string): boolean;
  excludeFaceIds(): string[];
}

export function createReviewModel(flaggedFaces: FlaggedFace[]): ReviewModel {
  const excluded: SvelteSet<string> = new SvelteSet();

  return {
    excluded,

    get movingCount() {
      return flaggedFaces.length - excluded.size;
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
  };
}
