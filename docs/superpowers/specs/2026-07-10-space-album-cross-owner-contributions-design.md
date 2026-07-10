# Collaborative Cross-Owner Contributions to Space Albums — Design Spec (2026-07-10)

> **Purpose.** Let any space **Editor** add *any space-visible photo* — including photos they do
> not own — to a space-linked album, collaboratively, while keeping every contributed photo
> tethered to live space access (it vanishes the instant the contributor's/viewer's space access
> ends or the album is unlinked, and it never becomes a permanent grant the album owner can carry
> out of the space). Fixes issue **#764** as a byproduct.

---

## 0. Meta

- **Base branch:** `feat/space-albums-collab-contrib`, branched off **`origin/space-albums-onto-main`**
  (PR #752 head, tip `8071b039ca`). Ships as a **separate, stacked PR** whose base is the #752
  branch — folded into the space-albums feature set but reviewable on its own.
- **Depends on #752.** Everything here builds on machinery #752 already introduced: the
  `shared_space_album` link, the revocable `shared_space_album_user` grant (auto-removed on leave
  via `shared_space_member_delete_album_audit`), the space-aware `AlbumAssetCreate` case, and the
  `shared-space-album-scope.ts` visibility helpers. **Do not** start until #752 is stable.
- **Line numbers** are navigation hints against `8071b039ca`; every slice re-confirms symbols in
  the worktree before editing.
- **Terminal state of this spec:** feed to `writing-plans` (then `impl-loop`), TDD per slice.

---

## 1. Problem

Reported in **#764**: a non-admin **Editor** in a shared space creates an album inside the space,
tries to add a photo, and gets a green **"Successful"** toast whose body says **"cannot be added
to the album"** — and the photo is not added. Two distinct defects stacked:

1. **The lying toast.** `web/src/lib/services/album.service.ts` `notifyAddToAlbum` always calls
   `toastManager.primary(...)` (green "Successful") regardless of result counts. The server returns
   **HTTP 200 with per-asset failures**, so the web `catch` never fires and a failure renders as
   success.
2. **The add is genuinely blocked for non-owned assets.** `addAssets` (`server/src/utils/asset.util.ts`)
   gates every asset on `Permission.AssetShare`, which resolves (`server/src/utils/access.ts`) through
   **owner + partner only** — no space path (unlike `AssetRead`/`AssetView`/`AssetDownload` →
   `checkSpaceAccess`, and `AssetUpdate` → `checkSpaceEditAccess`). #752 made the *album-level*
   `AlbumAssetCreate` space-aware, but the *per-asset* `AssetShare` gate is untouched. So a space
   Editor can add **only their own** photos to a space album; anyone else's photo returns
   `NO_PERMISSION` for every asset.

For the "Close Family" use case (most members are non-admin Editors curating a shared pool of
photos contributed by *many* members), this makes collaborative curation impossible.

### 1.1 The trap we must avoid

`AssetShare` is owner-only **by design** — it also gates **public shared links** and **memories**.
Simply adding `checkSpaceAccess` to the global `AssetShare` case would let any space member mint a
public link of another member's photo. **We must not widen `AssetShare`.** The fix is a narrow,
album-scoped add path.

### 1.2 The new risk collaborative add introduces

The moment Bob can add *Carol's* photo to *Alice's* album, Carol's photo sits in an album Alice
**owns**. In upstream Immich, being in an album you own is a **permanent** view grant
(`checkAlbumAccess`). Space *members* are safe (their album grant is revoked on leave), but the
album **owner** — and any direct `album_user` participant — keeps access forever and can carry it
**out of the space** (unlink the album, add an external album user, mint a public link). Carol only
ever consented to *space* sharing. Closing this is the reason for a dedicated table (§4).

---

## 2. Goals & non-goals

**Goals**
- A space **Editor** may add any asset **space-visible to them** to an album **linked to that space**,
  regardless of who owns the asset.
- Contributed (non-owned) photos are **inert bookmarks**: access is re-derived from live space
  membership + the live album↔space link on every read; they never grant permanent access via
  `checkAlbumAccess`.
- Leaving the space, unlinking the album, deleting the asset, or deleting the space each removes the
  contribution from view (for everyone, including the album owner). Re-joining / re-linking restores it.
- The add-to-album toast tells the truth (success / partial / failure).

**Non-goals (this slice)**
- No change to personal (non-space) albums or normal shared albums.
- No widening of `AssetShare`, shared-link, or memory permissions.
- **Viewers** stay read-only (contribute = Editor+), matching #752's `AlbumAssetCreate` role gate.
- Not solving the sibling issues #763 (favorite for members) / #765 (fix-match no-op) here, though
  they share the "members can't curate in a space" theme.

---

## 3. The core invariant

> A **cross-owner contribution** is a pointer `(album, asset, space)` that renders for a viewer **iff**
> the album is still linked to that space **and** the viewer is a live member of that space. It is
> never stored in `album_asset`, so `checkAlbumAccess` can never turn it into a permanent grant.

The adder's **own** photos are *not* contributions — they take the ordinary `album_asset` path
(standard "I shared my photo into a collaborative album"). The new table only ever holds the
"photo I don't own" case.

---

## 4. Data model

New fork table `album_space_asset` (`server/src/schema/tables/album-space-asset.table.ts`) plus its
own delete-audit table `album_space_asset_audit` (for the sync delete stream), plus a migration in
`server/src/schema/migrations-gallery/` (round timestamp, e.g. `1783000000000`; add a
`scripts/revert-to-immich.sql` DROP entry).

> **Naming caution.** #752 already ships `shared_space_album_asset_audit` — that audits deletions of
> **normal `album_asset`** membership in linked albums, feeding `SharedSpaceAlbumToAssetSync`. It is
> **not** related to this table. Keep the new table's name (`album_space_asset`) and its audit
> (`album_space_asset_audit`) distinct to avoid conflating the two.

```
album_space_asset  — a live-gated cross-owner contribution of a space photo into a linked album
────────────────────────────────────────────────────────────────────────────────────
  albumId    FK → album          (PK)   onDelete CASCADE   the collaborative album
  assetId    FK → asset          (PK)   onDelete CASCADE   the contributed photo (owner unchanged)
  spaceId    FK → shared_space          onDelete CASCADE   provenance + tether
  addedById  FK → user (nullable)       onDelete SET NULL  who contributed it (any Editor)
  addedAt    timestamp
  createId / updateId / createdAt / updatedAt              fork sync watermarks (mirror shared_space_asset)
```

- **Not** `album_asset`, **not** `album_user`, **not** an access grant — a bookmark whose validity
  is recomputed on every read.
- `spaceId` disambiguates albums linked to multiple spaces and drives the "from *Space*" affordance
  and the add-eligibility check (the Editor must be an Editor of *that* space).
- Sync columns because mobile must receive/drop these rows (see §7).

---

## 5. Access & read model

### 5.1 Adding (the #764 fix) — `AlbumService.addAssets`

Replace the single `AssetShare`-gated `addAssets(...)` call with a two-bucket split *inside the
album-add path only* (no change to the generic `asset.util.ts` used by shared-links/memories):

1. Resolve the album's live space link(s) the adder is an **Editor** of:
   `shared_space_album ⋈ shared_space_member(role ∈ {owner, editor})` for `auth.user.id`. If none,
   behavior is unchanged from today (owner-only add).
2. For each requested asset, in order of precedence:
   - **Owned / AssetShare-eligible** → normal `album_asset` insert (unchanged path).
   - **Not owned, but space-visible to the adder via an eligible space `S`** → insert into
     `album_space_asset (album, asset, S, addedById=auth.user.id)`.
     "Space-visible to the adder via S" reuses `shared-space-album-scope.ts`
     `spaceAssetPathBranches` (direct `shared_space_asset` ∪ linked-library ∪ linked-album arms)
     scoped to `{ memberUserId: auth.user.id, memberRole: [owner, editor], spaceId: S }`.
   - **Already present** in `album_asset` *or* `album_space_asset` → `DUPLICATE`.
   - **Otherwise** → `NO_PERMISSION`.
3. Return a merged `BulkIdResponseDto[]` across both buckets (per-asset outcome preserved).

An asset never lands in both tables (each asset has exactly one owner → exactly one eligible path).

### 5.2 Reading — extend the album visibility arm

`album_space_asset` becomes a **fourth arm** of space visibility, parallel to
`spaceDirectAssetExists` / `spaceLibraryAssetExists` / `spaceAlbumAssetExists`. Add
`spaceContributedAssetExists(eb, { correlateAssetId, scope })` to `shared-space-album-scope.ts`:

```
EXISTS (
  SELECT 1 FROM album_space_asset asa
  JOIN shared_space_album ssa  ON ssa.albumId = asa.albumId AND ssa.spaceId = asa.spaceId   -- link still live
  JOIN album a                 ON a.id = asa.albumId AND a.deletedAt IS NULL
  [membership scope]           JOIN shared_space_member m ON m.spaceId = asa.spaceId
                                 AND m.userId = :viewer  [AND m.role IN (:roles)]
  WHERE asa.assetId = <correlateAssetId>
    [AND asa.spaceId = :scopeSpaceId]
)
```

- Unlink the album → no `shared_space_album` row → excluded (reversible on re-link).
- Viewer leaves the space → no `shared_space_member` row → excluded (reversible on re-join).
- Because the row is *not* in `album_asset`, the owner's `checkAlbumAccess` never sees it → no
  permanent grant, no leak via external album sharing / public links.

**Album contents** become `album_asset ∪ spaceContributedAssetExists(...)`, deduped by `assetId`.
Wire the new arm into every place #752 already routes the album arm: **album detail/grid, asset
count, thumbnail selection, the space aggregated timeline (respecting `showInTimeline`), download,
activity, and in-album search.** (This is the largest surface area of the change — audit each
consumer of `spaceAlbumAssetExists` / `spaceAssetPathBranches`.)

### 5.3 Removing — `AlbumService.removeAssets`

Removing a contributed asset = delete the `album_space_asset` row (never touches the asset).
Permitted for the **album owner**, any **space Editor** of the linked space, and the **contributor**.
Add a space-aware branch alongside the existing `AssetShare` / `AlbumAssetDelete` (`canAlwaysRemove`)
logic. Removal of an ordinary `album_asset` row is unchanged.

---

## 6. Lifecycle & edge cases

| Event | Effect on a contribution `(album L, asset A, space S)` |
|---|---|
| Viewer leaves space S | Hidden for that viewer (no `shared_space_member`). Rejoin → reappears. |
| Album L unlinked from S | Hidden for everyone (no `shared_space_album`). Re-link → reappears. |
| Space S deleted | Row deleted (FK `spaceId` CASCADE). |
| Album L deleted | Row deleted (FK `albumId` CASCADE). |
| Asset A deleted | Row deleted (FK `assetId` CASCADE). |
| Album L shared outside S (external `album_user` / public link) | Non-space viewers **never** see A (arm keys on *viewer's* live membership). No leak. |
| Owner opens L after leaving S / after unlink | A is gone for the owner too (owner reaches contributions only via the space arm, not `album_asset`). |

---

## 7. Surfaces

### 7.1 Web
- **Add flow:** the existing "Add to album or space" picker + `addAssetsToAlbums` already targets
  space-linked albums; no picker change needed — the server now accepts non-owned assets for
  eligible albums.
- **Toast (fixes #764's literal title):** `notifyAddToAlbum` must branch on result counts —
  `success` (all added), `info`/warning (partial), `warning`/`error` (none added) — instead of an
  unconditional `toastManager.primary`. **Standalone**; can land first, independent of the backend.
- **Legibility:** a "from *Space name*" affordance on contributed tiles in the album view (we have
  `spaceId` → space name), so the "these can disappear when you leave/unlink" behavior is understood.
  Contributed tiles are **not** owned by the viewer → respect existing non-owner asset affordances.

### 7.2 Mobile / sync
- `album_space_asset` carries sync watermarks. Contributions are album→asset **membership edges**, so
  extend **`SharedSpaceAlbumToAssetSync`** (`sync.repository.ts:1609`) to union `album_space_asset`
  inserts, with deletes driven by the new `album_space_asset_audit` stream. The contributed asset's
  **payload + exif** (owned by another member) must also reach the client: include
  `album_space_asset`-reachable assets in **`SharedSpaceAlbumAssetSync`** (`:1689`) and
  **`SharedSpaceAlbumAssetExifSync`** (`:1763`), mirroring how the existing linked-album arm streams
  `album_asset`-reachable assets. Register a new `SyncEntityType`/`SyncRequestType` pair
  (e.g. `SharedSpaceAlbumContributions*`) if the membership edge needs a distinct stream from
  `SharedSpaceAlbumToAssetsV1`.
- Contributions render read-through-space like the rest of a space album; tap-through respects the
  same owner/role gating already in place.

---

## 8. Open sub-decisions (defaults chosen; confirm at review)

1. **Un-share vs. curated life.** If the asset's owner *removes A from the space's general pool*
   (a `shared_space_asset` delete) but does not delete A, does A stay in albums it was curated into?
   **Default: yes, stays** — a contribution has its own life tethered to space S, not to the source
   arm it came from; only delete / unlink / leave / space-deletion remove it. (Alternative: also
   require A to be independently space-visible at read time — stronger for the owner, but makes
   curated album content fragile.)
2. **Contributions into externally-shared albums.** Allowed — the per-viewer arm makes it safe
   (non-space viewers never see contributions). No block needed.
3. **Multi-space albums.** `spaceId` pins provenance; a contribution is visible to members of *its*
   space. An album linked to two spaces can hold contributions tagged to each; each is gated
   independently. No dedup needed beyond `assetId` at read time.

---

## 9. Slice outline (detail → `writing-plans`)

1. **Toast honesty** (web, standalone). Red: a `notifyAddToAlbum` unit test asserting a 0-success
   result yields a non-success toast. Green: branch on counts.
2. **Schema + migration.** `album_space_asset` + `album_space_asset_audit` tables + migration +
   `revert-to-immich.sql` entry + audit trigger wiring. Medium test: insert/read/cascade behavior.
3. **Add path.** `AlbumService.addAssets` two-bucket split + repository method. Medium/e2e: Editor
   adds a non-owned space photo → row in `album_space_asset`, `success: true`; Viewer → denied;
   non-space asset → `NO_PERMISSION`; owned asset still → `album_asset`.
4. **Read arm.** `spaceContributedAssetExists` + wire into album grid/count/thumbnail/timeline/
   download/activity/search. Medium: leave/unlink hides; owner has no permanent access; external
   share doesn't leak.
5. **Remove path.** Space-aware `removeAssets` branch. Medium: owner/editor/contributor can remove;
   viewer cannot.
6. **Sync.** Extend `SharedSpaceAlbumToAssetSync` (membership edge) + `SharedSpaceAlbumAssetSync` /
   `SharedSpaceAlbumAssetExifSync` (contributed asset payload/exif) for `album_space_asset`
   insert/delete via `album_space_asset_audit`. Medium: sync stream carries contribution + payload +
   audit-driven removal.
7. **Web UX.** "from *Space*" affordance + Playwright role-gating (Editor sees add succeed, Viewer
   has no add).
8. **SDK/regen** if any DTO/endpoint shape changes; `make build-sdk` → `make open-api`.

Each slice is TDD (red → green → refactor) with full-suite validation for touched packages before
"done". No Claude co-author trailers.
