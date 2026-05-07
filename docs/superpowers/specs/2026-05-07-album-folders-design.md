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
- No cascade folder deletion in v1.
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
- Moving a folder must reject cycles.
- Deleting a folder succeeds only when it has no child folders and no album
  placements.
- Deleting a user cascades their folders and placements.

Placements:

- A user can place an owned album or an album currently shared with them.
- Placing an album validates `AlbumRead` access for the current user.
- Moving an album from one folder to another upserts the user's placement row.
- Moving an album to root deletes the user's placement row.
- A user cannot create or delete another user's placement.
- A placement for a no-longer-accessible shared album must not make that album
  visible. The row can remain until opportunistic cleanup.

Album semantics:

- Album asset membership is unchanged.
- Album sharing is unchanged.
- Album public links are unchanged.
- Album thumbnails, counts, date ranges, downloads, timeline queries, and map
  markers are still computed from the album's direct assets only.

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
- `DELETE /album-folders/:id` deletes an empty folder only.
- `PUT /album-folders/:folderId/albums/:albumId` places or moves an accessible
  album into the target folder.
- `DELETE /album-folders/albums/:albumId` removes the current user's placement
  for that album and returns it to root.

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
- Album placement access uses the existing album access helper; inaccessible
  albums must be rejected.
- Deleting a missing placement is an idempotent no-op.

Web errors:

- Show a toast when folder create, rename, move, delete, or album move fails.
- On drag failure, leave the album in its original UI location.
- Drag-and-drop updates the UI after the endpoint succeeds. This avoids rollback
  complexity in v1.

## Testing

Server unit tests:

- create folder at root
- create folder under folder
- list folders and active placements
- rename folder
- move folder
- reject parent owned by another user
- reject cycles
- reject depth over 5
- reject duplicate sibling name
- delete empty folder
- reject deleting folder with child folders
- reject deleting folder with album placements
- place owned album
- place shared-readable album
- reject inaccessible album placement
- move album between folders
- remove placement to root
- ensure stale placement for inaccessible shared album is not returned by
  `GET /album-folders`

Repository/query tests where practical:

- depth calculation
- descendants or ancestor lookup for cycle detection
- placement filtering against accessible albums
- non-empty folder checks

Web tests:

- renders `Folders` section before `Albums`
- renders folder cards separately from album cards
- root view includes albums without placements
- current folder view includes only albums placed in that folder
- move-to-folder picker includes root
- context menu move calls placement endpoint
- drag-and-drop move calls the same placement endpoint
- bulk move calls the same placement endpoint
- moved album disappears from the old folder and appears in the new folder

Generated artifacts:

- regenerate OpenAPI specs
- rebuild TypeScript SDK
- update API mocks/factories as needed

## Rollout

Existing albums remain at root because there are no placement rows.

Existing shared albums remain visible at root for users who can access them.
Users can move them into private folders without affecting the album owner or any
other user.

No existing album sharing, shared link, or mobile flat album behavior changes.
