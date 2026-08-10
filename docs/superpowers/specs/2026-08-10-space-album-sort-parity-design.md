# Shared-space album sort parity between web and mobile

**Issue:** [#966](https://github.com/open-noodle/gallery/issues/966) — _Album sorting options in Shared Space are inconsistent between Web and Mobile_
**Date:** 2026-08-10
**Status:** approved, ready for implementation

## Problem

The sort options offered for a shared space's linked-album list differ per platform:

| Web (6)           | Mobile (4)       |
| ----------------- | ---------------- |
| Title             | Name             |
| Number of items   | Photo count      |
| Date modified     | Recently updated |
| Date created      | Recently linked  |
| Most recent photo | —                |
| Oldest photo      | —                |

Two of those apparent differences are cosmetic: mobile's _Name_ is web's _Title_ (`albumName`), and mobile's
_Recently updated_ is web's _Date modified_ (`updatedAt`). The genuine gaps are that mobile lacks the three
date-based sorts, and web lacks _Recently linked_.

The platforms also open on different defaults — web on _Most recent photo_, mobile on _Recently linked_.

## Decisions

1. **Unify on the union of seven options** (web's six plus _Recently linked_). Nobody loses a capability, and
   _Recently linked_ answers a question specific to a shared space — "what did someone just add here?" — that no
   other sort answers.
2. **Both platforms default to _Recently linked_, descending.** This is the most useful opening order for a
   collaborative surface. Web changes its default; mobile's is already this.
3. **No server change.** `GET /shared-spaces/{id}/albums` already returns every field required
   (`server/src/dtos/shared-space.dto.ts:167` — `AlbumResponseSchema` minus `albumUsers`, plus `ownerId`,
   `showInTimeline`, `addedById`, `linkedAt`).
4. **No new i18n strings.** All seven label keys already exist in every locale.
5. **Upstream files stay byte-clean.** Web's new option lives in a fork-only layer, not in upstream's
   `AlbumSortBy` enum. See "Why not extend the upstream enum" below.
6. **Mobile derives photo dates locally** from the Drift query that already runs, rather than switching the
   surface to REST. This preserves offline and reactive behaviour.

## The unified sort contract

Seven options, identical order, identical labels, identical default direction on both platforms.

| #   | Web id            | Dart identifier   | i18n key               | Default dir | Web field    | Mobile source                      |
| --- | ----------------- | ----------------- | ---------------------- | ----------- | ------------ | ---------------------------------- |
| 1   | `Title`           | `name`            | `sort_title`           | Asc         | `albumName`  | `meta.name`                        |
| 2   | `ItemCount`       | `photoCount`      | `sort_items`           | Desc        | `assetCount` | `count(asset.id)`                  |
| 3   | `DateModified`    | `recentlyUpdated` | `sort_modified`        | Desc        | `updatedAt`  | `meta.updatedAt`                   |
| 4   | `DateCreated`     | `dateCreated`     | `sort_created`         | Desc        | `createdAt`  | `meta.createdAt` _(new)_           |
| 5   | `MostRecentPhoto` | `mostRecentPhoto` | `sort_recent`          | Desc        | `endDate`    | `max(asset.localDateTime)` _(new)_ |
| 6   | `OldestPhoto`     | `oldestPhoto`     | `sort_oldest`          | Desc        | `startDate`  | `min(asset.localDateTime)` _(new)_ |
| 7   | `RecentlyLinked`  | `recentlyLinked`  | `sort_recently_linked` | Desc        | `linkedAt`   | `link.createdAt`                   |

**Default: `RecentlyLinked` / descending, both platforms.**

### Dart identifiers are load-bearing — do not rename them

`SettingsKey.spaceAlbumsSortMode` persists through `EnumCodec`
(`mobile/lib/domain/models/value_codec.dart:45`), which encodes `value.name` and decodes with:

```dart
T decode(String raw) => values.firstWhere((v) => v.name == raw);
```

`firstWhere` has **no `orElse`**, and no layer between it and app startup catches the throw:
`CachedKeyValueRepository._build` (`cached_key_value_repository.dart:26`) calls it unguarded, `refresh()` is
awaited inside `SettingsRepository.ensureInitialized`. An unrecognised stored value therefore throws
`StateError` during startup rather than falling back to a default.

Consequences:

- Renaming `name` → `title` or `recentlyUpdated` → `dateModified` would crash on launch for every user who had
  selected that option. **Only the labels change; the identifiers stay.** `name` therefore renders "Title" and
  `recentlyUpdated` renders "Date modified"; both get an explanatory comment.
- Adding `dateCreated` / `mostRecentPhoto` / `oldestPhoto` creates a **downgrade** crash: a user who selects one
  and then installs an older build (RC rollback, PR RC images, TestFlight rollback) hits the same unguarded
  `firstWhere`. This risk is introduced by this change, so hardening `EnumCodec.decode` to fall back instead of
  throwing is in scope — see slice M0.

`storeIndex` on these enums is vestigial for `SpaceAlbumSortMode` (only the legacy `AlbumSortMode` consults it,
in `mobile/lib/utils/migration.dart:151`), so menu order can change freely.

### Unused keys left in place

`sort_photo_count` and `sort_recently_updated` become unreferenced. They are deliberately **not** deleted:
removing them cleanly would mean editing ~90 locale files, and `CLAUDE.md` states the ~80 translator-owned
locales must not be hand-edited. Unused keys are inert.

## Behaviour specification

Written as scenarios so each maps to one test. "Album list" means a shared space's linked-album list on either
platform.

### Ordering

- **S1 — Title ascending.** _Given_ albums "beach", "Apple", "Zoo"; _when_ sorted by Title ascending; _then_ the
  order is Apple, beach, Zoo. Comparison is case-insensitive.
- **S2 — Direction flips.** _Given_ any option; _when_ the same option is re-selected; _then_ the direction
  inverts and the order reverses.
- **S3 — Selecting a new option applies its default direction.** _Given_ sort is Title (asc); _when_ the user
  picks Number of items; _then_ direction becomes descending, not ascending.
- **S4 — Number of items.** Orders by asset count.
- **S5 — Date modified.** Orders by the album's `updatedAt`.
- **S6 — Date created.** Orders by the album's `createdAt`, which is distinct from `linkedAt`.
- **S7 — Most recent photo.** Orders by the newest photo in the album.
- **S8 — Oldest photo.** Orders by the oldest photo in the album.
- **S9 — Recently linked.** Orders by when the album was linked into _this_ space, which is distinct from the
  album's own `createdAt`. An album created long ago but linked today sorts first descending.

### Albums with no photo dates

Upstream's `sortUnknownYearAlbums` (`web/src/lib/utils/album-utils.ts:211`) pushes albums with no `endDate` to
the end **irrespective of sort direction**, and it is applied to both photo-date sorts — including
`OldestPhoto`, which orders by `startDate` but null-checks `endDate`. Web inherits this unchanged because the
fork layer delegates to it. Mobile must reproduce it.

- **S10 — Empty albums sort last, descending.** _Given_ one album with photos and one with none; _when_ sorted
  by Most recent photo descending; _then_ the empty album is last.
- **S11 — Empty albums sort last, ascending too.** Same setup, ascending; the empty album is _still_ last.
- **S12 — Same rule for Oldest photo**, both directions.
- **S13 — Null `localDateTime` counts as no date.** `remote_asset.localDateTime` is nullable
  (`remote_asset.entity.dart:39`), so `MIN`/`MAX` can be null even for an album that has assets. Such an album
  is treated exactly like an empty one for S10–S12, and its asset count is unaffected.

### Tiebreaks

- **S14 — Mobile tiebreak is deterministic.** Equal sort keys tie-break by name, then id. Preserved from the
  current implementation.
- Web's tiebreak is input (server) order, because lodash `orderBy` and `Array.sort` are stable. This difference
  is accepted: the option sets and primary ordering match, which is what #966 asks for. Matching mobile would
  require post-sorting the six delegated options and changing web behaviour for no user-visible benefit.

### Accepted divergences

These are pre-existing, unchanged by this work, and recorded so they are informed omissions rather than
oversights:

- **Title collation.** Web sorts titles with `albumName.localeCompare(other, locale)` (`album-utils.ts:229`),
  which is locale-aware; mobile uses `toLowerCase().compareTo()` (`collection_sort.dart:45`), which is code-unit
  order. The two agree on ASCII but can disagree on diacritics and non-Latin scripts. Dart has no built-in
  locale collator, so closing this would mean pulling in a collation dependency — out of proportion to a sort
  label parity fix.
- **Search scope.** Web's filter matches album name **or description** (`space-albums-list.svelte:49`); mobile's
  matches name only (`collection_sort.dart:42`). #966 is about sort options; this is filed separately rather
  than folded in.
- **Photo-date corpus.** Web's `startDate`/`endDate` are server-computed over all album assets; mobile's are
  derived from locally synced assets. See "Mobile design".

### Filtering

- **S15 — Search filters before sorting** and is case-insensitive, trimmed, literal-substring, with no
  diacritic folding. Unchanged behaviour; asserted to prevent regression.

### Selection, persistence, defaults

- **S16 — Fresh install opens on Recently linked, descending.**
- **S17 — A stored preference wins over the new default.**
- **S18 — A stored preference from before this change still loads.** A device with `recentlyUpdated` or
  `photoCount` persisted must load without error and show the relabelled option.
- **S19 — An unrecognised stored value falls back to the default instead of throwing** (slice M0).

### Grouping (web only)

- **S20 — Year grouping is disabled for Recently linked.** Year buckets albums by photo date
  (`space-album-grouping.ts:154`), so pairing it with a link-date sort is as incoherent as with Date created or
  Date modified, which are already disabled (`space-album-grouping.ts:40`).
- **S21 — Grouped lists sort within each group** using the same comparator, including Recently linked.
- **S22 — No user gets stuck in a disabled combination.** `svelte-persisted-store` writes the whole settings
  object whenever any field changes, so anyone who had set `groupBy: Year` already has their `sortBy` persisted
  alongside it and keeps it. Only users who never touched any space-album view setting receive the new default,
  and those have `groupBy: None`.

## Web design

### Why not extend the upstream enum

Adding `RecentlyLinked` to `AlbumSortBy` and `sortOptionsMetadata` would be less code, but
`web/src/routes/(user)/albums/AlbumsControls.svelte:104` iterates that same metadata array. The option would
appear on the regular `/albums` page, where `AlbumResponseDto` has no `linkedAt` — a visible option that
silently does nothing. It would also introduce a fork diff into two files that are currently byte-identical to
`upstream/main`, creating a permanent rebase conflict surface. Rejected on correctness first, rebase hygiene
second.

### New fork-only module

`web/src/lib/utils/space-album-sort.ts`:

- `SpaceAlbumSortBy` — the six `AlbumSortBy` values plus `RecentlyLinked`.
- `spaceAlbumSortOptionsMetadata` — upstream's `sortOptionsMetadata` entries followed by a `RecentlyLinked`
  entry (`defaultOrder: Desc`), reusing upstream's `AlbumSortOptionMetadata` shape.
- `findSpaceAlbumSortOptionMetadata(sortBy)` — like upstream's finder but defaulting to `RecentlyLinked`.
- `sortSpaceAlbums(albums, { sortBy, orderBy })` — handles `RecentlyLinked` with lodash `orderBy` on
  `new Date(linkedAt)` (the same shape upstream uses for `DateModified`), and delegates every other value to
  upstream's `sortAlbums`. Delegation is possible without any upstream change because `sortAlbums` accepts
  `sortBy: string` and `sortOptions` is a plain string-keyed record (`album-utils.ts:260`).

  It is typed to take and return `SharedSpaceLinkedAlbumDto[]`, absorbing the `AlbumResponseDto` cast that the
  delegation requires. That removes the existing double `as unknown as` cast at
  `space-albums-list.svelte:54-57` rather than propagating it.

### Call-site changes

| File                                                         | Change                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `web/src/lib/stores/space-album-view-settings.store.ts:22`   | Default `sortBy` → `RecentlyLinked`                                                                   |
| `web/src/lib/components/spaces/space-albums-controls.svelte` | Iterate `spaceAlbumSortOptionsMetadata`; add the `sort_recently_linked` label; widen the label record |
| `web/src/lib/components/spaces/space-albums-list.svelte:53`  | Call `sortSpaceAlbums`                                                                                |
| `web/src/lib/utils/space-album-grouping.ts:40`               | Add `RecentlyLinked` to the Year-disabled list                                                        |
| `web/src/lib/utils/space-album-grouping.ts:268`              | Per-group re-sort calls `sortSpaceAlbums`                                                             |

Two latent bugs in `space-albums-controls.svelte` must be fixed as part of this, or the seventh option renders
incorrectly:

- Line 80 uses upstream `findSortOptionMetadata`, which returns `MostRecentPhoto` for any unrecognised id. With
  `sortBy: 'RecentlyLinked'` the pill would display the wrong label. Must use
  `findSpaceAlbumSortOptionMetadata`.
- `albumSortByNames` is typed `Record<AlbumSortBy, string>` and indexed via `option.id as AlbumSortBy`
  (lines 86, 127, 144). The cast must be widened to the new union rather than left to lie about the seventh
  value.

**Not touched:** `album-utils.ts`, `preferences.store.ts`, `space-albums-table.svelte`.

## Mobile design

`SpaceAlbumRepository.watchLinkedAlbums` (`space_album.repository.dart:25`) already `LEFT JOIN`s
`remoteAssetEntity` through the membership table and `groupBy`s to compute `assetCount`. The two photo-date
aggregates come from that same grouped query — no extra statement, no extra round trip, and the stream stays
reactive.

| File                                                                 | Change                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `mobile/lib/domain/models/space_album.model.dart`                    | Add `createdAt`, nullable `startDate`, nullable `endDate`                                         |
| `mobile/lib/infrastructure/repositories/space_album.repository.dart` | Add `min`/`max` of `asset.localDateTime` to `addColumns`; project `meta.createdAt`                |
| `mobile/lib/pages/library/spaces/collection_sort.dart`               | Extend `SpaceAlbumSortMode` to seven; relabel; add three comparator arms and the empty-album rule |
| `mobile/lib/domain/models/value_codec.dart`                          | `EnumCodec.decode` falls back instead of throwing (slice M0)                                      |

The asset join carries the existing visibility predicate (`deletedAt IS NULL AND visibility IN (timeline,
archive)`), so the photo-date range covers exactly the assets the count already reflects and the detail view
already shows.

**Known and accepted divergence:** web's `startDate`/`endDate` are computed server-side across all album
assets; mobile's `MIN`/`MAX` cover locally synced assets only. On a partially synced device the two can
disagree. Fixing this would mean moving the surface to REST and losing offline support — not worth it. The
option sets and semantics match; only the underlying corpus can lag.

## Implementation slices

Each slice is test-first: write the failing test, watch it fail for the right reason, implement, confirm green.

**W1 — Web sort module.** New `space-album-sort.spec.ts` → new `space-album-sort.ts`. Covers S1–S9 for
`RecentlyLinked`, delegation for the other six, metadata order and default directions, and the unknown-key
fallback.

**W2 — Web store default.** `space-album-view-settings.store.spec.ts` → store change. Covers S16, S17.

**W3 — Web controls.** `space-albums-controls.spec.ts` → component change. Covers the menu rendering seven
labels, the pill showing the correct label for `RecentlyLinked` (the `findSortOptionMetadata` bug), S2, S3.

**W4 — Web list and grouping.** `space-albums-list.spec.ts` and `space-album-grouping.spec.ts` → call-site
changes. Covers S10–S12 at the list level, S20, S21.

**M0 — Harden `EnumCodec`.** Test that decoding an unrecognised name yields the default rather than throwing,
then add the fallback. Covers S19; protects S18 and the downgrade path.

**M1 — Mobile model and query.** `space_album_repository_test.dart` (medium, real DB) → model and repository
changes. Covers `createdAt` projection, `MIN`/`MAX` over the visibility-filtered join, an album with no assets
yielding nulls, and S13.

**M2 — Mobile sort modes.** `collection_sort_test.dart` → `collection_sort.dart`. Covers S1–S15 for all seven
modes.

**M3 — Mobile page assertions.** `space_albums_page_test.dart`. The menu is built from
`SpaceAlbumSortMode.values` (`space_albums.page.dart:206`), so the three new options appear with no wiring
change; this slice updates the label assertions (the suite asserts the literal `'Sort: Photo count'`, which
becomes `'Sort: Number of items'`) and covers persistence round-tripping (S17, S18).

Existing `SpaceAlbum` fixtures gain `createdAt`, so stubs under `mobile/test/` are updated with M1.

## Out of scope

- **Web space-album table headers.** `space-albums-table.svelte:80` hardcodes four static, non-clickable
  `<th>`s, whereas `/albums` renders a clickable sort button per option (`AlbumsTableHeader.svelte:31`). This is
  web-internal parity, not web↔mobile parity — mobile has no table view. A follow-up issue will be filed.
- **Search-scope parity.** Web matches name or description, mobile matches name only. A separate follow-up.
- Server changes; the API already returns everything needed.
- Sorting the Spaces grid itself (`SpaceSortMode`), a different surface.
- Removing the two orphaned i18n keys.
- Title collation parity (see "Accepted divergences").

## Verification gates

- Web: `pnpm test`, `pnpm check:typescript`, `pnpm check:svelte`, `pnpm lint`, prettier.
- Mobile: `flutter test`, `dart format`, `dart analyze --fatal-infos lib test` (both are separate CI gates).
- Docs: prettier over this file — CI Docs Build is strict about `docs/`.
