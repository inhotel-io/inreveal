# Space album drill-down in the web sidebar

**Date:** 2026-07-20
**Discussion:** [#816](https://github.com/open-noodle/gallery/discussions/816)
**Related:** [#817](https://github.com/open-noodle/gallery/issues/817) (pre-existing `getAll` N+1, deliberately out of scope)

## Problem

Albums shared into a Space are not discoverable from the left sidebar. In discussion #816, bdillahu reports that a newly shared album never appears anywhere in the navigation and argues that nesting albums under Spaces would be "more obvious and similar to how the rest already works."

Two distinct gaps produce this:

1. **No drill-down.** The sidebar's Spaces dropdown lists spaces only. There is no affordance to reach a space's linked albums.
2. **No promotion.** `linkAlbum` (`server/src/services/shared-space.service.ts:734`) does not bump the space's `lastActivityAt`, unlike `addAssets` (`:675`) and the bulk-add job (`:2481`). The sidebar sorts spaces by `lastActivityAt` descending and slices to three (`web/src/lib/components/shared-components/side-bar/recent-spaces.svelte:33-39`), so a space receiving a freshly shared album does not move at all.

Fixing only the first leaves the feature invisible on a quiet space, which is the exact case in the discussion. Both are in scope.

## Solution overview

Render up to three linked albums beneath each space in the sidebar, behind a chevron that appears only on spaces that actually have linked albums, and make album linking count as space activity.

Target appearance:

```
⌄ 👥 Spaces
    › 🖼  Apple Photos Export
    ⌄ ●  02 Film Scans
         📁 Wedding Rolls        ← most recently linked
         📁 Negatives 1998
         📁 Barn Slides
         See all (8) →
      ●  04 FBC Jonesboro       ← no linked albums, no chevron
🔍 Explore
```

### Decisions

| Decision           | Choice                              | Rationale                                                                                             |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Default expansion  | Collapsed, persisted per space      | Keeps the sidebar calm; three spaces × three albums would otherwise push Explore/Map/People far down  |
| Album ordering     | `linkedAt` descending               | A newly shared album lands at the top of the drill-down — the discoverability the discussion asks for |
| Overflow           | "See all (N)" when `albumCount > 3` | A silent cut gives no cue that more exist                                                             |
| Chevron visibility | Only when `albumCount > 0`          | No empty disclosure triangles                                                                         |
| Album count source | New `albumCount` on the space DTO   | Chevron correct on first paint, no request-driven pop-in                                              |
| Album detail fetch | Lazy, on first expand               | Collapsed-by-default means most sessions never fetch it                                               |

### Approaches considered

**A. `albumCount` on the DTO plus lazy album fetch (chosen).** One reusable field added to a response the sidebar already loads; album detail deferred to actual drill-down.

**B. Web-only, N requests on mount.** No server change, but three extra round-trips per page load purely for nav chrome, and chevrons pop in after they resolve — visible layout shift on the most-looked-at element on the page.

**C. Dedicated `GET /shared-spaces/sidebar` endpoint.** Single request, but bakes the "top 3" UI decision into the API and duplicates `getAllSpaces` semantics.

**D. Embed top-3 albums in `SharedSpaceResponseDto`.** Never needs a second request, but bloats a DTO consumed by mobile and the spaces list page with sidebar-only data, and again encodes "3" in the API.

A was chosen because it adds the smallest genuinely reusable piece of data and defers the expensive part to the rare case.

## Server changes

### `albumCount` on the space DTO

- **`server/src/repositories/shared-space.repository.ts`** — add `getLinkedAlbumCount(spaceId)`: `COUNT(*)` over `shared_space_album` for the space. Decorate with `@GenerateSql` to match neighbouring methods so `make sql` picks it up.
- **`server/src/dtos/shared-space.dto.ts`** — add `albumCount: number` to `SharedSpaceResponseSchema` (~`:78-104`), alongside `memberCount` and `assetCount`.
- **`server/src/services/shared-space.service.ts`** — in `getAll` (`:133-194`), one additional `await` inside the existing per-space loop; populate `albumCount` on the pushed result.

**RBAC:** a plain per-space count is correct. `getLinkedAlbums` (`:820-850`) gates on `requireMembership` alone with no per-album filtering, so every member sees every linked album; and `getAll` only returns spaces via `getAllByUserId`. The count cannot reveal albums the viewer is not entitled to see.

**Out of scope:** `getAll` is already a per-space loop of 6+ sequential queries. This change adds a 7th and deliberately does not restructure it — tracked as #817.

### `lastActivityAt` bump on link

`linkAlbum` (`:734`) gains `await this.sharedSpaceRepository.update(spaceId, { lastActivityAt: new Date() })`, matching `addAssets` (`:675`).

Two deliberate asymmetries:

- **`unlinkAlbum` does not bump.** Removing content is not activity worth promoting a space for.
- **No `logActivity` call.** `addAssets` follows its bump with an activity-log write. Links do not get one, because that feeds the user-visible activity feed and would be a behaviour change beyond what #816 asks for.

### Migration and SDK

No migration — `albumCount` is computed, not stored.

Adding a DTO field requires regeneration: `pnpm build` (server) → `pnpm sync:open-api` → `make open-api`. The full `make open-api` matters; a TypeScript-only regen leaves the Dart client stale and CI fails.

## Web changes

### Rendering

`recent-spaces.svelte` currently emits plain `<a>` rows at hardcoded `ps-10`. Each space row becomes a nested `NavbarItem` from `@immich/ui`, which already provides the chevron affordance, an `expanded` bindable, and `ps-8` auto-indent for children. This is the same primitive the Spaces item itself uses (`UserSidebar.svelte:48-60`), so the nested chevron matches the existing one rather than being a lookalike.

The chevron renders only when `space.albumCount > 0`. Spaces without albums keep their current appearance exactly.

### Expansion state

`preferences.store.ts:157-158` has `recentSpacesDropdown` as a single persisted boolean. Per-space state needs a keyed structure: a persisted `Record<string, boolean>` under `recent-space-albums-open`, defaulting to collapsed for unknown ids. Entries for spaces no longer in the top three are pruned on write so the key does not grow unbounded as spaces churn.

### Fetching

On first expand, call `getSharedSpaceAlbums({ id })` and cache into `userInteraction.spaceAlbums: Record<string, SharedSpaceLinkedAlbumDto[]>`, following the existing `userInteraction.recentSpaces` cache-once pattern (`user.svelte.ts:12`, reset at `:33`). Sort by `linkedAt` descending, slice to three.

Persisted expansion means a returning user re-fetches once per session on mount for already-open spaces. This is accepted: it keeps the list honest rather than serving a stale album set.

### Routing

The space-album URL is currently hardcoded in three places: `space-album-card.svelte:49`, `space-albums-table.svelte:41`, and `albums/+page.svelte:101`. Add `Route.viewSpaceAlbum({ spaceId, albumId })` to `web/src/lib/route.ts` (near `viewSpace` at `:126-128`) and migrate all three call sites plus the new sidebar link. Leaving a fourth hardcoded copy is how that string drifts.

### "See all"

Renders only when `albumCount > 3`, showing the total from `albumCount` and linking to `/spaces/{spaceId}/albums`.

### Error handling

A failed `getSharedSpaceAlbums` collapses the row and toasts via the existing `handleError` path. Add a `failed_to_load_albums` key to `i18n/en.json` — English only, per repo convention. Note `i18n/` is shared between web and mobile.

## Testing

### Server

`shared-space.service.spec.ts`:

- `getAll` returns `albumCount: 0` for a space with no linked albums
- `getAll` returns the correct count for a space with several
- `linkAlbum` bumps `lastActivityAt`
- `unlinkAlbum` does **not** bump it — asserted explicitly, so a later refactor symmetrizing the two is caught

A medium test is also needed. `albumCount` is a real SQL aggregate, and unit tests mock the repository, so they pass even if the query is wrong. Medium tests hit a real DB via testcontainers, which is where a bad `COUNT` surfaces.

### Web

`recent-spaces.spec.ts`:

- chevron present iff `albumCount > 0`
- expanding fires exactly one `getSharedSpaceAlbums`; a second expand fires none (cache)
- albums sorted by `linkedAt` descending and sliced to three
- "See all" appears only above three and shows the right total
- fetch failure collapses the row and toasts

New test ids follow the existing convention (`sidebar-space-{id}`, `sidebar-space-dot-{id}`, `sidebar-space-thumbnail-{id}`): `sidebar-space-albums-{spaceId}`, `sidebar-space-album-{albumId}`, `sidebar-space-see-all-{spaceId}`.

### E2E

Skipped. The web component tests cover the logic, and the Playwright web suite against `:2283` serves empty bodies on a dev stack while the `:2285` path needs a full image rebuild per change — a poor trade for sidebar chrome.

### Approach

Tests first. The server assertions are cheap to write against the mocked repository before the query exists.

## Verification gates

- `pnpm test` in `server/` and `web/`
- `pnpm test:medium` for the `albumCount` aggregate
- `make lint-server`, `make lint-web`
- Type checks: `pnpm check` per package
- `prettier --check` on every modified file — eslint green does not imply prettier green; they are separate CI gates
- Full `make open-api` (TypeScript **and** Dart)
- Mobile `dart analyze --fatal-infos lib test` — the Dart client regenerates with `albumCount`. Additive and expected to be safe, but confirmed rather than assumed.

## Risks

| Risk                                          | Mitigation                                                           |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Sidebar depth pushes nav items below the fold | Collapsed by default; chevron only where albums exist                |
| Extra query on a hot path (`getAll`)          | One count added to a loop already doing 6+; #817 tracks the real fix |
| Stale album list after persisted expansion    | Cache is per session, re-fetched on mount                            |
| Dart client drift                             | Full `make open-api` plus the mobile analyze gate                    |

## Out of scope

- Restructuring the `getAll` N+1 (#817)
- Making shared albums appear in the top-level Albums section — the discussion's alternative suggestion, and a separate feature with its own opt-in question
- Mobile sidebar parity
- Activity-feed entries for album links
