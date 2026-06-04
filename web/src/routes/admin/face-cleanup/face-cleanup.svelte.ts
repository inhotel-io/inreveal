import { SvelteSet } from 'svelte/reactivity';

export interface FaceCleanupPerson {
  personId: string;
  ownerId: string;
  personName: string | null;
  faceCount: number;
  thumbnailFaceId: string | null;
  eligible: number;
  flagged: number;
  flaggedFraction: number;
  suspectedOwners: { ownerPersonId: string; ownerName: string | null; thumbnailFaceId: string | null; count: number }[];
  recommendation: 'confident' | 'review-first';
  reviewReasons: string[];
}

export interface FaceCleanupModel {
  readonly reviewFirst: FaceCleanupPerson[];
  readonly confident: FaceCleanupPerson[];
  readonly selected: Set<string>;
  readonly opened: Set<string>;
  readonly selectedCount: number;
  toggle(id: string): void;
  open(id: string): void;
  clear(): void;
  canSelect(id: string): boolean;
}

export function createFaceCleanupModel(persons: FaceCleanupPerson[]): FaceCleanupModel {
  const reviewFirst = persons.filter((p) => p.recommendation === 'review-first');
  const confident = persons.filter((p) => p.recommendation === 'confident');

  const selected: SvelteSet<string> = new SvelteSet(confident.map((p) => p.personId));
  const opened: SvelteSet<string> = new SvelteSet();

  return {
    reviewFirst,
    confident,
    selected,
    opened,

    get selectedCount() {
      return selected.size;
    },

    canSelect(id: string): boolean {
      const person = reviewFirst.find((p) => p.personId === id);
      if (person) {
        return opened.has(id);
      }
      // confident persons are always selectable
      return confident.some((p) => p.personId === id);
    },

    toggle(id: string): void {
      if (!this.canSelect(id)) {
        return;
      }
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        selected.add(id);
      }
    },

    open(id: string): void {
      opened.add(id);
    },

    clear(): void {
      selected.clear();
    },
  };
}
