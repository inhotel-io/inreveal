# Album Folders Design

## Context

Gallery albums are currently flat collections of assets. Users can create, edit,
share, download, and browse albums on web and mobile. The server album model,
OpenAPI DTOs, TypeScript SDK, web album list/detail pages, and mobile Drift album
sync all assume that an album is an asset container.

Immich has several long-running nested-album requests. The strongest product
signal is that users want hierarchy to reduce album-list clutter and organize
shared or event albums, but prior attempts became ambiguous when albums were both
asset containers and parent folders:

- https://github.com/immich-app/immich/issues/1010
- https://github.com/immich-app/immich/discussions/2073
- https://github.com/immich-app/immich/pull/8481
- https://github.com/immich-app/immich/discussions/15285
- https://github.com/immich-app/immich/discussions/5409

The closed nested-album PR is the key warning: parent albums that contain both
assets and child albums make covers, counts, date ranges, downloads, sharing,
and navigation semantics unclear. This design avoids that class of ambiguity by
introducing private album folders rather than recursive album assets.

## Problem

Users with many albums need a way to organize them into a hierarchy. A flat album
page becomes difficult to scan, especially when the account has many event,
travel, family, or shared albums.

The feature should support albums shared with the user. If shared albums cannot
be organized, the folder model feels incomplete for users who collaborate heavily.

## Goals

- Add private album folders for organizing albums.
- Keep albums as leaf asset containers.
- Support organizing both owned albums and albums shared with the user.
- Show folders first and albums second in every folder view.
- Provide efficient web organization controls: drag-and-drop, context menu move,
  album detail move, and bulk move.
- Cap folder depth at 5 levels.
- Keep existing album sharing, public links, counts, downloads, and timelines
  unchanged.
- Keep v1 web-first while preserving mobile flat album behavior.
- Choose a storage model that can evolve toward multi-folder album placement
  later without a full rewrite.

## Non-Goals

- No recursive parent-album timeline in v1.
- No folder sharing in v1.
- No inherited permissions from folder to album.
- No folder public links in v1.
- No recursive folder subtree deletion in v1.
- No mobile folder browsing or management in v1.
- No source filesystem folder integration.
- No automatic migration that infers folders from album names or file paths.

## Approaches Considered

### Approach A: Add `parentId` To Albums

Albums would point to parent albums directly. A parent album could contain child
albums and potentially assets.

Pros:

- Small schema change.
- Easy to explain as "nested albums."
- Directly resembles the original Immich feature request.

Cons:

- Repeats the ambiguity that blocked the prior Immich PR.
- Makes parent album counts, thumbnails, date ranges, downloads, and shared links
  unclear.
- Makes albums both containers and leaves.
- Harder to keep mobile flat album behavior stable.

### Approach B: Album Folders With Per-User Placements

Add private folder nodes and private album placement rows. Albums remain normal
albums. A placement means "this user assigned this accessible album to this
folder."

Pros:

- Clean separation: folders organize, albums contain assets.
- Supports shared albums without mutating the shared album owner state.
- Keeps existing album semantics unchanged.
- Storage can evolve to multi-folder placements by changing constraints and API
  semantics later.
- Fits a file-manager mental model.

Cons:

- More backend work than a nullable column on `album`.
- Folder contents queries require one extra join.
- Move operations update placement state rather than album rows.
- Shared-access loss needs filtering or cleanup behavior.

### Approach C: Album Tags Or Categories

Represent organization as tags/categories on albums rather than folders.

Pros:

- Naturally supports multi-placement.
- Flexible for search and filtering.
- Could reuse some tag UI concepts.

Cons:

- Does not match the requested folder-first navigation model.
- Less obvious for users expecting hierarchical browsing.
- Pushes the feature toward tagging instead of album organization.

Recommendation: use Approach B.

## Data Model

Add an `album_folder` table for private folder nodes:

```text
album_folder
- id uuid primary key
- userId uuid not null references user(id) on delete cascade
- name text not null
- parentId uuid null references album_folder(id) on delete restrict
- createdAt timestamptz not null default now()
- updatedAt timestamptz not null default now()
- updateId uuid not null default immich_uuid_v7()
```

Indexes and constraints:

- index `(userId)`
- index `(parentId)`
- index `(updateId)`
- sibling folder names are unique case-insensitively per parent. The service
  enforces this for both root folders and child folders; add an expression index
  when the local migration tooling can represent the root `null` semantics
  cleanly.
- folder names are trimmed before validation and storage. Names must be
  non-empty after trimming, no longer than 100 characters, and must not contain
  `/` or ASCII control characters. Uniqueness compares the trimmed,
  case-folded name while preserving the user's display casing.

Add an `album_folder_album` table for private album placements:

```text
album_folder_album
- id uuid primary key
- userId uuid not null references user(id) on delete cascade
- folderId uuid not null references album_folder(id) on delete cascade
- albumId uuid not null references album(id) on delete cascade
- createdAt timestamptz not null default now()
- updatedAt timestamptz not null default now()
- updateId uuid not null default immich_uuid_v7()
```

Indexes and constraints:

- unique `(userId, albumId)` to enforce one folder per user per album in v1
- unique `(userId, folderId, albumId)` so future multi-folder support can drop
  only the single-placement constraint
- index `(folderId)`
- index `(albumId)`
- index `(updateId)`

Root albums have no placement row. Removing a placement returns the album to the
root album view for that user.

The placement row does not grant album access. Every read path must intersect
placements with albums currently accessible to the user.

## Server Rules

Folders:

- A folder belongs to exactly one user.
- A folder parent must belong to the same user.
- Folder depth must not exceed 5.
- Depth is calculated with root folders at depth 1. A folder can be created at
  depth 5, but cannot be created or moved to depth 6.
- Moving a folder must reject cycles, including moving a folder under itself or
  under any descendant.
- Moving a folder subtree must keep every descendant at depth 5 or lower.
- Moving a folder to its current parent is allowed as a no-op unless the request
  also renames it.
- Deleting a folder succeeds only when it has no child folders and no active
  accessible album placements. Stale inaccessible placements in the deleted
  folder may be removed during delete so a folder that appears empty can be
  deleted.
- Deleting a user cascades their folders and placements.

Placements:

- A user can place an owned album or an album currently shared with them.
- Placing an album validates normal authenticated `AlbumRead` access for the
  current user. Anonymous shared-link access does not create private folder
  organization rights.
- The target folder must belong to the current user.
- Moving an album from one folder to another upserts the user's placement row.
- Moving an album to root deletes the user's placement row.
- Moving an album into its current folder is an idempotent success.
- A user cannot create or delete another user's placement.
- Different users can place the same album in different folders because
  placements are private per user.
- A placement for a no-longer-accessible shared album must not make that album
  visible. The row can remain until opportunistic cleanup, but folder delete can
  remove stale placements in the deleted folder.
- If two placement writes for the same user and album race, the unique
  `(userId, albumId)` constraint keeps one row and the last successful upsert
  wins.

Album semantics:

- Album asset membership is unchanged.
- Album sharing is unchanged.
- Album public links are unchanged.
- Album thumbnails, counts, date ranges, downloads, timeline queries, and map
  markers are still computed from the album's direct assets only.
- Deleting an album cascades any private placements for that album.

## API Design

Add a new controller/resource for album folders:

```http
GET    /album-folders
POST   /album-folders
PATCH  /album-folders/:id
DELETE /album-folders/:id

PUT    /album-folders/:folderId/albums/:albumId
DELETE /album-folders/albums/:albumId
```

`GET /album-folders` returns folders and active placements for the current user:

```ts
AlbumFolderResponseDto {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  depth: number;
}

AlbumFolderPlacementResponseDto {
  albumId: string;
  folderId: string;
}

AlbumFolderTreeResponseDto {
  folders: AlbumFolderResponseDto[];
  placements: AlbumFolderPlacementResponseDto[];
}
```

Create and update DTOs:

```ts
CreateAlbumFolderDto {
  name: string;
  parentId?: string | null;
}

UpdateAlbumFolderDto {
  name?: string;
  parentId?: string | null;
}
```

Endpoint behavior:

- `POST /album-folders` creates a folder under root or a same-user parent.
- `PATCH /album-folders/:id` renames or moves a folder.
- `PATCH /album-folders/:id` rejects an empty body because it cannot distinguish
  an intentional no-op from a malformed request.
- `DELETE /album-folders/:id` deletes an empty folder only.
- `PUT /album-folders/:folderId/albums/:albumId` places or moves an accessible
  album into the target folder.
- `DELETE /album-folders/albums/:albumId` removes the current user's placement
  for that album and returns it to root.
- `PUT /album-folders/:folderId/albums/:albumId` is idempotent when the album is
  already in that folder.
- `DELETE /album-folders/albums/:albumId` is idempotent when the album is already
  at root. It only deletes the current user's placement metadata and does not
  require current album access.

The current `GET /albums` response should remain backward compatible. It does
not need to include folder data in v1 because the web can combine album data with
`GET /album-folders`.

OpenAPI and the TypeScript SDK must be regenerated after adding the DTOs and
controller.

## Web UX

The web albums page becomes folder-aware.

Each folder view shows:

- a sidebar folder tree for quick navigation
- breadcrumbs for the current folder path
- a `Folders` section first
- an `Albums` section second

Folder section:

- Shows child folders as folder cards or rows.
- Is visually separated from albums by section heading and divider.
- Sorts folders by name in v1.
- Opens the selected folder when clicked.

Album section:

- Reuses existing album cards and table rows where possible.
- Applies existing album sort, group, and view settings to albums only.
- Shows owned and shared albums according to existing filter behavior.
- Shows root albums when there is no placement row for the current user.

Search:

- V1 search searches child folders and albums in the current folder.
- Global cross-folder search is a follow-up.

Organization controls:

- Drag album cards or rows onto folder cards or sidebar folder nodes.
- Add `Move to folder` to the album card context menu.
- Add `Move to folder` to the album detail options menu.
- Add bulk `Move to folder` for selected albums on the albums page.
- Use one folder picker for context menu, album detail, and bulk move.
- The folder picker includes root as `All albums`.
- The move menu is the keyboard-accessible alternative to drag-and-drop.
- Folder menus support create child folder, rename folder, move folder, and
  delete folder.
- Moving a folder uses a folder picker that excludes the folder itself and all of
  its descendants.
- V1 drag-and-drop moves albums only. Folder reparenting uses the folder menu so
  the depth and cycle checks are explicit.
- Dragging an album to its current folder or to root when already at root is a
  no-op.
- Dropping an album onto another album is disabled.
- Bulk move uses the same single-album placement endpoint once per selected
  album. Successful moves stay applied; the UI reports the number of failures if
  any selected albums fail access or validation.

All organization controls call the same placement endpoints. Drag-and-drop is
only a faster UI path.

## Mobile And Sync

V1 is web-first.

Mobile continues to show flat albums. Existing mobile album sync should remain
valid because albums themselves are unchanged. Do not add folder metadata to
`SyncAlbumV1` unless mobile is ready to consume it.

Future mobile folder support should use separate sync entities, for example:

- `AlbumFolderV1`
- `AlbumFolderDeleteV1`
- `AlbumFolderPlacementV1`
- `AlbumFolderPlacementDeleteV1`

This keeps album sync stable and makes folder support opt-in for mobile clients.

## Error Handling

Server errors:

- Return `BadRequestException` for cycles, depth overflow, duplicate sibling
  names, invalid parents, inaccessible albums, and non-empty folder deletes.
- Scope folder reads and writes by `userId`; missing and cross-user folders both
  return `BadRequestException('Album folder not found')`.
- Creating or moving a placement uses the existing album access helper;
  inaccessible albums must be rejected.
- Deleting a missing placement is an idempotent no-op.
- Deleting the current user's placement by `albumId` does not require current
  album access because it only removes private metadata.

Web errors:

- Show a toast when folder create, rename, move, delete, or album move fails.
- On drag failure, leave the album in its original UI location.
- Drag-and-drop updates the UI after the endpoint succeeds. This avoids rollback
  complexity in v1.

## Testing

### TDD Requirement

Implementation must follow red-green-refactor for every behavioral slice:

- Write the smallest meaningful failing test before production code.
- Run the relevant focused test command and confirm it fails for the expected
  reason.
- Implement the minimal production change required to pass.
- Re-run the same focused test and confirm it passes.
- Refactor only while tests are green, then re-run the affected tests.
- Do not add production behavior without a prior failing test unless the change
  is generated code, a mechanical type fix required by generated code, or a
  migration artifact that is covered by a repository or integration test.

Each implementation task should record the red and green commands in the working
notes or PR description so reviewers can see the TDD trail.

### Server Unit Tests

Folder creation and validation:

- create folder at root
- create folder at root when `parentId` is omitted
- create folder at root when `parentId` is `null`
- create folder under folder
- allow folder at exact depth 5
- reject folder at depth 6
- trim folder names before storage
- reject blank or whitespace-only folder names
- reject folder names longer than 100 characters
- reject folder names containing `/`
- reject folder names containing ASCII control characters
- reject duplicate root folder names case-insensitively
- reject duplicate child folder names case-insensitively under the same parent
- allow same folder name under different parents
- reject parent owned by another user

Folder listing:

- list folders and active placements
- list root folders and child folders with correct `parentId`
- return depth for each folder
- do not return another user's folders

Folder updates:

- rename folder
- move folder
- move folder to root
- move folder to root with `parentId: null`
- allow moving a folder to its current parent as a no-op
- reject empty `PATCH`
- reject rename to duplicate sibling name case-insensitively
- reject moving folder under parent owned by another user
- reject moving folder under itself
- reject moving folder under descendant
- reject moving subtree when any descendant would exceed depth 5
- preserve descendants when moving a folder

Folder deletion:

- delete empty folder
- reject deleting folder with child folders
- reject deleting folder with active accessible album placements
- delete folder that has only stale inaccessible placements
- delete user cascades folders and placements

Placement behavior:

- place owned album
- place shared-readable album
- place album shared with viewer/read access
- place album shared with editor/write access
- reject album reachable only through anonymous shared-link access
- reject inaccessible album placement
- reject placement into folder owned by another user
- allow two users to place the same shared album in different private folders
- keep owner placement independent from shared-user placement
- move album between folders
- upsert move leaves exactly one placement row for the user and album
- concurrent moves for the same user and album settle to one placement
- placing an album in its current folder is idempotent
- remove placement to root
- removing placement for an album already at root is idempotent
- removing a stale inaccessible placement succeeds without current album access
- deleting an album cascades placements
- deleting shared access hides the placement without granting access
- restoring shared access can make an existing stale placement visible again if
  it was not otherwise cleaned up
- ensure stale placement for inaccessible shared album is not returned by
  `GET /album-folders`

### Controller And API Tests

- `GET /album-folders` returns only current-user folders and currently
  accessible placements
- `POST /album-folders` validates name, parent ownership, duplicate siblings,
  and max depth
- `PATCH /album-folders/:id` validates ownership, name, cycles, descendants, and
  max depth
- `DELETE /album-folders/:id` validates ownership and non-empty rules
- `PUT /album-folders/:folderId/albums/:albumId` validates folder ownership and
  album access
- `DELETE /album-folders/albums/:albumId` is scoped to the current user's
  placement
- cross-user folder reads and writes return the same "not found" error as a
  missing folder
- API responses are OpenAPI-compatible and include `depth`

### Repository And Migration Tests

Add repository or database-backed tests for:

- depth calculation
- descendants or ancestor lookup for cycle detection
- placement filtering against accessible albums
- duplicate sibling detection with trimmed and case-folded names
- non-empty folder checks for child folders, active placements, and stale
  placements
- unique single-placement constraint `(userId, albumId)`
- future-compatible unique constraint `(userId, folderId, albumId)`
- folder and placement cascade behavior for user delete, folder delete, and
  album delete
- concurrent duplicate folder creation under the same parent rejects one writer
- `updatedAt` and `updateId` change on folder rename, folder move, placement
  create, and placement move
- migration creates indexes on `userId`, `parentId`, `folderId`, `albumId`, and
  `updateId`
- migration rollback drops the new tables, indexes, and constraints cleanly

### Web Component Tests

- renders `Folders` section before `Albums`
- renders folder cards separately from album cards in grid view
- renders folder rows separately from album rows in table/list view
- visually separates folders from albums
- root view includes albums without placements
- root view includes accessible shared albums without placements
- current folder view includes only albums placed in that folder
- current folder view hides albums placed elsewhere
- current folder view includes child folders
- breadcrumbs render the current path and navigate to ancestors
- sidebar tree renders nested folders up to depth 5
- folders sort by name independently from album sort/group settings
- album sort/group/view settings apply only to albums
- current-folder search filters child folders and current-folder albums
- search does not leak albums from other folders
- owned/shared filters keep existing behavior inside folder views
- move-to-folder picker includes root
- move-to-folder picker disables or excludes invalid folder targets when moving
  folders
- move controls are reachable without drag-and-drop
- album card context menu move calls the placement endpoint
- album detail move calls the placement endpoint
- drag-and-drop move calls the same placement endpoint
- drag to current folder is a no-op
- drop onto album is ignored
- bulk move calls the single placement endpoint once per selected album
- bulk move to root calls the delete-placement endpoint once per selected album
- bulk move reports partial failures without reverting successful moves
- moved album disappears from the old folder and appears in the new folder
- failed drag leaves the album in its original UI location
- folder create, rename, move, and delete menus call the folder endpoints
- folder delete disabled or rejected when the folder has child folders or active
  albums
- toasts are shown for folder and placement failures

### Web End-To-End Tests

Add at least one browser-level happy path and one failure path using the repo's
existing web E2E convention:

- create nested folders to depth 5, move an album into a child folder, navigate
  by breadcrumbs, then move it back to root
- attempt to create or move past depth 5 and verify the user sees the failure
  without corrupting the visible tree

### Mobile And Sync Regression Tests

- mobile album list behavior remains flat when folder data exists on the server
- `SyncAlbumV1` does not gain folder fields in v1
- existing album sync tests still pass with folder and placement rows present
- generated mobile/client DTO changes are reviewed to confirm folder APIs are
  additive and do not alter album DTO compatibility

### Generated Artifacts

Generated artifacts must be regenerated and checked:

- regenerate OpenAPI specs
- rebuild TypeScript SDK
- update API mocks/factories as needed

### Completion Gate

The feature is not complete until these checks pass in the implementation PR:

- focused server unit, controller/API, and repository/migration tests for album
  folders
- focused web component tests for folder-aware album browsing and organization
- at least the two web E2E flows listed above
- existing album service, album controller, album DTO, album page, album card,
  album cover, and album selection regression tests
- mobile/sync regression tests or a documented proof that no mobile/sync code path
  changed
- OpenAPI generation, TypeScript SDK build, and API mock/factory updates

Any test from this spec that is intentionally deferred must be called out in the
PR with the reason and follow-up issue.

## Rollout

Existing albums remain at root because there are no placement rows.

Existing shared albums remain visible at root for users who can access them.
Users can move them into private folders without affecting the album owner or any
other user.

No existing album sharing, shared link, or mobile flat album behavior changes.
