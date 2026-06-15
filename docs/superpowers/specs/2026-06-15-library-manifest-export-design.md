# Library Manifest Export Endpoint Design

## Context

Users who store their library in object storage need a way to export everything they own — a
data-portability / "takeout" capability. The goal is not for the server to build and serve a zip
archive (it already supports downloading selected assets); it is to expose a **manifest**: a complete,
machine-readable listing of a user's original files with their object-storage keys, integrity
checksums, basic file metadata, and album membership. A caller (an export/backup tool, or an operator
acting on a user's behalf) uses the manifest to fetch each object directly from storage — a no-copy
export that never streams the bytes back through the server.

There is no such listing today. The closest existing surfaces — the timeline/search APIs and the
selected-assets download — neither expose storage object keys + checksums nor guarantee complete,
stable coverage of everything a user owns across all visibilities.

## Goals

- Add an admin API endpoint that returns a **complete, paginated manifest** of a target user's owned,
  non-trashed assets across **all** visibilities (timeline, archived, hidden/locked).
- Each entry carries enough to download and verify the original object and reconstruct album
  organization: object key, checksum (+ algorithm), size, original filename, timestamps, type, album ids.
- Stable pagination that does not skip or duplicate existing rows if the library changes during a long
  export (keyset/cursor).
- A versioned response envelope so consumers can guard against breaking changes.

## Non-Goals (out of scope for this slice)

- Derived objects (thumbnails, previews, encoded video, sidecars) — regenerable; not part of an
  originals export.
- Rich per-asset metadata (EXIF/GPS, people/faces, tags, descriptions, ratings) — a larger,
  multi-table follow-up.
- A self-service variant (a user exporting their own library) — admin-scoped only for now.
- The server building/serving an archive — this is a manifest only; the caller fetches the objects.

## API Contract

### Route & auth

```
GET /api/admin/users/:id/library-manifest?cursor=<assetId>
```

- **Auth:** `@Authenticated({ permission: Permission.AdminUserRead, admin: true })` — admin-only,
  matching the existing `/admin/users/:id` endpoints.
- **`:id`** — the target user's id (`UUIDParamDto`). `404` if no such user.
- **`cursor`** (optional) — the `assetId` returned as `nextCursor` by the previous page. Absent on the
  first request. `400` if present but not a valid UUID.

### Response

```jsonc
{
  "manifestSchemaVersion": 1,                       // bump on breaking changes; consumers must guard
  "generatedAt": "2026-06-15T12:00:00.000Z",        // ISO-8601, when this page was generated
  "owner": { "id": "<uuid>", "email": "<string>" }, // the target user
  "albums": [ { "id": "<uuid>", "name": "<string>" } ], // all of the user's albums; maps albumIds -> names
  "assets": [ /* ManifestAssetItem, this page */ ],
  "nextCursor": "<assetId>"                          // pass back as ?cursor to get the next page; null when exhausted
}
```

- `albums` is the user's full album list and is repeated on **every** page so each page is
  self-contained (the list is small — tens of entries — and lets a consumer that starts mid-stream
  still resolve album names).
- `nextCursor` is the `assetId` of the last asset in this page **iff** more pages remain, else `null`.

### ManifestAssetItem

```jsonc
{
  "assetId": "<uuid>",
  "objectKey": "<string>",       // = asset.originalPath; the object key under the object-storage backend
  "originalFileName": "<string>",
  "checksum": "<base64>",        // base64-encoded asset checksum
  "checksumAlgorithm": "sha1",   // from the asset's checksumAlgorithm
  "size": 123456,                // bytes; null if unknown (no metadata row)
  "type": "IMAGE",               // the asset's type enum, serialized as-is (e.g. IMAGE, VIDEO, …)
  "fileCreatedAt": "<ISO-8601>",
  "fileModifiedAt": "<ISO-8601>",
  "albumIds": [ "<uuid>", "..." ] // albums this asset belongs to (possibly empty)
}
```

### Errors

| Status | When |
|---|---|
| `401` | unauthenticated |
| `403` | authenticated but not an admin / lacks `AdminUserRead` |
| `404` | user `:id` does not exist |
| `400` | `cursor` present but not a valid UUID |
| `200` | empty library or a cursor past the end → `assets: []`, `nextCursor: null` |

## Behavior & Semantics

### Which assets

Included: `ownerId = :id AND deletedAt IS NULL`, across **all** visibilities (timeline + archived +
hidden/locked). Excluded: trashed/soft-deleted assets and any asset owned by someone else (e.g.
shared *to* this user). This is the "everything I own that still exists" set.

> Note: this deliberately includes hidden/locked-folder assets — they are the user's data and an
> export must be complete.

### Pagination (keyset)

Order by `asset.id` ascending; page with a keyset predicate rather than `OFFSET`:

```sql
WHERE asset.ownerId = :id
  AND asset.deletedAt IS NULL
  AND (:cursor IS NULL OR asset.id > :cursor)
ORDER BY asset.id ASC
LIMIT :pageSize + 1
```

Fetch `pageSize + 1` rows; if more than `pageSize` come back, trim to `pageSize` and set `nextCursor`
to the last kept row's id, else `nextCursor = null`. `pageSize` is a server constant
(`MANIFEST_PAGE_SIZE`, default **1000**; tunable, no client override for now).

Keyset paging is stable across a long export: rows inserted after the cursor are simply picked up,
rows deleted are skipped, and no existing row is ever skipped or duplicated — unlike `OFFSET`.

### Album membership

For the page's asset ids, resolve album ids in **one** grouped query against the album↔asset join
(`SELECT assetId, array_agg(albumId) ... WHERE assetId = ANY(:ids) GROUP BY assetId`), then attach
`albumIds` per asset (default `[]`). No N+1.

### Field sourcing

- `objectKey` = `asset.originalPath`. For an object-storage backend this is the object key; documented
  as such. (On a filesystem backend it is a path; the export use case assumes object storage.)
- `checksum` = base64 of the stored checksum buffer; `checksumAlgorithm` from the asset.
- `size` — the original file's byte size. **Implementation must confirm the exact source column**
  (the metadata/EXIF row's file-size field); `null` when no metadata row exists.
- `type` — the asset's type enum, serialized as-is (whatever types the library holds; all owned,
  non-trashed assets are included regardless of type).
- timestamps — ISO-8601 from `fileCreatedAt` / `fileModifiedAt`.

### Schema version

`manifestSchemaVersion: 1`. Additive, backward-compatible changes do not bump it; removing/renaming a
field or changing semantics bumps it. Consumers should reject an unknown major version.

## Implementation Outline

Follow the existing controller → service → repository layering and the Zod-DTO + generated-OpenAPI
conventions.

- **Controller** — a focused `LibraryManifestController` (or a route on the admin-users controller)
  exposing `GET admin/users/:id/library-manifest`, guarded `admin: true` + `Permission.AdminUserRead`,
  `:id` via `UUIDParamDto`, `cursor` via a small query DTO.
- **Service** — a dedicated `LibraryManifestService` method: resolve + 404 the target user, run the
  keyset asset query, run the grouped album-ids query, run the user's albums query, map rows to DTOs,
  compute `nextCursor`, stamp `generatedAt` + `manifestSchemaVersion`.
- **Repository** — add narrow methods (e.g. asset repo: owned-assets keyset query; album repo:
  album-ids-for-assets and albums-for-user). Keep mapping in the service.
- **DTOs** — `ManifestResponseDto` + `ManifestAssetItemDto` as Zod schemas with `.meta({ id })` for
  OpenAPI; regenerate the OpenAPI SDK afterwards.
- **Permission** — reuse `Permission.AdminUserRead`.

## Testing

- **Service spec (Vitest, mocked repositories):** keyset boundary (`nextCursor` set iff `pageSize+1`
  fetched; trimmed correctly); album-id grouping (single query, correct per-asset mapping, empty →
  `[]`); checksum base64 + algorithm; visibility/trash filter (all visibilities included, trashed
  excluded); owner scoping (only the target user's assets); empty library and past-end cursor →
  `assets: []`, `nextCursor: null`; `generatedAt` + `manifestSchemaVersion` present.
- **Controller spec:** admin guard enforced (`401`/`403`); `404` for a missing user; `400` for an
  invalid cursor.
- **Optional e2e:** a seeded user with assets across visibilities + albums; paginate to exhaustion and
  assert complete, non-duplicated coverage and correct `objectKey`/`albumIds`.

## Open Implementation Details To Verify

- Exact source column for `size` (the metadata/EXIF file-size field) and the `checksumAlgorithm` enum
  values.
- That `originalPath` is stored as the raw object key (no leading slash) under the object-storage
  backend.
- Final controller placement (dedicated controller vs. a route on the admin-users controller) — pick
  whichever matches the codebase's grouping once in the code.
