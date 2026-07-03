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

export interface FaceCleanupModelOptions {
  // The previous model, when rebuilding after a refetch/dismiss: user selections and opened state are
  // carried over (intersected with the surviving persons) instead of resetting to the confident preselect.
  prev?: FaceCleanupModel | null;
  // Opened person ids restored from persistence (e.g. sessionStorage) so the review-first gate survives
  // navigating to a person's review page and back.
  restoredOpened?: Iterable<string>;
}

export function createFaceCleanupModel(
  persons: FaceCleanupPerson[],
  options?: FaceCleanupModelOptions,
): FaceCleanupModel {
  const reviewFirst = persons.filter((p) => p.recommendation === 'review-first');
  const confident = persons.filter((p) => p.recommendation === 'confident');

  // Precompute id sets so canSelect is O(1) (B4). It's called once per row on every render and again inside
  // toggle; at hundreds/thousands of persons the previous per-call find()+some() made it O(n) → O(n²) per render.
  const reviewFirstIds = new SvelteSet(reviewFirst.map((p) => p.personId));
  const confidentIds = new SvelteSet(confident.map((p) => p.personId));

  const prev = options?.prev ?? null;
  const currentIds = new SvelteSet(persons.map((p) => p.personId));
  // Ids the previous model knew about — for those, the user's selection choice wins; anything newly
  // appeared falls back to the default (confident -> preselected).
  const known = prev ? new SvelteSet([...prev.reviewFirst, ...prev.confident].map((p) => p.personId)) : null;

  const selected: SvelteSet<string> = new SvelteSet(
    persons
      .filter((p) => (known?.has(p.personId) ? prev!.selected.has(p.personId) : p.recommendation === 'confident'))
      .map((p) => p.personId),
  );
  const opened: SvelteSet<string> = new SvelteSet(
    [...(prev?.opened ?? []), ...(options?.restoredOpened ?? [])].filter((id) => currentIds.has(id)),
  );

  return {
    reviewFirst,
    confident,
    selected,
    opened,

    get selectedCount() {
      return selected.size;
    },

    canSelect(id: string): boolean {
      if (reviewFirstIds.has(id)) {
        // review-first persons are only selectable once opened (reviewed)
        return opened.has(id);
      }
      // confident persons are always selectable
      return confidentIds.has(id);
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
