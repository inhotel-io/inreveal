# Mobile add-to-collection picker: reachable spaces, real thumbnails, and the last two entry points

Follow-up to #965 / PR #970, which made a space album reachable from every add-to-collection
surface. Using that picker on a real library surfaced two presentation problems, and #970's own
design note recorded two entry points it deliberately left alone. This change closes all four.

## The problems

**1. Spaces sit below every album.** `CollectionPicker` stacks `AlbumSelector` then
`SpaceCollectionSection`. On a library with dozens of albums the Spaces section is several screens
down, so the destination #970 existed to expose is effectively unreachable by scrolling.

**2. Spaces and space albums render placeholder icons.** A space row draws a bare
`CircleAvatar` filled with its gradient colour — a flat coloured disc. A space-album child draws a
static `Icon(Icons.photo_album_outlined)`. Personal albums, one section below, draw real photo
thumbnails, so the two halves of the same sheet look like they belong to different apps. The data
to do better is already on the wire and unused.

**3. No picker on the space-album page.** `SpaceAlbumBottomSheet` passes no `slivers:` at all.

**4. No picker on an album you do not own.** `RemoteAlbumBottomSheet` gates the picker on
`ownsAlbum`.

## Decisions

### Layout: keep two sections, put Spaces first

Chosen over interleaving albums and spaces into one sorted list. Interleaving reads as the most
literal "show them together", but it requires injecting fork rows into upstream's album list, and it
lets a space sink into the middle of a long alphabetical run — reintroducing the very problem being
fixed. Two labelled sections with Spaces on top keeps spaces above the fold unconditionally, and
keeps the sections visually distinct, which is honest: a space row expands and carries different
permissions, an album row does not.

### The search field forces a hook, not a reorder

The naive fix — swapping the two children of `CollectionPicker`'s `MultiSliver` — is wrong.
`AlbumSelector`'s own `MultiSliver` is `[_SearchBar, _QuickFilterButtonRow, _QuickSortAndViewMode,
…albums]`, so the search field lives **inside** the upstream widget. Reordering would put the Spaces
section above the search box that filters it.

Spaces must land _between_ `_SearchBar` and `_QuickFilterButtonRow`. Of the three ways to do that:

- **Add one additive prop to `AlbumSelector`** — chosen. The fork already carries exactly this shape
  of additive hook on this widget (`onSearchChanged`, `searchHint`), so this is a one-line insertion
  into upstream code and stays trivially rebasable.
- Lift `_SearchBar` into `CollectionPicker` — drags `searchController`, `searchFocusNode`,
  `clearSearch` and `filterMode` across the fork boundary for no extra benefit.
- Pin the Spaces section as a sticky sliver — solves the problem only while scrolled to the top, and
  adds sliver complexity.

Both labels must appear and disappear together: `SpaceCollectionSection` already collapses to
`SizedBox.shrink()` when the user has no writable spaces, and a user in no space must not be shown a
lone `ALBUMS` header over the layout they see today.

Only `SpaceCollectionSection` knows whether it rendered — that verdict depends on the writable-space
filter, `excludeSpaceId` and the search query, and recomputing it in `CollectionPicker` would
duplicate logic that could then drift. So the section takes an optional `Widget? footer` and renders
it only on the path where it renders itself; `CollectionPicker` passes the `ALBUMS` label as that
footer. The section keeps owning the `SPACES` label it already renders, and stays ignorant of what
the footer contains.

### The album gate is removed, not widened

Web's album route gates the add action on `canAddToAlbum: () => viewMode === AlbumPageViewMode.VIEW`
(`web/src/routes/(user)/albums/[albumId=id]/…/+page.svelte:289`) — view mode only, **no ownership
test**. Mobile's `ownsAlbum` gate is therefore stricter than web, and the parity fix is to drop it,
not to widen it to editors.

This is also correct on the merits: adding assets to a collection requires rights over the
**destination**, never over the source album. The picker already enforces destination rights — the
spaces section hides itself behind a notice for a non-owned selection, and the server enforces
`Permission.AlbumAssetCreate` regardless. `ownsAlbum` continues to gate the genuinely
ownership-bound actions in that sheet (remove-from-album, set-cover, delete); only the `slivers:`
argument changes.

### The current space is offered from inside its own album

`excludeSpaceId` exists so a space is not offered as a destination for its own pool assets. On the
space-album page the useful action is the opposite: moving a photo from one album to another inside
the same space. Web already offers the current space for this reason, so the space-album sheet
passes no `excludeSpaceId`. This closes a third row of #970's divergence table as a side effect.

## Changes

### `mobile/lib/presentation/widgets/album/album_selector.widget.dart` (upstream, additive)

- New optional `Widget? sliverAfterSearch`, rendered in the `MultiSliver` immediately after
  `_SearchBar` and before `_QuickFilterButtonRow`. Null by default, so upstream behaviour and every
  other call site are untouched.

### `mobile/lib/presentation/widgets/collection/collection_picker.widget.dart`

- Stop appending `SpaceCollectionSection` after `AlbumSelector`. Pass it through the new
  `sliverAfterSearch`, handing it the `ALBUMS` label as its `footer` so the label shares the
  section's visibility.
- The label reuses the existing `albums` i18n key, as the section's header already reuses `spaces`.
  No new keys, so this change adds no nine-locale translation work.

### `mobile/lib/presentation/widgets/collection/space_collection_section.widget.dart`

- Space row `leading`: `CircleAvatar` → `SpaceCollage`, fed by the DTO's `recentAssetIds` /
  `recentAssetThumbhashes`, with `color` for its existing empty-state gradient. `SpaceCollage` is
  already imported in this file for `spaceGradientColors`.
- Space-album child `leading`: `Icon(Icons.photo_album_outlined)` →
  `Thumbnail.remote(album.thumbnailAssetId)` when non-null, falling back to the icon when null —
  matching how `AlbumSelector` renders a personal album with no thumbnail.
- The "Add to space" pool child keeps its icon. It is an action, not a collection.
- New optional `Widget? footer`, appended inside the `Column` on the paths where the section renders
  and therefore skipped by both `SizedBox.shrink()` early returns. Keeps the existing `SPACES` label
  as-is.

### `mobile/lib/presentation/widgets/bottom_sheet/remote_album_bottom_sheet.widget.dart`

- `slivers: ownsAlbum ? [CollectionPicker(...)] : null` → always pass the picker. Every other
  `ownsAlbum` branch in the file is unchanged.

### `mobile/lib/presentation/widgets/spaces/space_album_bottom_sheet.widget.dart`

- Pass `slivers: [CollectionPicker(onKeyboardExpanded: …)]`, with no `excludeSpaceId`. The sheet
  already owns a `DraggableScrollableController`, so the keyboard-expand callback wires up as it
  does on the other sheets.

## Testing

Extending the existing widget tests, which already pin sheet composition and ordering:

- `collection_picker_test.dart` — the existing ordering assertion (`headerY < albumsY`) gains a
  spaces-above-albums case; the `ALBUMS` label renders only when a spaces section is present, and
  neither label renders when the user has no writable spaces.
- `space_collection_section_test.dart` — a space with recent assets renders `SpaceCollage`; a space
  album with a `thumbnailAssetId` renders `Thumbnail`, and one without falls back to the icon.
- `add_to_collection_surfaces_test.dart` — the space-album sheet offers the picker, and offers its
  own space; a non-owned album sheet offers the picker.

Each regression test is to be confirmed red against the unfixed code before the fix lands, as #970's
second commit did.

## Out of scope

- **Capping the spaces list.** With a handful of spaces it is unnecessary; a "show all" affordance is
  complexity to add only if it bites.
- **The partner-surface rule.** Mobile's `selectionHasNonOwned` remains stricter than the server.
  Relaxing it needs mobile to learn which owners are partners, which changes every surface that rule
  governs — unchanged from #970's assessment.
- **Child-album source and ordering.** Space-album children still come from local Drift in name
  order, where web uses a live endpoint in `createdAt DESC`.
- **Searching a space album by name.** Children are still not searchable, on either platform.
