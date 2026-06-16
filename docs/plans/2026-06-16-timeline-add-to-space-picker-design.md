# Unified album + space picker from the timeline

**Date:** 2026-06-16
**Status:** Approved design — ready for implementation plan
**Area:** `web/` (frontend only — no server, SDK, or DB changes)

## Problem

When a user selects photos in the timeline and presses the **"+"** ("Add to album")
button, the picker lists **albums only**. Shared spaces — a first-class,
fork-only way to collect photos — are reachable only through the command palette
or a space's own page. Users who think of a space as "just another place to put
photos" can't add to one from the place they most naturally would.

We want the timeline picker (and the equivalent single-photo action) to show
**albums and spaces in one list**, with a clear visual differentiator so that an
album and a space with the same name are never confused.

## Goals

- One picker lists both albums and writable spaces, searchable together.
- A per-row visual differentiator (badge on the thumbnail) distinguishes albums
  from spaces — robust even for identically-named items.
- Preserve **everything** the album picker does today: search, "Recent"
  section, inline "New album" creation, `Ctrl`-click multi-select, keyboard
  navigation, and the keyboard-hint footer.
- Add inline **"New space"** creation alongside "New album".
- `Ctrl`-click multi-select works **across types** — any mix of albums and
  spaces added in one action.
- A larger modal so more rows are visible without scrolling.

## Non-goals

- No backend, SDK, or schema changes. Adding assets to spaces
  (`POST /shared-spaces/:id/assets`) and to albums already exist and are reused
  as-is.
- No change to how spaces are created in full (members, color, libraries). Inline
  "New space" creates a name-only space; richer setup stays on the space page.
- No change to the space detail page's own "Add photos to this space" flow.
- No mobile (Flutter) changes — this is the web timeline picker only.

## Current behavior (what exists today)

**Albums (upstream Immich files):**

- Timeline "+" → `getAssetBulkActions` `AddToAlbum` action
  (`web/src/lib/services/asset.service.ts:65`, shortcut `l`, icon `mdiPlus`) →
  opens `AssetAddToAlbumModal`.
- Single-photo viewer → a second `AddToAlbum` action in the same file
  (`asset.service.ts:167`, used at `:321`) → same modal with one asset id.
- `AssetAddToAlbumModal.svelte` wraps `AlbumPickerModal.svelte` and, on close,
  calls `addAssetsToAlbums(albumIds, assetIds, { notify })`
  (`web/src/lib/services/album.service.ts:95`).
- `AlbumPickerModal.svelte` loads `getAllAlbums({shared:false})` +
  `getAllAlbums({shared:true})`, builds rows via `AlbumModalRowConverter`
  (`web/src/lib/components/shared-components/album-selection/album-selection-utils.ts`),
  renders `NewAlbumListItem` + `AlbumListItem`, supports `Ctrl` multi-select,
  arrow/enter keyboard nav, and a `size="small"` modal with `max-h-100` list.
- `addAssetsToAlbums` calls `addAssetsToAlbum` for a single album (per-asset
  `BulkIdResponseDto`, distinguishes duplicates) or `addAssetsToAlbums` for many,
  toasts a summary with a "View album" button, and emits `AlbumAddAssets`.

**Spaces (fork-only files):**

- `SpacePickerModal.svelte` loads `getAllSpaces()`, filters to **writable**
  (Owner/Editor) spaces, simple search + keyboard nav, returns one space.
- `AssetAddToSpaceModal.svelte` wraps it and calls
  `addAssetsToSpace(spaceId, assetIds, { notify })`
  (`web/src/lib/services/space.service.ts:10`) → `addAssets` SDK →
  toasts with a "View space" button and emits `SpaceAddAssets`.
- Surfaced only via the command palette `handleAddSelectedToSpace`
  (`web/src/lib/managers/selection-command-handlers.ts:66`) and on space pages.
- `MAX_SPACE_ASSETS_PER_REQUEST = 10_000` (`web/src/lib/constants.ts:77`).
- `SharedSpaceResponseDto` carries everything the row needs: `name`, `color`,
  `recentAssetThumbhashes` / `recentAssetIds` (for the collage cover),
  `memberCount`, `assetCount`, `lastActivityAt`, `members`, `createdById`.

So the data path for both is complete. This feature is a **frontend
presentation merge**, not new plumbing.

## Design

### Visual (approved mockup)

A single modal titled **"Add to album or space"**:

```
┌───────────────────────────────────────────┐
│ ◐ Add to album or space                  ✕ │
├───────────────────────────────────────────┤
│  Search                                     │   ← search input (existing style)
│                                             │
│  +  New Album                               │   ← create rows, both always shown
│  +  New Space                               │
│                                             │
│  RECENT                                     │   ← hidden when searching
│  [img]⊞ USA Trip            216 items       │   ← album: blue photo-stack badge
│  [img]⊞ Sicily trip 2024    1,085 items     │
│  [▦▦]◔ Family Trip   4 members · 320 items  │   ← space: pink people badge + collage
│                                             │
│  ALL                                        │
│  … alphabetical, albums + spaces …          │
├───────────────────────────────────────────┤
│  [Add to 2]   (shown only when multi-select)│
│  ↵ to select      CTRL to multi-select      │   ← footer hint (existing)
└───────────────────────────────────────────┘
```

- **Album rows** carry a small blue photo-stack badge on the bottom corner of
  their (single) thumbnail and read `N items` (today's `AlbumListItem`).
- **Space rows** carry a small pink people badge and a 4-tile collage cover
  built from `recentAssetThumbhashes`; subtitle reads
  `N members · N items` (or just `N members` when the count is unknown).
- The badge is always visible (survives search), so a same-name
  "Tuscany 2024" album/space pair is unambiguous at a glance.
- Modal grows from `size="small"` to `size="medium"` and the list container's
  `max-h-100` is raised so more rows show before scrolling.

### Architecture — keep spaces logic in fork-only files

The album picker, its row item, its row-converter, and `album.service.ts` are
**upstream Immich** files; spaces are **fork-only**. To keep the upstream rebase
path clean (per `CLAUDE.md`), we do **not** rewrite the upstream album picker to
know about spaces. Instead we add a thin fork-only **collection** layer that
composes the existing pieces.

New fork-only files (`web/src/lib/...`):

| File | Responsibility |
| --- | --- |
| `modals/CollectionPickerModal.svelte` | The unified modal: loads albums + writable spaces, builds rows, renders create rows + collection rows, owns search / multi-select / keyboard nav, larger size. Returns the chosen collection(s). |
| `modals/AssetAddToCollectionModal.svelte` | Wrapper: receives `assetIds`, shows `CollectionPickerModal`, on close splits the selection by type and dispatches adds (see below). Replaces both `AssetAddToAlbumModal` and `AssetAddToSpaceModal` as the entry-point modal. |
| `components/.../collection-selection/collection-selection-utils.ts` | `CollectionModalRowConverter` + types: the fork analogue of `AlbumModalRowConverter`, producing a unified row list (create rows, RECENT, ALL, messages) over a discriminated `PickerCollection` union. |
| `components/.../collection-selection/space-list-item.svelte` | Space row: collage cover (thumbhashes) + name (with search highlight) + `members · items` subtitle + multi-select checkmark, mirroring `AlbumListItem`'s interaction affordances. |

Reused as-is or near-as-is:

- `NewAlbumListItem` (the "+ New Album" row) — reused unchanged. A sibling
  **`NewSpaceListItem`** (or a `kind` prop on a generalized component) renders
  "+ New Space"; it is a trivial copy differing only in label/handler.
- `AlbumListItem` renders album rows. To place the **badge on the album
  thumbnail**, add a single **optional, additive** prop (e.g. `badgeIcon?:
  string`) defaulted to undefined so existing upstream callers are unaffected.
  This is the one small upstream touch; the alternative (a fully duplicated
  fork album-row component) avoids it entirely at the cost of duplicating the
  longpress / search-highlight / checkmark logic. **Recommendation: the additive
  prop** — smallest rebase footprint, no logic duplication. The implementation
  plan should confirm the prop threads cleanly through `AlbumListItemDetails`.
- `addAssetsToAlbums` (album.service) and `addAssetsToSpace` (space.service)
  are the add primitives — unchanged.

The discriminated union the fork layer works in:

```ts
type PickerCollection =
  | { kind: 'album'; id: string; name: string; album: AlbumResponseDto }
  | { kind: 'space'; id: string; name: string; space: SharedSpaceResponseDto };
```

### Data loading

On mount, in parallel:

- Albums: `getAllAlbums({shared:false})` + `getAllAlbums({shared:true})` (as today).
- Spaces: `getAllSpaces()`, then filter to **writable** spaces using the same
  Owner/Editor predicate `SpacePickerModal` uses today (`createdById === me` or
  member role ∈ {Owner, Editor}).

A failure loading one type degrades gracefully: show the other, surface a
non-blocking error toast for the failed one (reuse `failed_to_load_spaces`).

### Row order

- **Create rows** "New Album" then "New Space" are pinned at the top, always.
- **RECENT** (only when search is empty): the 3 most-recently-active collections
  across both types, by `album.updatedAt` vs `space.lastActivityAt` (falling back
  to the space's `updatedAt`/`createdAt` when null). Mirrors today's 3-item recent
  albums, now interleaved.
- **ALL** (`ALL` when no search, results when searching): albums + writable
  spaces merged, sorted **case-insensitively by name ascending**. Alphabetical
  ordering is a deliberate choice: it is predictable and places same-name
  album/space pairs adjacent, showcasing the badge differentiator. (Today's
  album-only sort preference does not generalize cleanly to a mixed list; RECENT
  already covers recency.)
- When searching, both create rows become "New Album **<query>**" / "New Space
  **<query>**" exactly as the album row does today.
- Empty states: no matches → message "No albums or spaces with that name"; truly
  empty library → message but create rows still present.

### Selection, multi-select, and keyboard

Generalize the existing `AlbumPickerModal` interaction model:

- Selectable rows = New Album, New Space, and every collection row.
- Plain click on a collection (no multi-select active) → confirm immediately with
  that one collection.
- `Ctrl`-click (or longpress on touch) toggles a collection into the multi-select
  set, keyed by `{kind, id}`. The set may freely mix albums and spaces.
- While multi-select is active, an **"Add to {count}"** button appears (replacing
  today's "Add to albums ({count})"); clicking it confirms the whole set.
- Arrow up/down move a focus index across selectable rows; `Enter` confirms the
  focused row (or submits the multi-select set if active); `Ctrl` toggles the
  focused row — same shape as today, extended to the unified row list.
- Footer hint ("↵ to select · CTRL to multi-select") is preserved.

### Add dispatch (the wrapper)

`AssetAddToCollectionModal` receives the chosen `PickerCollection[]` and splits
into `albumIds` and `spaceIds`, then:

- **Exactly one album** → `addAssetsToAlbums([albumId], assetIds, {notify:true})`
  — preserves today's rich per-asset toast with duplicate handling + "View album".
- **Exactly one space** → `addAssetsToSpace(spaceId, assetIds, {notify:true})`
  — preserves today's toast + "View space".
- **Any multi / mixed selection** → call each primitive with `{notify:false}`,
  `await` all, then show **one aggregate toast** "Added to {count} collections"
  (new key) summarizing success; on partial failure show a warning summarizing
  how many succeeded. Each primitive still emits its existing event
  (`AlbumAddAssets` / `SpaceAddAssets`) so the rest of the UI stays reactive.

This keeps the familiar single-target experience and adds a coherent summary for
the new mixed case, rather than firing N separate toasts.

Guard: spaces cap adds at `MAX_SPACE_ASSETS_PER_REQUEST` (10,000). The selection
count from the timeline is the same set for all targets; if it exceeds the cap,
disable/skip space targets with a brief explanation (albums have no equivalent
cap). In practice the timeline rarely selects 10k+, but the guard must exist.

### Entry points to repoint

1. `asset.service.ts:65` (`getAssetBulkActions` `AddToAlbum`, timeline "+") →
   open `AssetAddToCollectionModal`. Keep icon `mdiPlus`, shortcut `l`. The
   action/title may be renamed to "Add to album or space".
2. `asset.service.ts:167` / `:321` (single-photo viewer `AddToAlbum`) →
   `AssetAddToCollectionModal` with the single asset id.
3. Command palette (`selection-command-handlers.ts`): point
   `handleAddSelectedToAlbum` **and** `handleAddSelectedToSpace` at
   `AssetAddToCollectionModal`, so searching either "album" or "space" opens the
   unified picker. `canAddSelectedToAlbum` / `canAddSelectedToSpace` predicates
   and the separate "add to current space" command are unchanged.

`AssetAddToAlbumModal` and `AssetAddToSpaceModal` become unused by these paths;
leave them in place only if some other caller still needs them (a grep at
implementation time confirms — current greps show no other callers), otherwise
remove to avoid dead code.

### i18n

New keys (add to `i18n/en.json`; because these are **fork-only** strings, also
add **German and French** translations per project convention):

- `add_to_album_or_space` → "Add to album or space" (modal + action title)
- `new_space` → "New Space"
- `add_to_collections_count` → "Add to {count}" (multi-submit button)
- `added_to_collections_count` → "Added to {count, plural, one {# collection} other {# collections}}"
- `no_albums_or_spaces_with_name` → "No albums or spaces with that name"

Reuse existing keys where possible: `new_album`, `recent`, `all_albums`/`albums`
(or new combined section labels if clearer), `to_select`, `to_multi_select`,
`view_space`, `view_album`, `failed_to_load_spaces`,
`spaces_no_writable_spaces`.

## Error handling & edge cases

- Space or album load failure → degrade to the other list + error toast.
- User has no writable spaces → list shows albums only; "New Space" row remains
  so they can create their first space (which then receives the assets).
- Duplicate assets already in an album → existing duplicate-aware toast for the
  single-album path; aggregate path counts them as success (no error).
- Selection exceeds the space cap → space targets disabled with explanation;
  album targets unaffected.
- Inline "New Space" creates the space, then the same add dispatch runs against
  it (consistent with "New Album" today).

## Testing

- **Unit (`web`, vitest):** `CollectionModalRowConverter` — create rows always
  present; RECENT interleaving + 3-item cap; alphabetical ALL ordering; search
  filtering across both types; same-name pair both appear with correct `kind`;
  empty/no-match messages.
- **Unit:** add-dispatch split logic — single album, single space, mixed multi;
  notify behavior (rich single vs aggregate); space-cap guard.
- **Component:** `CollectionPickerModal` renders album badge vs space
  badge/collage; `Ctrl` toggles multi-select across types; keyboard nav across
  the unified list; "Add to {count}" appears/acts.
- **Manual / e2e (optional):** from the timeline, select photos → "+" → add to an
  album, to a space, and to a mixed multi-selection; verify toasts, that assets
  land in both, and the same-name case is visually distinct.

## Approaches considered

- **Evolve the upstream album picker in place** to also handle spaces. Rejected:
  heavy edits to upstream `AlbumPickerModal` / `AlbumListItem` /
  `album-selection-utils` / `album.service` create recurring rebase conflicts and
  leak fork-only concepts into upstream files.
- **Grouped sections (Albums / Spaces headers) instead of badges.** Rejected by
  the user during brainstorming: a mixed search result shows both headers and the
  per-row identity is what matters for same-name collisions. Badges win;
  grouping can be revisited as a future enhancement.
- **Fork-only collection layer composing existing pieces** (chosen): isolates
  fork code, reuses album-row interaction logic, one tiny additive upstream prop.

## Out of scope / future

- Sorting controls for the unified "ALL" list (respecting per-type sort prefs).
- Showing read-only spaces (greyed, non-selectable) for discoverability.
- Mobile parity (Flutter) for the unified picker.
