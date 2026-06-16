# Unified album + space picker from the timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timeline "+" picker (and the single-photo "Add to album" action) list albums **and** shared spaces in one searchable list, differentiated by a per-row badge, with cross-type multi-select and inline "New Album"/"New Space" creation.

**Architecture:** A fork-only "collection" layer composes the existing upstream album picker pieces and the existing fork space primitives. A pure `CollectionModalRowConverter` + helpers (no DOM) carry the list/selection logic; a thin `CollectionPickerModal` renders rows (reusing `AlbumListItem` for albums and a new `SpaceListItem` for spaces); an `addAssetsToCollections` service splits a mixed selection and dispatches to the existing `addAssetsToAlbums` / `addAssetsToSpace`. No backend, SDK, or schema changes.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, `@immich/sdk`, `@immich/ui`, Tailwind 4, Vitest + `@testing-library/svelte` (happy-dom), Playwright (e2e).

**Spec:** `docs/plans/2026-06-16-timeline-add-to-space-picker-design.md` — read it first.

## Global Constraints

- **Frontend only.** No server/SDK/DB changes. Reuse `POST /shared-spaces/:id/assets`, `addAssetsToAlbums`, `createSpace` as-is.
- **Rebase-cleanliness.** Album picker, `album-list-item.svelte`, `album-selection-utils.ts`, `album.service.ts` are **upstream** files. The only permitted upstream edit is **one additive optional prop** on `album-list-item.svelte`. Everything else lives in **new fork-only files** under `collection-selection/`, `modals/`, `services/`, `actions/`.
- **Imports:** use the `$lib/` alias (no deep relative imports across `lib`).
- **i18n:** every new key is a fork-only string → add to **`i18n/en.json`, `i18n/de.json`, and `i18n/fr.json`** in the same alphabetical slot. Use the existing fork terminology: DE "Space"/"Album"/"Mitglieder"/"Neueste"; FR "espace"/"album"/"Membres"/"Récent".
- **Lint:** zero-warning ESLint; strict TS. Run `pnpm check` (svelte-check + tsc) in the loop; defer the one slow full `pnpm lint` pass to the final gate.
- **TDD, strictly:** for every task, write the failing test first, run it red, write the minimal code, run it green, commit. No implementation step lands without its test green.
- **Space picker shows writable spaces only** (Owner/Editor), mirroring `SpacePickerModal`.
- `MAX_SPACE_ASSETS_PER_REQUEST = 10_000` (`$lib/constants`).

## File Structure

**New (fork-only):**

- `web/src/lib/components/shared-components/collection-selection/collection-selection-utils.ts` — types (`PickerCollection`, `CollectionModalRow`, `CollectionModalRowType`), helpers (`collectionKey`, `isWritableSpace`, `albumToCollection`, `spaceToCollection`, `recencyOf`, `sortByNameAsc`, `pickRecent`, `isValidNewSpaceName`, `isSelectableRowType`), and `CollectionModalRowConverter`.
- `web/src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts` — unit tests.
- `web/src/lib/services/collection.service.ts` — `addAssetsToCollections`.
- `web/src/lib/services/collection.service.spec.ts` — unit tests.
- `web/src/lib/actions/long-press.ts` — reusable longpress action (extracted, fork-only).
- `web/src/lib/components/shared-components/collection-selection/space-list-item.svelte` — space row.
- `web/src/lib/components/shared-components/collection-selection/space-list-item.spec.ts`.
- `web/src/lib/components/shared-components/collection-selection/new-space-list-item.svelte` — "New Space" row.
- `web/src/lib/components/shared-components/collection-selection/new-space-list-item.spec.ts`.
- `web/src/lib/modals/CollectionPickerModal.svelte` — the unified modal.
- `web/src/lib/modals/CollectionPickerModal.spec.ts`.
- `web/src/lib/modals/AssetAddToCollectionModal.svelte` — wrapper.
- `e2e/src/web/specs/timeline-add-to-collection.e2e-spec.ts` (or nearest existing web-spec dir) — Playwright.

**Modified:**

- `web/src/lib/components/asset-viewer/album-list-item.svelte` — add optional `badgeIcon`/`badgeClass` props (additive).
- `web/src/lib/services/asset.service.ts` — repoint the two `AddToAlbum` actions to `AssetAddToCollectionModal`.
- `web/src/lib/managers/selection-command-handlers.ts` — repoint `handleAddSelectedToAlbum` and `handleAddSelectedToSpace` to `AssetAddToCollectionModal`.
- `i18n/en.json`, `i18n/de.json`, `i18n/fr.json` — new keys.

**Removed (after repoint, if no other callers — verify with grep):**

- `web/src/lib/modals/AssetAddToAlbumModal.svelte`, `web/src/lib/modals/AssetAddToSpaceModal.svelte`.

---

### Task 1: Collection types & pure helpers

**Files:**
- Create: `web/src/lib/components/shared-components/collection-selection/collection-selection-utils.ts`
- Test: `web/src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts`

**Interfaces:**
- Produces: `PickerCollection` (discriminated union), `collectionKey(c): string`, `isWritableSpace(space, userId): boolean`, `albumToCollection(album): PickerCollection`, `spaceToCollection(space): PickerCollection`, `recencyOf(c): number`, `sortByNameAsc(list): PickerCollection[]`, `pickRecent(list, limit?): PickerCollection[]`, `isValidNewSpaceName(name): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// collection-selection-utils.spec.ts
import { describe, expect, it } from 'vitest';
import { SharedSpaceRole } from '@immich/sdk';
import {
  albumToCollection,
  collectionKey,
  isValidNewSpaceName,
  isWritableSpace,
  pickRecent,
  recencyOf,
  sortByNameAsc,
  spaceToCollection,
} from './collection-selection-utils';

const album = (id: string, name: string, updatedAt = '2024-01-01T00:00:00Z') =>
  ({ id, albumName: name, updatedAt, assetCount: 0, shared: false }) as any;
const space = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, createdById: 'me', createdAt: '2024-01-01T00:00:00Z', members: [], ...extra }) as any;

describe('collection helpers', () => {
  it('builds discriminated collections with stable keys', () => {
    const a = albumToCollection(album('a1', 'Trip'));
    const s = spaceToCollection(space('s1', 'Trip'));
    expect(a.kind).toBe('album');
    expect(s.kind).toBe('space');
    expect(collectionKey(a)).toBe('album:a1');
    expect(collectionKey(s)).toBe('space:s1');
    // same id across types must not collide
    expect(collectionKey(albumToCollection(album('x', 'A')))).not.toBe(collectionKey(spaceToCollection(space('x', 'A'))));
  });

  it('treats owner and editor as writable, viewer as not', () => {
    expect(isWritableSpace(space('s', 'n', { createdById: 'me' }), 'me')).toBe(true);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [{ userId: 'me', role: SharedSpaceRole.Editor }] }), 'me')).toBe(true);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [{ userId: 'me', role: SharedSpaceRole.Viewer }] }), 'me')).toBe(false);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [] }), 'me')).toBe(false);
    expect(isWritableSpace(space('s', 'n', { createdById: 'other', members: [] }), null)).toBe(false);
  });

  it('ranks recency: album updatedAt, space lastActivityAt ?? createdAt', () => {
    const a = albumToCollection(album('a', 'A', '2024-05-01T00:00:00Z'));
    const sActive = spaceToCollection(space('s1', 'S1', { lastActivityAt: '2024-06-01T00:00:00Z' }));
    const sNoActivity = spaceToCollection(space('s2', 'S2', { lastActivityAt: null, createdAt: '2024-01-01T00:00:00Z' }));
    expect(recencyOf(sActive)).toBeGreaterThan(recencyOf(a));
    expect(recencyOf(a)).toBeGreaterThan(recencyOf(sNoActivity));
    expect(pickRecent([sNoActivity, a, sActive], 2).map((c) => c.id)).toEqual(['s1', 'a']);
  });

  it('sorts by name case-insensitively', () => {
    const list = [spaceToCollection(space('s', 'banana')), albumToCollection(album('a', 'Apple'))];
    expect(sortByNameAsc(list).map((c) => c.name)).toEqual(['Apple', 'banana']);
  });

  it('validates new space names (1..100 chars, trimmed)', () => {
    expect(isValidNewSpaceName('')).toBe(false);
    expect(isValidNewSpaceName('   ')).toBe(false);
    expect(isValidNewSpaceName('Family')).toBe(true);
    expect(isValidNewSpaceName('x'.repeat(101))).toBe(false);
    expect(isValidNewSpaceName('x'.repeat(100))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// collection-selection-utils.ts
import { normalizeSearchString } from '$lib/utils/string-utils';
import { SharedSpaceRole, type AlbumResponseDto, type SharedSpaceResponseDto } from '@immich/sdk';

export type PickerCollection =
  | { kind: 'album'; id: string; name: string; album: AlbumResponseDto }
  | { kind: 'space'; id: string; name: string; space: SharedSpaceResponseDto };

export const collectionKey = (c: PickerCollection): string => `${c.kind}:${c.id}`;

export const albumToCollection = (album: AlbumResponseDto): PickerCollection => ({
  kind: 'album',
  id: album.id,
  name: album.albumName,
  album,
});

export const spaceToCollection = (space: SharedSpaceResponseDto): PickerCollection => ({
  kind: 'space',
  id: space.id,
  name: space.name,
  space,
});

export const isWritableSpace = (space: SharedSpaceResponseDto, currentUserId: string | null): boolean => {
  if (currentUserId && space.createdById === currentUserId) {
    return true;
  }
  const role = space.members?.find((member) => member.userId === currentUserId)?.role;
  return role === SharedSpaceRole.Owner || role === SharedSpaceRole.Editor;
};

export const recencyOf = (c: PickerCollection): number =>
  c.kind === 'album'
    ? new Date(c.album.updatedAt).getTime()
    : new Date(c.space.lastActivityAt ?? c.space.createdAt).getTime();

export const sortByNameAsc = (collections: PickerCollection[]): PickerCollection[] =>
  [...collections].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export const pickRecent = (collections: PickerCollection[], limit = 3): PickerCollection[] =>
  [...collections].sort((a, b) => recencyOf(b) - recencyOf(a)).slice(0, limit);

export const isValidNewSpaceName = (name: string): boolean => {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
};

// `normalizeSearchString` is re-exported intentionally so the converter (Task 2) and
// row components share one matcher. (Imported above to keep a single source of truth.)
export const matchesSearch = (name: string, search: string): boolean =>
  normalizeSearchString(name).includes(normalizeSearchString(search));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/shared-components/collection-selection/collection-selection-utils.ts web/src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts
git commit -m "feat(web): collection picker types and pure helpers"
```

---

### Task 2: CollectionModalRowConverter

**Files:**
- Modify: `web/src/lib/components/shared-components/collection-selection/collection-selection-utils.ts` (append)
- Test: same `.spec.ts` (append a `describe`)

**Interfaces:**
- Consumes: Task 1 helpers + `matchesSearch`.
- Produces:
  - `enum CollectionModalRowType { NEW_ALBUM, NEW_SPACE, SECTION, MESSAGE, COLLECTION_ITEM }`
  - `type CollectionModalRow = { type; selected?; multiSelected?; text?; collection?: PickerCollection }`
  - `isSelectableRowType(type): boolean`
  - `class CollectionModalRowConverter { toModalRows(search, recent, all, selectedRowIndex, multiSelectedKeys, options: { showSpaces: boolean }): CollectionModalRow[] }`

- [ ] **Step 1: Write the failing test** (append)

```ts
import {
  CollectionModalRowConverter,
  CollectionModalRowType,
  isSelectableRowType,
} from './collection-selection-utils';

describe('CollectionModalRowConverter', () => {
  const conv = new CollectionModalRowConverter();
  const a = (id: string, name: string) => albumToCollection(album(id, name));
  const s = (id: string, name: string) => spaceToCollection(space(id, name));
  const opts = { showSpaces: true };

  it('always emits New Album then New Space first when spaces shown', () => {
    const rows = conv.toModalRows('', [], [], -1, [], opts);
    expect(rows[0].type).toBe(CollectionModalRowType.NEW_ALBUM);
    expect(rows[1].type).toBe(CollectionModalRowType.NEW_SPACE);
  });

  it('omits New Space and all spaces when showSpaces is false (over-cap)', () => {
    const rows = conv.toModalRows('', [a('a', 'A')], [a('a', 'A')], -1, [], { showSpaces: false });
    expect(rows.find((r) => r.type === CollectionModalRowType.NEW_SPACE)).toBeUndefined();
    // create-row offset is now 1: index 0 = New Album, index 1 = first item
    expect(rows[0].type).toBe(CollectionModalRowType.NEW_ALBUM);
  });

  it('shows both same-name collections with correct kind', () => {
    const all = [a('a1', 'Tuscany 2024'), s('s1', 'Tuscany 2024')];
    const rows = conv.toModalRows('', [], all, -1, [], opts).filter((r) => r.type === CollectionModalRowType.COLLECTION_ITEM);
    expect(rows.map((r) => r.collection!.kind).sort()).toEqual(['album', 'space']);
  });

  it('hides RECENT while searching and filters both types via normalize', () => {
    const all = [a('a1', 'Tüscany'), s('s1', 'Rome')];
    const rows = conv.toModalRows('tuscany', [a('a1', 'Tüscany')], all, -1, [], opts);
    expect(rows.find((r) => r.type === CollectionModalRowType.SECTION && r.text?.toUpperCase().includes('RECENT'))).toBeUndefined();
    const items = rows.filter((r) => r.type === CollectionModalRowType.COLLECTION_ITEM);
    expect(items).toHaveLength(1);
    expect(items[0].collection!.id).toBe('a1');
  });

  it('focus offset is 2 (two create rows): index 2 selects the first item', () => {
    const all = [a('a1', 'A'), s('s1', 'B')];
    const rows = conv.toModalRows('', [], all, 2, [], opts).filter((r) => r.type === CollectionModalRowType.COLLECTION_ITEM);
    expect(rows[0].selected).toBe(true);
    expect(rows[1].selected).toBe(false);
  });

  it('marks multiSelected rows by collectionKey', () => {
    const all = [a('a1', 'A'), s('s1', 'B')];
    const rows = conv.toModalRows('', [], all, -1, ['space:s1'], opts).filter((r) => r.type === CollectionModalRowType.COLLECTION_ITEM);
    expect(rows.find((r) => r.collection!.id === 's1')!.multiSelected).toBe(true);
    expect(rows.find((r) => r.collection!.id === 'a1')!.multiSelected).toBe(false);
  });

  it('emits no-match message when search matches nothing but library is non-empty', () => {
    const rows = conv.toModalRows('zzz', [], [a('a1', 'A')], -1, [], opts);
    expect(rows.some((r) => r.type === CollectionModalRowType.MESSAGE)).toBe(true);
    expect(rows.some((r) => r.type === CollectionModalRowType.COLLECTION_ITEM)).toBe(false);
  });

  it('emits empty-library message when there is nothing at all', () => {
    const rows = conv.toModalRows('', [], [], -1, [], opts);
    expect(rows.some((r) => r.type === CollectionModalRowType.MESSAGE)).toBe(true);
  });

  it('isSelectableRowType: create rows and items are selectable, section/message are not', () => {
    expect(isSelectableRowType(CollectionModalRowType.NEW_ALBUM)).toBe(true);
    expect(isSelectableRowType(CollectionModalRowType.NEW_SPACE)).toBe(true);
    expect(isSelectableRowType(CollectionModalRowType.COLLECTION_ITEM)).toBe(true);
    expect(isSelectableRowType(CollectionModalRowType.SECTION)).toBe(false);
    expect(isSelectableRowType(CollectionModalRowType.MESSAGE)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts`
Expected: FAIL — `CollectionModalRowConverter` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `collection-selection-utils.ts`)

```ts
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

export enum CollectionModalRowType {
  NEW_ALBUM = 'newAlbum',
  NEW_SPACE = 'newSpace',
  SECTION = 'section',
  MESSAGE = 'message',
  COLLECTION_ITEM = 'collectionItem',
}

export type CollectionModalRow = {
  type: CollectionModalRowType;
  selected?: boolean;
  multiSelected?: boolean;
  text?: string;
  collection?: PickerCollection;
};

export const isSelectableRowType = (type: CollectionModalRowType): boolean =>
  type === CollectionModalRowType.NEW_ALBUM ||
  type === CollectionModalRowType.NEW_SPACE ||
  type === CollectionModalRowType.COLLECTION_ITEM;

export class CollectionModalRowConverter {
  toModalRows(
    search: string,
    recent: PickerCollection[],
    all: PickerCollection[],
    selectedRowIndex: number,
    multiSelectedKeys: string[],
    options: { showSpaces: boolean },
  ): CollectionModalRow[] {
    const $t = get(t);
    const rows: CollectionModalRow[] = [{ type: CollectionModalRowType.NEW_ALBUM, selected: selectedRowIndex === 0 }];
    if (options.showSpaces) {
      rows.push({ type: CollectionModalRowType.NEW_SPACE, selected: selectedRowIndex === 1 });
    }
    const createCount = rows.length;

    const isSearching = search.trim().length > 0;
    const recentToShow = isSearching ? [] : recent;
    const filtered = sortByNameAsc(isSearching ? all.filter((c) => matchesSearch(c.name, search)) : all);

    if (filtered.length === 0) {
      rows.push({
        type: CollectionModalRowType.MESSAGE,
        text: all.length > 0 ? $t('no_albums_or_spaces_with_name') : $t('no_albums_or_spaces_yet'),
      });
      return rows;
    }

    let index = createCount;
    const pushItem = (c: PickerCollection) => {
      rows.push({
        type: CollectionModalRowType.COLLECTION_ITEM,
        selected: selectedRowIndex === index,
        multiSelected: multiSelectedKeys.includes(collectionKey(c)),
        collection: c,
      });
      index++;
    };

    if (recentToShow.length > 0) {
      rows.push({ type: CollectionModalRowType.SECTION, text: $t('recent').toUpperCase() });
      for (const c of recentToShow) {
        pushItem(c);
      }
    }

    rows.push({ type: CollectionModalRowType.SECTION, text: $t('all_albums_and_spaces').toUpperCase() });
    for (const c of filtered) {
      pushItem(c);
    }
    return rows;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts`
Expected: PASS (section/message text returns the i18n key string in tests — assertions check types/keys-substring, not translations).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/shared-components/collection-selection/collection-selection-utils.ts web/src/lib/components/shared-components/collection-selection/collection-selection-utils.spec.ts
git commit -m "feat(web): unified collection modal row converter"
```

---

### Task 3: i18n keys (en/de/fr)

**Files:**
- Modify: `i18n/en.json`, `i18n/de.json`, `i18n/fr.json`

**Interfaces:**
- Produces these keys (referenced by Tasks 4–9). Top-level keys go in alphabetical position; the two `errors.*` keys go inside the existing `"errors": { … }` object alphabetically.

- [ ] **Step 1: Add the top-level keys** (alphabetical slots)

`en.json`:
```json
"add_to_album_or_space": "Add to album or space",
"add_to_collections_count": "Add to {count}",
"added_to_collections_count": "Added to {count, plural, one {# collection} other {# collections}}",
"all_albums_and_spaces": "All",
"new_space": "New Space",
"no_albums_or_spaces_with_name": "No albums or spaces with that name",
"no_albums_or_spaces_yet": "You don't have any albums or spaces yet",
"spaces_hidden_too_many_assets": "Spaces are hidden — too many photos selected (max {count})",
```

`de.json`:
```json
"add_to_album_or_space": "Zu Album oder Space hinzufügen",
"add_to_collections_count": "Zu {count} hinzufügen",
"added_to_collections_count": "Zu {count, plural, one {# Sammlung} other {# Sammlungen}} hinzugefügt",
"all_albums_and_spaces": "Alle",
"new_space": "Neuer Space",
"no_albums_or_spaces_with_name": "Keine Alben oder Spaces mit diesem Namen",
"no_albums_or_spaces_yet": "Du hast noch keine Alben oder Spaces",
"spaces_hidden_too_many_assets": "Spaces ausgeblendet – zu viele Fotos ausgewählt (max. {count})",
```

`fr.json`:
```json
"add_to_album_or_space": "Ajouter à l'album ou l'espace",
"add_to_collections_count": "Ajouter à {count}",
"added_to_collections_count": "Ajouté à {count, plural, one {# collection} other {# collections}}",
"all_albums_and_spaces": "Tout",
"new_space": "Nouvel espace",
"no_albums_or_spaces_with_name": "Aucun album ou espace portant ce nom",
"no_albums_or_spaces_yet": "Vous n'avez pas encore d'albums ni d'espaces",
"spaces_hidden_too_many_assets": "Espaces masqués — trop de photos sélectionnées (max {count})",
```

- [ ] **Step 2: Add the two `errors.*` keys** (inside `"errors": { … }`, alphabetical)

`en.json`:
```json
"failed_to_create_space": "Failed to create space",
"unable_to_load_albums": "Unable to load albums",
```
`de.json`:
```json
"failed_to_create_space": "Space konnte nicht erstellt werden",
"unable_to_load_albums": "Alben konnten nicht geladen werden",
```
`fr.json`:
```json
"failed_to_create_space": "Échec de la création de l'espace",
"unable_to_load_albums": "Impossible de charger les albums",
```

- [ ] **Step 3: Verify JSON parses and ordering is intact**

Run: `cd web && node -e "for (const f of ['en','de','fr']) JSON.parse(require('fs').readFileSync('../i18n/'+f+'.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/de.json i18n/fr.json
git commit -m "i18n: add unified collection picker strings (en/de/fr)"
```

---

### Task 4: `addAssetsToCollections` dispatch service

**Files:**
- Create: `web/src/lib/services/collection.service.ts`
- Test: `web/src/lib/services/collection.service.spec.ts`

**Interfaces:**
- Consumes: `PickerCollection` (Task 1); `addAssetsToAlbums` (`$lib/services/album.service`), `addAssetsToSpace` (`$lib/services/space.service`), `MAX_SPACE_ASSETS_PER_REQUEST` (`$lib/constants`), `toastManager`.
- Produces: `addAssetsToCollections(collections: PickerCollection[], assetIds: string[]): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// collection.service.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addAssetsToAlbums = vi.fn();
const addAssetsToSpace = vi.fn();
const primary = vi.fn();

vi.mock('$lib/services/album.service', () => ({ addAssetsToAlbums: (...a: unknown[]) => addAssetsToAlbums(...a) }));
vi.mock('$lib/services/space.service', () => ({ addAssetsToSpace: (...a: unknown[]) => addAssetsToSpace(...a) }));
vi.mock('@immich/ui', () => ({ toastManager: { primary: (...a: unknown[]) => primary(...a) } }));
vi.mock('$lib/utils/i18n', () => ({ getFormatter: async () => (key: string, opts?: any) => `${key}:${opts?.values?.count ?? ''}` }));

import { addAssetsToCollections } from './collection.service';

const albumCol = (id: string) => ({ kind: 'album', id, name: id, album: { id } }) as any;
const spaceCol = (id: string) => ({ kind: 'space', id, name: id, space: { id } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  addAssetsToAlbums.mockResolvedValue(true);
  addAssetsToSpace.mockResolvedValue(true);
});

describe('addAssetsToCollections', () => {
  it('single album → addAssetsToAlbums notify:true, no aggregate toast', async () => {
    await addAssetsToCollections([albumCol('a1')], ['x']);
    expect(addAssetsToAlbums).toHaveBeenCalledWith(['a1'], ['x'], { notify: true });
    expect(primary).not.toHaveBeenCalled();
  });

  it('single space → addAssetsToSpace notify:true, no aggregate toast', async () => {
    await addAssetsToCollections([spaceCol('s1')], ['x']);
    expect(addAssetsToSpace).toHaveBeenCalledWith('s1', ['x'], { notify: true });
    expect(primary).not.toHaveBeenCalled();
  });

  it('mixed multi → each notify:false, one aggregate toast counting successes', async () => {
    await addAssetsToCollections([albumCol('a1'), albumCol('a2'), spaceCol('s1')], ['x']);
    expect(addAssetsToAlbums).toHaveBeenCalledWith(['a1', 'a2'], ['x'], { notify: false });
    expect(addAssetsToSpace).toHaveBeenCalledWith('s1', ['x'], { notify: false });
    expect(primary).toHaveBeenCalledWith('added_to_collections_count:3'); // 2 albums + 1 space
  });

  it('partial failure → aggregate counts only successes; no throw', async () => {
    addAssetsToSpace.mockResolvedValue(false); // space fails
    await addAssetsToCollections([albumCol('a1'), spaceCol('s1')], ['x']);
    expect(primary).toHaveBeenCalledWith('added_to_collections_count:1');
  });

  it('total failure → no aggregate toast', async () => {
    addAssetsToAlbums.mockResolvedValue(false);
    addAssetsToSpace.mockResolvedValue(false);
    await addAssetsToCollections([albumCol('a1'), spaceCol('s1')], ['x']);
    expect(primary).not.toHaveBeenCalled();
  });

  it('over-cap selection skips spaces but still adds albums', async () => {
    const assetIds = Array.from({ length: 10001 }, (_, i) => `x${i}`);
    await addAssetsToCollections([albumCol('a1'), spaceCol('s1')], assetIds);
    expect(addAssetsToSpace).not.toHaveBeenCalled();
    expect(addAssetsToAlbums).toHaveBeenCalledWith(['a1'], assetIds, { notify: true }); // total becomes 1 → single path
  });

  it('empty selection is a no-op', async () => {
    await addAssetsToCollections([], ['x']);
    expect(addAssetsToAlbums).not.toHaveBeenCalled();
    expect(addAssetsToSpace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/services/collection.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// collection.service.ts
import type { PickerCollection } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
import { MAX_SPACE_ASSETS_PER_REQUEST } from '$lib/constants';
import { addAssetsToAlbums } from '$lib/services/album.service';
import { addAssetsToSpace } from '$lib/services/space.service';
import { getFormatter } from '$lib/utils/i18n';
import { toastManager } from '@immich/ui';

export const addAssetsToCollections = async (collections: PickerCollection[], assetIds: string[]): Promise<void> => {
  const $t = await getFormatter();

  const albumIds = collections.filter((c) => c.kind === 'album').map((c) => c.id);
  const spaceIds =
    assetIds.length > MAX_SPACE_ASSETS_PER_REQUEST
      ? []
      : collections.filter((c) => c.kind === 'space').map((c) => c.id);

  const total = albumIds.length + spaceIds.length;
  if (total === 0) {
    return;
  }

  if (total === 1 && albumIds.length === 1) {
    await addAssetsToAlbums(albumIds, assetIds, { notify: true });
    return;
  }
  if (total === 1 && spaceIds.length === 1) {
    await addAssetsToSpace(spaceIds[0], assetIds, { notify: true });
    return;
  }

  const tasks: { count: number; run: () => Promise<boolean> }[] = [];
  if (albumIds.length > 0) {
    tasks.push({ count: albumIds.length, run: () => addAssetsToAlbums(albumIds, assetIds, { notify: false }) });
  }
  for (const id of spaceIds) {
    tasks.push({ count: 1, run: () => addAssetsToSpace(id, assetIds, { notify: false }) });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  let success = 0;
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value === true) {
      success += tasks[i].count;
    }
  });

  if (success > 0) {
    toastManager.primary($t('added_to_collections_count', { values: { count: success } }));
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/services/collection.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/services/collection.service.ts web/src/lib/services/collection.service.spec.ts
git commit -m "feat(web): addAssetsToCollections split-dispatch service"
```

---

### Task 5: `badgeIcon` prop on AlbumListItem (the one upstream touch)

**Files:**
- Modify: `web/src/lib/components/asset-viewer/album-list-item.svelte`
- Test: `web/src/lib/components/asset-viewer/album-list-item.spec.ts`

**Interfaces:**
- Produces: `AlbumListItem` gains optional `badgeIcon?: string` and `badgeClass?: string` props (additive; default off → unchanged for existing callers). When `badgeIcon` is set, a badge with `data-testid="collection-row-badge"` renders on the thumbnail.

- [ ] **Step 1: Write the failing test**

```ts
// album-list-item.spec.ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { mdiImageMultipleOutline } from '@mdi/js';
import AlbumListItem from './album-list-item.svelte';

const album = { id: 'a1', albumName: 'Trip', assetCount: 3, albumThumbnailAssetId: null, shared: false } as any;
const noop = () => {};

describe('AlbumListItem badge', () => {
  it('renders no badge by default', () => {
    render(AlbumListItem, { album, selected: false, onAlbumClick: noop, onMultiSelect: noop });
    expect(screen.queryByTestId('collection-row-badge')).toBeNull();
  });

  it('renders a badge when badgeIcon is provided', () => {
    render(AlbumListItem, { album, selected: false, onAlbumClick: noop, onMultiSelect: noop, badgeIcon: mdiImageMultipleOutline });
    expect(screen.queryByTestId('collection-row-badge')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/components/asset-viewer/album-list-item.spec.ts`
Expected: FAIL — badge not rendered.

- [ ] **Step 3: Write minimal implementation**

In the `Props` interface add:
```ts
    badgeIcon?: string;
    badgeClass?: string;
```
In the destructure add `badgeIcon = undefined, badgeClass = undefined`:
```ts
  let {
    album,
    searchQuery = '',
    selected = false,
    multiSelected = false,
    onAlbumClick,
    onMultiSelect,
    badgeIcon = undefined,
    badgeClass = undefined,
  }: Props = $props();
```
Replace the thumbnail `<span class="h-16 w-16 shrink-0 rounded-xl bg-slate-300"> … </span>` block with:
```svelte
    <span class="relative h-16 w-16 shrink-0 rounded-xl bg-slate-300">
      {#if album.albumThumbnailAssetId}
        <img
          src={getAssetMediaUrl({ id: album.albumThumbnailAssetId })}
          alt={album.albumName}
          class={['h-full w-full rounded-xl object-cover transition-all duration-300 hover:shadow-lg']}
          data-testid="album-image"
          draggable="false"
        />
      {/if}
      {#if badgeIcon}
        <span
          class="absolute -bottom-1.5 -end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-immich-bg ring-2 ring-immich-bg dark:bg-immich-dark-gray dark:ring-immich-dark-gray"
          data-testid="collection-row-badge"
        >
          <Icon icon={badgeIcon} size="0.9rem" class={badgeClass ?? 'text-immich-primary dark:text-immich-dark-primary'} />
        </span>
      {/if}
    </span>
```
(`Icon` is already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/components/asset-viewer/album-list-item.spec.ts`
Expected: PASS. Then `cd web && pnpm check` to confirm no type/markup regressions.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/asset-viewer/album-list-item.svelte web/src/lib/components/asset-viewer/album-list-item.spec.ts
git commit -m "feat(web): optional badge on AlbumListItem thumbnail"
```

---

### Task 6: longpress action + SpaceListItem

**Files:**
- Create: `web/src/lib/actions/long-press.ts`
- Create: `web/src/lib/components/shared-components/collection-selection/space-list-item.svelte`
- Test: `web/src/lib/components/shared-components/collection-selection/space-list-item.spec.ts`

**Interfaces:**
- Produces: `longPress` action; `SpaceListItem` with props `{ space: SharedSpaceResponseDto; searchQuery?: string; selected: boolean; multiSelected?: boolean; onSpaceClick: () => void; onMultiSelect: () => void }`. Renders `data-testid="space-row"` (main button), `data-testid="space-row-badge"`, and a `role="checkbox"` multi-select control (visible when hovered or multiSelected).

- [ ] **Step 1: Write the failing test**

```ts
// space-list-item.spec.ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SpaceListItem from './space-list-item.svelte';

const base = { id: 's1', name: 'Family', memberCount: 2, assetCount: 5, members: [], createdById: 'u1', createdAt: '2024-01-01T00:00:00Z' };
const props = (over = {}) => ({ space: { ...base, ...over } as any, selected: false, onSpaceClick: vi.fn(), onMultiSelect: vi.fn() });

describe('SpaceListItem', () => {
  it('renders the people badge and empty collage when no recent assets', () => {
    render(SpaceListItem, props({ recentAssetIds: [] }));
    expect(screen.queryByTestId('space-row-badge')).not.toBeNull();
    expect(screen.queryByTestId('collage-empty')).not.toBeNull();
  });

  it('renders a 4-tile collage when 4 recent assets', () => {
    render(SpaceListItem, props({ recentAssetIds: ['1', '2', '3', '4'] }));
    expect(screen.queryByTestId('collage-grid')).not.toBeNull();
  });

  it('calls onSpaceClick when the row is clicked', async () => {
    const p = props({ recentAssetIds: [] });
    render(SpaceListItem, p);
    await fireEvent.click(screen.getByTestId('space-row'));
    expect(p.onSpaceClick).toHaveBeenCalledOnce();
  });

  it('shows a checkmark and calls onMultiSelect when multiSelected', async () => {
    const p = { ...props({ recentAssetIds: [] }), multiSelected: true };
    render(SpaceListItem, p);
    const checkbox = screen.getByRole('checkbox');
    await fireEvent.click(checkbox);
    expect(p.onMultiSelect).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/space-list-item.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3a: Create `long-press.ts`**

```ts
// long-press.ts
import type { Action } from 'svelte/action';

export const longPress: Action<HTMLElement, { onLongPress: () => void }> = (element, params) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let didPress = false;
  const preventContextMenu = (event: Event) => event.preventDefault();
  const disposeables: (() => void)[] = [];

  const clear = () => {
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    timer = null;
    for (const dispose of disposeables) {
      dispose();
    }
    disposeables.length = 0;
  };

  const start = () => {
    didPress = false;
    // 350ms long press (matches AlbumListItem).
    timer = setTimeout(() => {
      params.onLongPress();
      element.addEventListener('contextmenu', preventContextMenu, { once: true });
      disposeables.push(() => element.removeEventListener('contextmenu', preventContextMenu));
      didPress = true;
    }, 350);
  };

  const click = (event: MouseEvent) => {
    if (!didPress) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
  };

  element.addEventListener('click', click);
  element.addEventListener('pointerdown', start, true);
  element.addEventListener('pointerup', clear, { capture: true, passive: true });

  return {
    destroy: () => {
      element.removeEventListener('click', click);
      element.removeEventListener('pointerdown', start, true);
      element.removeEventListener('pointerup', clear, true);
    },
  };
};
```

- [ ] **Step 3b: Create `space-list-item.svelte`**

```svelte
<script lang="ts">
  import { longPress } from '$lib/actions/long-press';
  import { SCROLL_PROPERTIES } from '$lib/components/shared-components/album-selection/album-selection-utils';
  import SpaceCollage from '$lib/components/spaces/space-collage.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { normalizeSearchString } from '$lib/utils/string-utils';
  import type { SharedSpaceResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiAccountMultipleOutline, mdiCheckCircle } from '@mdi/js';
  import type { Action } from 'svelte/action';
  import { t } from 'svelte-i18n';

  interface Props {
    space: SharedSpaceResponseDto;
    searchQuery?: string;
    selected: boolean;
    multiSelected?: boolean;
    onSpaceClick: () => void;
    onMultiSelect: () => void;
  }

  let { space, searchQuery = '', selected = false, multiSelected = false, onSpaceClick, onMultiSelect }: Props = $props();

  const scrollIntoViewIfSelected: Action = (node) => {
    $effect(() => {
      if (selected) {
        node.scrollIntoView(SCROLL_PROPERTIES);
      }
    });
  };

  const nameParts: string[] = $derived.by(() => {
    const name = space.name;
    if (searchQuery.length === 0) {
      return [name, '', ''];
    }
    const index = normalizeSearchString(name).indexOf(normalizeSearchString(searchQuery));
    if (index === -1) {
      return [name, '', ''];
    }
    return [name.slice(0, index), name.slice(index, index + searchQuery.length), name.slice(index + searchQuery.length)];
  });

  const collageAssets = $derived((space.recentAssetIds ?? []).map((id) => ({ id, thumbhash: null })));

  let usingMobileDevice = $derived(mediaQueryManager.pointerCoarse);
  let mouseOver = $state(false);

  const handleMultiSelectClicked = (event?: MouseEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    onMultiSelect();
  };
</script>

<div
  role="group"
  class={[
    'relative flex w-full text-start justify-between transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl my-2 hover:cursor-pointer',
    { 'bg-primary/10 hover:bg-primary/10': multiSelected },
  ]}
  onmouseenter={() => {
    if (!usingMobileDevice) {
      mouseOver = true;
    }
  }}
  onmouseleave={() => (mouseOver = false)}
>
  <button
    type="button"
    onclick={onSpaceClick}
    use:scrollIntoViewIfSelected
    class="flex w-full gap-4 px-2 py-2 text-start"
    class:bg-gray-200={selected}
    class:dark:bg-gray-700={selected}
    use:longPress={{ onLongPress: () => handleMultiSelectClicked() }}
    data-testid="space-row"
  >
    <span class="relative h-16 w-16 shrink-0">
      <SpaceCollage assets={collageAssets} />
      <span
        class="absolute -bottom-1.5 -end-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-immich-bg ring-2 ring-immich-bg dark:bg-immich-dark-gray dark:ring-immich-dark-gray"
        data-testid="space-row-badge"
      >
        <Icon icon={mdiAccountMultipleOutline} size="0.9rem" class="text-pink-500" />
      </span>
    </span>
    <span class="flex h-full flex-col items-start justify-center overflow-hidden">
      <span class="w-full shrink overflow-hidden text-ellipsis whitespace-nowrap"
        >{nameParts[0]}<b>{nameParts[1]}</b>{nameParts[2]}</span
      >
      <span class="flex gap-2 text-sm" data-testid="space-row-details">
        {#if space.assetCount != null}
          <span>{$t('items_count', { values: { count: space.assetCount } })}</span>
        {/if}
        {#if space.assetCount != null && space.memberCount != null}
          <span>&middot;</span>
        {/if}
        {#if space.memberCount != null}
          <span>{space.memberCount} {$t('members')}</span>
        {/if}
      </span>
    </span>
  </button>

  {#if mouseOver || multiSelected}
    <button
      type="button"
      onclick={handleMultiSelectClicked}
      class="absolute end-0 top-4 p-3 focus:outline-none hover:cursor-pointer"
      role="checkbox"
      tabindex={-1}
      aria-checked={multiSelected}
    >
      <Icon icon={mdiCheckCircle} size="24" class={multiSelected ? 'text-primary' : 'text-gray-300 hover:text-primary/75'} />
    </button>
  {/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/space-list-item.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/actions/long-press.ts web/src/lib/components/shared-components/collection-selection/space-list-item.svelte web/src/lib/components/shared-components/collection-selection/space-list-item.spec.ts
git commit -m "feat(web): SpaceListItem row with badge, collage, multi-select"
```

---

### Task 7: NewSpaceListItem

**Files:**
- Create: `web/src/lib/components/shared-components/collection-selection/new-space-list-item.svelte`
- Test: `web/src/lib/components/shared-components/collection-selection/new-space-list-item.spec.ts`

**Interfaces:**
- Produces: `NewSpaceListItem` with props `{ searchQuery?: string; selected: boolean; onNewSpace: (name: string) => void }`. Renders `data-testid="new-space-row"`; the button is **disabled** unless `isValidNewSpaceName(searchQuery)`; on click it calls `onNewSpace(searchQuery.trim())`.

- [ ] **Step 1: Write the failing test**

```ts
// new-space-list-item.spec.ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NewSpaceListItem from './new-space-list-item.svelte';

describe('NewSpaceListItem', () => {
  it('is disabled with an empty name', () => {
    render(NewSpaceListItem, { searchQuery: '', selected: false, onNewSpace: vi.fn() });
    expect((screen.getByTestId('new-space-row') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is disabled when the name exceeds 100 chars', () => {
    render(NewSpaceListItem, { searchQuery: 'x'.repeat(101), selected: false, onNewSpace: vi.fn() });
    expect((screen.getByTestId('new-space-row') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is enabled and calls onNewSpace with the trimmed name', async () => {
    const onNewSpace = vi.fn();
    render(NewSpaceListItem, { searchQuery: '  Family  ', selected: false, onNewSpace });
    const button = screen.getByTestId('new-space-row') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await fireEvent.click(button);
    expect(onNewSpace).toHaveBeenCalledWith('Family');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/new-space-list-item.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<script lang="ts">
  import { SCROLL_PROPERTIES } from '$lib/components/shared-components/album-selection/album-selection-utils';
  import { isValidNewSpaceName } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
  import { Icon } from '@immich/ui';
  import { mdiPlus } from '@mdi/js';
  import type { Action } from 'svelte/action';
  import { t } from 'svelte-i18n';

  interface Props {
    searchQuery?: string;
    selected: boolean;
    onNewSpace: (name: string) => void;
  }

  let { searchQuery = '', selected = false, onNewSpace }: Props = $props();

  const disabled = $derived(!isValidNewSpaceName(searchQuery));
  const trimmed = $derived(searchQuery.trim());

  const scrollIntoViewIfSelected: Action = (node) => {
    $effect(() => {
      if (selected) {
        node.scrollIntoView(SCROLL_PROPERTIES);
      }
    });
  };
</script>

<button
  type="button"
  {disabled}
  onclick={() => {
    if (!disabled) {
      onNewSpace(trimmed);
    }
  }}
  use:scrollIntoViewIfSelected
  class="flex w-full items-center gap-4 px-6 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-gray-200 dark:enabled:hover:bg-gray-700"
  class:bg-gray-200={selected && !disabled}
  class:dark:bg-gray-700={selected && !disabled}
  data-testid="new-space-row"
>
  <div class="flex h-12 w-12 items-center justify-center">
    <Icon icon={mdiPlus} size="30" />
  </div>
  <p>
    {$t('new_space')}
    {#if trimmed.length > 0}<b>{trimmed}</b>{/if}
  </p>
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/components/shared-components/collection-selection/new-space-list-item.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/components/shared-components/collection-selection/new-space-list-item.svelte web/src/lib/components/shared-components/collection-selection/new-space-list-item.spec.ts
git commit -m "feat(web): NewSpaceListItem row with name validation"
```

---

### Task 8: CollectionPickerModal

**Files:**
- Create: `web/src/lib/modals/CollectionPickerModal.svelte`
- Test: `web/src/lib/modals/CollectionPickerModal.spec.ts`

**Interfaces:**
- Consumes: converter + helpers (Tasks 1–2), `AlbumListItem` (Task 5), `SpaceListItem` (Task 6), `NewSpaceListItem` (Task 7), `NewAlbumListItem`, SDK `getAllAlbums` / `getAllSpaces` / `createAlbum` / `createSpace`, `authManager`, `eventManager`, `handleError`.
- Produces: `CollectionPickerModal` with props `{ assetCount: number; onClose: (collections?: PickerCollection[]) => void }`. Selecting one collection calls `onClose([collection])`; multi-select submit calls `onClose([...])`; cancel calls `onClose()`. Wraps each item row in `data-testid={`row-${kind}-${id}`}`; over-cap renders `data-testid="spaces-hidden-notice"`.

- [ ] **Step 1: Write the failing test**

```ts
// CollectionPickerModal.spec.ts
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllAlbums = vi.fn();
const getAllSpaces = vi.fn();
const handleError = vi.fn();

vi.mock('@immich/sdk', async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    getAllAlbums: (...a: unknown[]) => getAllAlbums(...a),
    getAllSpaces: (...a: unknown[]) => getAllSpaces(...a),
    createAlbum: vi.fn(),
    createSpace: vi.fn(),
  };
});
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: { authenticated: true, user: { id: 'me' } } }));
vi.mock('$lib/utils/handle-error', () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

import CollectionPickerModal from './CollectionPickerModal.svelte';

const album = (id: string, name: string) => ({ id, albumName: name, assetCount: 1, albumThumbnailAssetId: null, shared: false, updatedAt: '2024-01-01T00:00:00Z' });
const space = (id: string, name: string) => ({ id, name, createdById: 'me', createdAt: '2024-01-01T00:00:00Z', members: [], memberCount: 1, assetCount: 1, recentAssetIds: [] });

beforeEach(() => {
  vi.clearAllMocks();
  getAllAlbums.mockResolvedValue([]); // both shared:false and shared:true resolve to []
  getAllSpaces.mockResolvedValue([]);
});

describe('CollectionPickerModal', () => {
  it('renders album rows (with badge) and space rows after load', async () => {
    getAllAlbums.mockImplementation(({ shared }: { shared: boolean }) => Promise.resolve(shared ? [] : [album('a1', 'Trip')]));
    getAllSpaces.mockResolvedValue([space('s1', 'Family')]);
    render(CollectionPickerModal, { assetCount: 3, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('row-album-a1')).toBeTruthy());
    expect(screen.getByTestId('row-space-s1')).toBeTruthy();
    expect(screen.queryByTestId('collection-row-badge')).not.toBeNull();
    expect(screen.queryByTestId('space-row-badge')).not.toBeNull();
  });

  it('clicking an album row confirms with that single collection', async () => {
    const onClose = vi.fn();
    getAllAlbums.mockImplementation(({ shared }: { shared: boolean }) => Promise.resolve(shared ? [] : [album('a1', 'Trip')]));
    render(CollectionPickerModal, { assetCount: 3, onClose });
    await waitFor(() => expect(screen.getByTestId('row-album-a1')).toBeTruthy());
    await fireEvent.click(screen.getByTestId('space-row') ?? screen.getByTestId('row-album-a1'));
    // click the album row's main button (AlbumListItem button inside row-album-a1)
    await fireEvent.click(screen.getByTestId('row-album-a1').querySelector('button')!);
    expect(onClose).toHaveBeenCalledWith([expect.objectContaining({ kind: 'album', id: 'a1' })]);
  });

  it('hides spaces and shows a notice when over the cap', async () => {
    getAllSpaces.mockResolvedValue([space('s1', 'Family')]);
    render(CollectionPickerModal, { assetCount: 10001, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('spaces-hidden-notice')).toBeTruthy());
    expect(screen.queryByTestId('row-space-s1')).toBeNull();
    expect(screen.queryByTestId('new-space-row')).toBeNull();
  });

  it('reports an error and still renders albums when spaces fail to load', async () => {
    getAllAlbums.mockImplementation(({ shared }: { shared: boolean }) => Promise.resolve(shared ? [] : [album('a1', 'Trip')]));
    getAllSpaces.mockRejectedValue(new Error('boom'));
    render(CollectionPickerModal, { assetCount: 3, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId('row-album-a1')).toBeTruthy());
    expect(handleError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/modals/CollectionPickerModal.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<script lang="ts">
  import { initInput } from '$lib/actions/focus';
  import AlbumListItem from '$lib/components/asset-viewer/album-list-item.svelte';
  import NewAlbumListItem from '$lib/components/shared-components/album-selection/new-album-list-item.svelte';
  import {
    albumToCollection,
    CollectionModalRowConverter,
    CollectionModalRowType,
    collectionKey,
    isSelectableRowType,
    isValidNewSpaceName,
    isWritableSpace,
    pickRecent,
    spaceToCollection,
    type PickerCollection,
  } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
  import NewSpaceListItem from '$lib/components/shared-components/collection-selection/new-space-list-item.svelte';
  import SpaceListItem from '$lib/components/shared-components/collection-selection/space-list-item.svelte';
  import { MAX_SPACE_ASSETS_PER_REQUEST } from '$lib/constants';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import {
    createAlbum,
    createSpace,
    getAllAlbums,
    getAllSpaces,
    type AlbumResponseDto,
    type SharedSpaceResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, Modal, ModalBody, ModalFooter, Text } from '@immich/ui';
  import { mdiImageMultipleOutline, mdiInformationOutline, mdiKeyboardReturn } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    assetCount: number;
    onClose: (collections?: PickerCollection[]) => void;
  }

  let { assetCount, onClose }: Props = $props();

  let albums = $state<AlbumResponseDto[]>([]);
  let spaces = $state<SharedSpaceResponseDto[]>([]);
  let loading = $state(true);
  let search = $state('');
  let selectedRowIndex = $state(-1);
  const multiSelectedKeys = $state<string[]>([]);
  const multiSelectActive = $derived(multiSelectedKeys.length > 0);

  const showSpaces = $derived(assetCount <= MAX_SPACE_ASSETS_PER_REQUEST);
  const currentUserId = $derived(authManager.authenticated ? (authManager.user?.id ?? null) : null);

  const albumCollections = $derived(albums.map(albumToCollection));
  const spaceCollections = $derived(
    showSpaces ? spaces.filter((space) => isWritableSpace(space, currentUserId)).map(spaceToCollection) : [],
  );
  const allCollections = $derived([...albumCollections, ...spaceCollections]);
  const recentCollections = $derived(pickRecent(allCollections, 3));

  const converter = new CollectionModalRowConverter();
  const rows = $derived(
    converter.toModalRows(search, recentCollections, allCollections, selectedRowIndex, multiSelectedKeys, { showSpaces }),
  );
  const selectableRowCount = $derived(rows.filter((row) => isSelectableRowType(row.type)).length);

  onMount(async () => {
    const [albumResult, spaceResult] = await Promise.allSettled([loadAlbums(), loadSpaces()]);
    if (albumResult.status === 'rejected') {
      handleError(albumResult.reason, $t('errors.unable_to_load_albums'));
    }
    if (spaceResult.status === 'rejected') {
      handleError(spaceResult.reason, $t('failed_to_load_spaces'));
    }
    loading = false;
  });

  const loadAlbums = async () => {
    const owned = await getAllAlbums({ shared: false });
    owned.push(...(await getAllAlbums({ shared: true })));
    albums = owned;
  };

  const loadSpaces = async () => {
    spaces = await getAllSpaces();
  };

  const findByKey = (key: string) => allCollections.find((collection) => collectionKey(collection) === key);

  const toggleMultiSelect = (collection?: PickerCollection) => {
    const target = collection ?? rows.find((row) => row.selected)?.collection;
    if (!target) {
      return;
    }
    const key = collectionKey(target);
    const index = multiSelectedKeys.indexOf(key);
    if (index === -1) {
      multiSelectedKeys.push(key);
    } else {
      multiSelectedKeys.splice(index, 1);
    }
  };

  const handleCollectionClick = (collection: PickerCollection) => {
    if (multiSelectActive) {
      toggleMultiSelect(collection);
      return;
    }
    onClose([collection]);
  };

  const submitMulti = () => {
    const selected = multiSelectedKeys
      .map(findByKey)
      .filter((collection): collection is PickerCollection => collection !== undefined);
    onClose(selected.length > 0 ? selected : undefined);
  };

  const onNewAlbum = async (name: string) => {
    try {
      const album = await createAlbum({ createAlbumDto: { albumName: name } });
      eventManager.emit('AlbumCreate', album);
      onClose([albumToCollection(album)]);
    } catch (error) {
      handleError(error, $t('errors.failed_to_create_album'));
    }
  };

  const onNewSpace = async (name: string) => {
    if (!isValidNewSpaceName(name)) {
      return;
    }
    try {
      const space = await createSpace({ sharedSpaceCreateDto: { name: name.trim() } });
      onClose([spaceToCollection(space)]);
    } catch (error) {
      handleError(error, $t('errors.failed_to_create_space'));
    }
  };

  const onEnter = async () => {
    const item = rows.find((row) => row.selected);
    if (!item) {
      return;
    }
    switch (item.type) {
      case CollectionModalRowType.NEW_ALBUM: {
        await onNewAlbum(search.trim());
        break;
      }
      case CollectionModalRowType.NEW_SPACE: {
        if (isValidNewSpaceName(search)) {
          await onNewSpace(search);
        }
        break;
      }
      case CollectionModalRowType.COLLECTION_ITEM: {
        if (multiSelectActive) {
          submitMulti();
        } else if (item.collection) {
          onClose([item.collection]);
        }
        break;
      }
    }
    selectedRowIndex = -1;
  };

  const onkeydown = async (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowUp': {
        event.preventDefault();
        selectedRowIndex = selectedRowIndex > 0 ? selectedRowIndex - 1 : selectableRowCount - 1;
        break;
      }
      case 'ArrowDown': {
        event.preventDefault();
        selectedRowIndex = selectedRowIndex < selectableRowCount - 1 ? selectedRowIndex + 1 : 0;
        break;
      }
      case 'Enter': {
        event.preventDefault();
        await onEnter();
        break;
      }
      case 'Control': {
        event.preventDefault();
        toggleMultiSelect();
        break;
      }
      default: {
        selectedRowIndex = -1;
      }
    }
  };
</script>

<Modal title={$t('add_to_album_or_space')} {onClose} size="medium">
  <ModalBody>
    <div class="mb-2 flex max-h-[36rem] flex-col">
      {#if loading}
        <!-- eslint-disable-next-line svelte/require-each-key -->
        {#each { length: 3 } as _}
          <div class="flex animate-pulse gap-4 px-6 py-2">
            <div class="h-12 w-12 rounded-xl bg-slate-200"></div>
            <div class="flex flex-col items-start justify-center gap-2">
              <span class="h-4 w-36 animate-pulse bg-slate-200"></span>
              <span class="h-3 w-20 animate-pulse bg-slate-200"></span>
            </div>
          </div>
        {/each}
      {:else}
        <input
          class="border-b-4 border-immich-bg px-6 py-2 text-2xl focus:border-immich-primary dark:border-immich-dark-gray dark:focus:border-immich-dark-primary"
          placeholder={$t('search')}
          {onkeydown}
          bind:value={search}
          use:initInput
        />
        {#if !showSpaces}
          <div
            class="flex items-center gap-2 px-6 py-2 text-sm text-gray-500 dark:text-gray-400"
            data-testid="spaces-hidden-notice"
          >
            <Icon icon={mdiInformationOutline} size="1rem" />
            <span>{$t('spaces_hidden_too_many_assets', { values: { count: MAX_SPACE_ASSETS_PER_REQUEST } })}</span>
          </div>
        {/if}
        <div class="immich-scrollbar overflow-y-auto">
          <!-- eslint-disable-next-line svelte/require-each-key -->
          {#each rows as row}
            {#if row.type === CollectionModalRowType.NEW_ALBUM}
              <NewAlbumListItem selected={row.selected || false} {onNewAlbum} searchQuery={search} />
            {:else if row.type === CollectionModalRowType.NEW_SPACE}
              <NewSpaceListItem selected={row.selected || false} {onNewSpace} searchQuery={search} />
            {:else if row.type === CollectionModalRowType.SECTION}
              <p class="px-5 py-3 text-xs">{row.text}</p>
            {:else if row.type === CollectionModalRowType.MESSAGE}
              <p class="px-5 py-1 text-sm">{row.text}</p>
            {:else if row.type === CollectionModalRowType.COLLECTION_ITEM && row.collection}
              {@const collection = row.collection}
              <div data-testid={`row-${collection.kind}-${collection.id}`}>
                {#if collection.kind === 'album'}
                  <AlbumListItem
                    album={collection.album}
                    selected={row.selected || false}
                    multiSelected={row.multiSelected}
                    searchQuery={search}
                    badgeIcon={mdiImageMultipleOutline}
                    onAlbumClick={() => handleCollectionClick(collection)}
                    onMultiSelect={() => toggleMultiSelect(collection)}
                  />
                {:else}
                  <SpaceListItem
                    space={collection.space}
                    selected={row.selected || false}
                    multiSelected={row.multiSelected}
                    searchQuery={search}
                    onSpaceClick={() => handleCollectionClick(collection)}
                    onMultiSelect={() => toggleMultiSelect(collection)}
                  />
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
    {#if multiSelectActive}
      <Button size="small" shape="round" fullWidth onclick={submitMulti}>
        {$t('add_to_collections_count', { values: { count: multiSelectedKeys.length } })}
      </Button>
    {/if}
  </ModalBody>
  <ModalFooter>
    <div class="flex justify-around w-full">
      <div class="flex gap-4">
        <div class="flex gap-1 place-items-center">
          <span class="bg-gray-300 dark:bg-gray-500 rounded p-1">
            <Icon icon={mdiKeyboardReturn} size="1rem" />
          </span>
          <Text size="tiny">{$t('to_select')}</Text>
        </div>
        <div class="flex gap-1 place-items-center">
          <span class="bg-gray-300 dark:bg-gray-500 rounded p-1">
            <Text size="tiny">CTRL</Text>
          </span>
          <Text size="tiny">{$t('to_multi_select')}</Text>
        </div>
      </div>
    </div>
  </ModalFooter>
</Modal>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/modals/CollectionPickerModal.spec.ts`
Expected: PASS. If `@immich/ui` `Modal` portal hides content from `screen`, query via `document.body` is still covered because testing-library searches the whole document; keep `waitFor` for the async load.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/modals/CollectionPickerModal.svelte web/src/lib/modals/CollectionPickerModal.spec.ts
git commit -m "feat(web): unified CollectionPickerModal"
```

---

### Task 9: AssetAddToCollectionModal wrapper

**Files:**
- Create: `web/src/lib/modals/AssetAddToCollectionModal.svelte`
- Test: `web/src/lib/modals/AssetAddToCollectionModal.spec.ts`

**Interfaces:**
- Consumes: `CollectionPickerModal` (Task 8), `addAssetsToCollections` (Task 4).
- Produces: `AssetAddToCollectionModal` with props `{ assetIds: string[]; onClose: () => void }`. Passes `assetCount={assetIds.length}`; on a non-empty selection, calls `addAssetsToCollections(collections, assetIds)` then `onClose()`; on cancel, calls `onClose()` only.

- [ ] **Step 1: Write the failing test**

```ts
// AssetAddToCollectionModal.spec.ts
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

const addAssetsToCollections = vi.fn().mockResolvedValue(undefined);
let captured: { assetCount: number; onClose: (c?: unknown[]) => void } | null = null;

vi.mock('$lib/services/collection.service', () => ({
  addAssetsToCollections: (...a: unknown[]) => addAssetsToCollections(...a),
}));
// Stub the heavy modal: capture props so we can drive onClose directly.
vi.mock('./CollectionPickerModal.svelte', () => ({
  default: function MockModal(_anchor: unknown, props: { assetCount: number; onClose: (c?: unknown[]) => void }) {
    captured = props;
    return {};
  },
}));

import AssetAddToCollectionModal from './AssetAddToCollectionModal.svelte';

describe('AssetAddToCollectionModal', () => {
  it('passes assetCount and dispatches on a non-empty selection', async () => {
    const onClose = vi.fn();
    render(AssetAddToCollectionModal, { assetIds: ['1', '2'], onClose });
    expect(captured!.assetCount).toBe(2);
    await captured!.onClose([{ kind: 'album', id: 'a1', name: 'A', album: { id: 'a1' } } as any]);
    expect(addAssetsToCollections).toHaveBeenCalledWith([expect.objectContaining({ id: 'a1' })], ['1', '2']);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('cancels without dispatching on empty selection', async () => {
    const onClose = vi.fn();
    render(AssetAddToCollectionModal, { assetIds: ['1'], onClose });
    await captured!.onClose(undefined);
    expect(addAssetsToCollections).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

> Note: if mocking the Svelte child component proves brittle in this repo's setup, fall back to a thinner test that imports the real `CollectionPickerModal` mock-free and asserts `addAssetsToCollections` wiring by exporting `handleClose` from a tiny `asset-add-to-collection.ts` helper and unit-testing that instead. Prefer the component test first.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/modals/AssetAddToCollectionModal.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<script lang="ts">
  import type { PickerCollection } from '$lib/components/shared-components/collection-selection/collection-selection-utils';
  import CollectionPickerModal from '$lib/modals/CollectionPickerModal.svelte';
  import { addAssetsToCollections } from '$lib/services/collection.service';

  type Props = {
    assetIds: string[];
    onClose: () => void;
  };

  const { assetIds, onClose }: Props = $props();

  const handleClose = async (collections?: PickerCollection[]) => {
    if (!collections || collections.length === 0) {
      onClose();
      return;
    }
    await addAssetsToCollections(collections, assetIds);
    onClose();
  };
</script>

<CollectionPickerModal assetCount={assetIds.length} onClose={handleClose} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test -- --run src/lib/modals/AssetAddToCollectionModal.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/modals/AssetAddToCollectionModal.svelte web/src/lib/modals/AssetAddToCollectionModal.spec.ts
git commit -m "feat(web): AssetAddToCollectionModal wrapper"
```

---

### Task 10: Repoint entry points + remove dead modals

**Files:**
- Modify: `web/src/lib/services/asset.service.ts`
- Modify: `web/src/lib/managers/selection-command-handlers.ts`
- Delete: `web/src/lib/modals/AssetAddToAlbumModal.svelte`, `web/src/lib/modals/AssetAddToSpaceModal.svelte` (only after the grep in Step 1 confirms no remaining importers)
- Test: `web/src/lib/services/asset.service.spec.ts` (add a focused test if the file exists; otherwise create it)

**Interfaces:**
- Consumes: `AssetAddToCollectionModal` (Task 9).
- Produces: timeline "+" and single-photo "Add to album" actions, and both command-palette handlers, open `AssetAddToCollectionModal`.

- [ ] **Step 1: Confirm no other importers of the old wrappers**

Run:
```bash
grep -rn "AssetAddToAlbumModal\|AssetAddToSpaceModal" web/src --include="*.svelte" --include="*.ts" | grep -v "\.spec\."
```
Expected: only `asset.service.ts` and `selection-command-handlers.ts` reference them. (If anything else does, leave the old wrapper file in place and only repoint these two.)

- [ ] **Step 2: Write the failing test** (`asset.service.spec.ts`)

```ts
import { describe, expect, it, vi } from 'vitest';

const show = vi.fn();
vi.mock('@immich/ui', async (orig) => ({ ...(await (orig as any)()), modalManager: { show: (...a: unknown[]) => show(...a) } }));
vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({
  assetMultiSelectManager: { assets: [{ id: 'x1' }, { id: 'x2' }] },
}));

import AssetAddToCollectionModal from '$lib/modals/AssetAddToCollectionModal.svelte';
import { getAssetBulkActions } from './asset.service';

describe('timeline add action', () => {
  it('opens the unified collection modal with selected asset ids', () => {
    const actions = getAssetBulkActions(((k: string) => k) as any);
    actions.AddToAlbum.onAction();
    expect(show).toHaveBeenCalledWith(AssetAddToCollectionModal, { assetIds: ['x1', 'x2'] });
  });
});
```

(If `getAssetBulkActions` is not exported, export it, or adapt the test to the existing export. Verify the actual export name before writing.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && pnpm test -- --run src/lib/services/asset.service.spec.ts`
Expected: FAIL — still opens `AssetAddToAlbumModal`.

- [ ] **Step 4: Repoint `asset.service.ts`**

Replace the import:
```ts
import AssetAddToAlbumModal from '$lib/modals/AssetAddToAlbumModal.svelte';
```
with:
```ts
import AssetAddToCollectionModal from '$lib/modals/AssetAddToCollectionModal.svelte';
```
In `getAssetBulkActions`, the `AddToAlbum` action — change title and modal (keep `icon: mdiPlus`, `shortcuts: [{ key: 'l' }]`, and the property name `AddToAlbum`):
```ts
  const AddToAlbum: ActionItem = {
    title: $t('add_to_album_or_space'),
    icon: mdiPlus,
    shortcuts: [{ key: 'l' }],
    onAction: () =>
      modalManager.show(AssetAddToCollectionModal, {
        assetIds: assetMultiSelectManager.assets.map((asset) => asset.id),
      }),
  };
```
In the single-asset `getAssetActions` (around line 167), change its `AddToAlbum`:
```ts
  const AddToAlbum: ActionItem = {
    title: $t('add_to_album_or_space'),
    icon: mdiPlus,
    onAction: () => modalManager.show(AssetAddToCollectionModal, { assetIds: [asset.id] }),
  };
```

- [ ] **Step 5: Repoint `selection-command-handlers.ts`**

Replace the two old imports:
```ts
import AssetAddToAlbumModal from '$lib/modals/AssetAddToAlbumModal.svelte';
import AssetAddToSpaceModal from '$lib/modals/AssetAddToSpaceModal.svelte';
```
with:
```ts
import AssetAddToCollectionModal from '$lib/modals/AssetAddToCollectionModal.svelte';
```
Point both handlers at the unified modal:
```ts
export function handleAddSelectedToAlbum(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection?.canAddToAlbum) {
    return;
  }
  return modalManager.show(AssetAddToCollectionModal, { assetIds: selection.selectedAssetIds });
}

export function handleAddSelectedToSpace(ctx?: CommandContext) {
  const selection = getSelection(ctx);
  if (!selection?.canAddToSpace) {
    return;
  }
  return modalManager.show(AssetAddToCollectionModal, { assetIds: selection.selectedAssetIds });
}
```
(`canAddSelectedToAlbum`, `canAddSelectedToSpace`, and `handleAddSelectedToCurrentSpace` are unchanged.)

- [ ] **Step 6: Run tests to verify they pass; delete dead modals**

Run: `cd web && pnpm test -- --run src/lib/services/asset.service.spec.ts`
Expected: PASS.
Then delete the now-unused wrappers (confirmed by Step 1):
```bash
git rm web/src/lib/modals/AssetAddToAlbumModal.svelte web/src/lib/modals/AssetAddToSpaceModal.svelte
```
Run: `cd web && pnpm check`
Expected: no type errors (confirms nothing still imports the deleted files).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/services/asset.service.ts web/src/lib/managers/selection-command-handlers.ts web/src/lib/services/asset.service.spec.ts
git commit -m "feat(web): open unified collection picker from timeline, viewer, and command palette"
```

---

### Task 11: E2E (Playwright web)

**Files:**
- Create: `e2e/src/web/specs/timeline-add-to-collection.e2e-spec.ts` (match the directory/naming of existing web specs — verify with `ls e2e/src/web/specs` first)

**Interfaces:**
- Consumes: the full running stack (`make e2e` env). Reuses existing e2e auth/upload helpers (inspect a sibling spec for the login + asset-upload utilities and the `data-testid` selectors the app exposes).

- [ ] **Step 1: Inspect existing web specs for helpers and patterns**

Run: `ls e2e/src/web/specs && sed -n '1,60p' e2e/src/web/specs/*.ts | head -120`
Note the login fixture, how assets are seeded/uploaded, and how multi-select + the action bar are driven.

- [ ] **Step 2: Write the failing e2e test**

Author a spec that, against a seeded library with at least one album and one space (create them via API in `beforeAll` using the SDK/REST helpers the other specs use):
1. Logs in, opens the timeline, multi-selects 2 photos.
2. Clicks the "+" ("Add to album or space") action; asserts the modal shows both an album row (`collection-row-badge`) and a space row (`space-row-badge`).
3. Clicks the album row; asserts the success toast; via API asserts the 2 assets are now in that album.
4. Re-selects, opens the modal, `Ctrl`+clicks one album and one space, clicks "Add to 2"; via API asserts both the album and the space received the assets.
5. Opens a single photo in the viewer, clicks its "+", asserts the same unified modal opens (`add_to_album_or_space` title / both badges).

Use the seeded same-name album+space to assert both rows render distinctly (both badges visible in one filtered search).

- [ ] **Step 3: Run it to verify it fails (feature wired but assertions exercise it end-to-end)**

Run: `make e2e-web-dev` (against a running `make dev` stack) or the repo's standard `cd e2e && pnpm test:web -- timeline-add-to-collection`.
Expected: the new spec runs; fix selectors until green.

- [ ] **Step 4: Run to verify it passes**

Run: same as Step 3.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/src/web/specs/timeline-add-to-collection.e2e-spec.ts
git commit -m "test(e2e): unified timeline add-to-album-or-space flow"
```

---

### Task 12: Final verification gate

**Files:** none (verification only), plus prettier on the two docs.

- [ ] **Step 1: Full web unit suite**

Run: `cd web && pnpm test -- --run`
Expected: all green, including the new specs.

- [ ] **Step 2: Type + svelte check**

Run: `cd web && pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Lint (single deferred full pass)**

Run: `make lint-web`
Expected: 0 warnings (zero-warning policy). Fix any import-order / unused-import issues from the deleted modals.

- [ ] **Step 4: Prettier the design + plan docs (strict CI Docs Build)**

Run: `cd web && npx prettier --write ../docs/plans/2026-06-16-timeline-add-to-space-picker-design.md ../docs/plans/2026-06-16-timeline-add-to-space-picker-plan.md`
Expected: formatted (no diff on re-run).

- [ ] **Step 5: Confirm no dead references**

Run:
```bash
grep -rn "AssetAddToAlbumModal\|AssetAddToSpaceModal" web/src && echo "FOUND (fix)" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(web): final gate — tests, check, lint, docs format for collection picker"
```

---

## Self-Review

**Spec coverage** — each spec section maps to a task:

- Visual badge differentiation → Task 5 (album badge) + Task 6 (space badge/collage), rendered by Task 8.
- "+ New Album" / "+ New Space" → Task 7 + reuse of `NewAlbumListItem` in Task 8; empty/over-100 guard → Task 1 (`isValidNewSpaceName`) + Task 7.
- RECENT interleaved by recency + ALL alphabetical → Task 1 (`recencyOf`, `pickRecent`, `sortByNameAsc`) + Task 2 (converter).
- Unified `normalizeSearchString` search → Task 1 (`matchesSearch`) + Task 2.
- Cross-type Ctrl multi-select + "Add to N" → Task 8 (`toggleMultiSelect`, `submitMulti`) keyed by `collectionKey` (Task 1).
- Bigger modal (`size="medium"`, taller list) → Task 8.
- Writable-spaces filter → Task 1 (`isWritableSpace`) + Task 8.
- Single-target rich toasts + mixed aggregate + success-only events → Task 4.
- Over-cap hides spaces + notice → Task 2 (`showSpaces` option) + Task 8 (notice) + Task 4 (defensive skip).
- Both-settled loading + degrade on one failure → Task 8 (`Promise.allSettled` + `handleError`).
- Repoint timeline "+", single-photo viewer, both palette commands → Task 10.
- i18n en/de/fr → Task 3.
- Test coverage (converter, dispatch, components, modal, e2e) → Tasks 1,2,4,5,6,7,8,9,11.

**Placeholder scan** — every code step shows full code; no "TBD"/"handle errors"/"similar to". The only deliberately-open items are the e2e selectors (Task 11) and the optional fallback in Task 9, both with concrete inspection commands.

**Type consistency** — `PickerCollection`, `collectionKey`, `CollectionModalRowType`, `isSelectableRowType`, `isValidNewSpaceName`, `addAssetsToCollections(collections, assetIds)`, `CollectionPickerModal({ assetCount, onClose })`, `AssetAddToCollectionModal({ assetIds, onClose })`, `SpaceListItem`/`NewSpaceListItem` prop shapes, and `AlbumListItem` `badgeIcon` are used identically across Tasks 1–10.

## Execution Handoff

Two execution options after review:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with two-stage review between tasks (`superpowers:subagent-driven-development`).
2. **Inline Execution** — batch execution with checkpoints in this session (`superpowers:executing-plans`).
