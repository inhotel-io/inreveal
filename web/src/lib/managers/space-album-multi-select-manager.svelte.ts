import { SvelteSet } from 'svelte/reactivity';

export type SpaceAlbumSelectionKind = 'album' | 'folder';

/**
 * Mirrors AssetMultiSelectManager's shape deliberately rather than sharing code with it: that
 * manager is asset-typed throughout (ownedAssets, isAllTrashed, isAllArchived, isAllFavorite), so a
 * shared generic would either drag asset concepts into the album domain or dissolve into type
 * parameters. This is ~40 lines; copying beats abstracting.
 *
 * The manager never learns about grouping, search or view mode. Callers pass `ordered` — the flat
 * visual list for the CURRENT mode — so range semantics stay correct without the manager
 * understanding why an item is or is not in it.
 */
export class SpaceAlbumMultiSelectManager {
  #kind = $state<SpaceAlbumSelectionKind | 'none'>('none');
  #ids = new SvelteSet<string>();
  #anchor = $state<string | null>(null);

  candidates = $state<string[]>([]);

  kind = $derived(this.#kind);
  ids = $derived(Array.from(this.#ids));
  count = $derived(this.#ids.size);
  selectionActive = $derived(this.#ids.size > 0);

  has(kind: SpaceAlbumSelectionKind, id: string) {
    return this.#kind === kind && this.#ids.has(id);
  }

  isCandidate(id: string) {
    return this.candidates.includes(id);
  }

  toggle(kind: SpaceAlbumSelectionKind, id: string, ordered: string[]) {
    // Never-mixed: switching kind replaces the selection wholesale (spec §4.2).
    if (this.#kind !== kind) {
      this.#kind = kind;
      this.#ids.clear();
    }
    if (this.#ids.has(id)) {
      this.#ids.delete(id);
      if (this.#ids.size === 0) {
        this.#kind = 'none';
        this.#anchor = null;
      }
    } else {
      this.#ids.add(id);
      this.#anchor = id;
    }
    this.candidates = [];
    void ordered;
  }

  #range(toId: string, ordered: string[]): string[] {
    const from = this.#anchor;
    if (from === null) {
      return [toId];
    }
    const i = ordered.indexOf(from);
    const j = ordered.indexOf(toId);
    if (i === -1 || j === -1) {
      return [toId];
    }
    return ordered.slice(Math.min(i, j), Math.max(i, j) + 1);
  }

  selectRange(kind: SpaceAlbumSelectionKind, toId: string, ordered: string[]) {
    if (this.#kind !== kind) {
      this.#kind = kind;
      this.#ids.clear();
      this.#anchor = null;
    }
    for (const id of this.#range(toId, ordered)) {
      this.#ids.add(id);
    }
    // Spec E-7: a Shift-click with no anchor "behaves as a plain click: selects that one item AND
    // SETS IT AS THE ANCHOR". Without this, a Shift-click as the FIRST interaction leaves the anchor
    // null forever — previewRange then returns no candidates, and the next Shift-click selects only
    // the two endpoints, silently skipping everything between.
    this.#anchor ??= toId;
    this.candidates = [];
  }

  previewRange(kind: SpaceAlbumSelectionKind, toId: string, ordered: string[]) {
    if (this.#kind !== kind || this.#anchor === null) {
      this.candidates = [];
      return;
    }
    this.candidates = this.#range(toId, ordered).filter((id) => !this.#ids.has(id));
  }

  /** Drop ids that have disappeared from the page's data (E-5). */
  reconcile(presentIds: string[]) {
    // Plain `Set` (not `SvelteSet`) because it's a local, non-reactive lookup discarded
    // at the end of this method — nothing reads it after this call returns.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const present = new Set(presentIds);
    for (const id of this.#ids) {
      if (!present.has(id)) {
        this.#ids.delete(id);
      }
    }
    if (this.#ids.size === 0) {
      this.#kind = 'none';
      this.#anchor = null;
    } else if (this.#anchor !== null && !present.has(this.#anchor)) {
      // The anchor can survive a reconcile that drops the REST of the selection down to zero
      // items removed (so the `size === 0` branch above never fires) while the anchor's own id is
      // the one that left `present` — e.g. a partial-failure bulk action reconciles away exactly
      // the ids that succeeded, and the anchor happened to be one of them. #range()'s
      // `indexOf(from) === -1` fallback then always returns `[toId]`, and the `#anchor ??= toId`
      // in selectRange will not overwrite a non-null stale value — so Shift-click silently
      // degrades to a plain add, indefinitely, until the user happens to make a plain click.
      // Clearing it here lets the next Shift-click re-arm the anchor via that same `??=`, exactly
      // like the first-interaction case (E-7).
      this.#anchor = null;
    }
    // m-1: a stale preview must not survive reconciliation — isCandidate(id) must stop being
    // true for an id that just disappeared from the page's data.
    this.candidates = [];
  }

  clear() {
    this.#kind = 'none';
    this.#ids.clear();
    this.#anchor = null;
    this.candidates = [];
  }
}
