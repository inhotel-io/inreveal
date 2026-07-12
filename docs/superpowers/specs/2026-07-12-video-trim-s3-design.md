# Video trim on S3 storage — design

Fixes [#671](https://github.com/open-noodle/gallery/issues/671).

## Problem

`handleVideoTrim` in `server/src/services/media.service.ts` is the only ffmpeg output path in the media
pipeline that never persists its outputs to the write backend, and it can hand an S3-relative key straight
to ffmpeg. Server-side video trim is therefore broken on S3-backed deployments. Disk mode is unaffected.

Three defects, all inside `handleVideoTrim`:

1. **Trimmed video never persisted.** `outputPath` is a local nested path; it goes into the `EncodedVideo`
   `asset_file` row and on to `syncFiles` without a `persistFile` call. On S3 the video is never uploaded and
   the DB records a local path.
2. **Trim thumbnails never persisted.** The files returned by `generateImageThumbnails` (local paths) go
   straight into `syncFiles` with no persist loop, unlike `handleAssetEditThumbnailGeneration`.
3. **S3 key fed to ffmpeg.** `const inputPath = existingEncoded?.path || localPath` — when a prior non-edited
   `EncodedVideo` exists in S3, `existingEncoded.path` is a relative key, passed to `mediaRepository.trim`
   without `ensureLocalFile`, so ffmpeg fails with ENOENT.

### Observed failure modes

- Asset **has** a transcoded (non-edited) `EncodedVideo` — the common case. Defect 3 fires first: ffmpeg gets a
  relative key, the job fails, trim never works.
- Asset has **no** transcoded video. ffmpeg reads the original (already materialized by the caller), so the trim
  "succeeds", but defects 1 and 2 mean the video and its thumbnails exist only on the pod's local disk with
  absolute paths in the DB. Playback works until the pod is replaced, then 404s permanently — `syncFiles` never
  revisits those rows.

### Already correct, and therefore out of scope

The serving side is backend-aware: `playbackVideo` selects the edited `EncodedVideo` row
(`orderBy asset_file.isEdited desc` in `AssetRepository.getForVideo`) and passes the path to `serveFromBackend`
→ `StorageService.resolveBackendForKey`. Storing a relative key is sufficient; no changes to playback or download.

## Scope

Fix forward only. Assets already carrying a broken trim on an S3 deployment stay broken until the user re-applies
or undoes the trim in the editor, which rewrites the rows correctly through the fixed path. No repair job and no
migration.

## Design

### 1. Prerequisite: make `persistFile` testable

`persistFile` reads the generated file with `createReadStream` imported from `node:fs`. Under vitest the generated
paths do not exist, and because the mocked backend `put` never consumes the stream, the failed open emits an
`'error'` event with no listener — an unhandled error event that crashes or flakes the test process. This is the
likely reason no S3 test exists for this file today.

`asset.service`'s S3 sidecar path already avoids this by streaming through the repository layer
(`storageRepository.createPlainReadStream`, mocked in tests as `mocks.storage.createPlainReadStream`).
`persistFile` adopts the same pattern:

- `createReadStream(localPath)` → `this.storageRepository.createPlainReadStream(localPath)`
- `unlink(localPath)` → `this.storageRepository.unlink(localPath)` (still best-effort, error swallowed)

Production behaviour is identical. This change is what makes every test below possible.

### 2. `StorageCore`: one filename convention, two forms

The edited encoded video needs an S3 key. The existing `getRelativeEncodedVideoPath(asset)` returns the
**non-edited** key (`…/{id}.mp4`), so reusing it would make a trim overwrite the transcoded original in the bucket.

Add fork-only statics next to the existing relative-key block, deriving both the local path and the S3 key from a
single private filename helper, and leave upstream's `getEncodedVideoPath` untouched (keeps upstream rebases clean):

```ts
private static getEditedEncodedVideoFilename(asset: ThumbnailPathEntity): string {
  return `${asset.id}_edited.mp4`;
}

static getEditedEncodedVideoPath(asset: ThumbnailPathEntity): string {
  return StorageCore.getNestedPath(
    StorageFolder.EncodedVideo,
    asset.ownerId,
    StorageCore.getEditedEncodedVideoFilename(asset),
  );
}

static getRelativeEditedEncodedVideoPath(asset: ThumbnailPathEntity): string {
  return StorageCore.getRelativeNestedPath(
    StorageFolder.EncodedVideo,
    asset.ownerId,
    StorageCore.getEditedEncodedVideoFilename(asset),
  );
}
```

`handleVideoTrim` uses `getEditedEncodedVideoPath` for its local output instead of the inline
`getNestedPath(..., \`${asset.id}\_edited.mp4\`)` it has today, so the convention lives in exactly one place.

### 3. `MediaService`: extract `persistImageFiles`

The persist loop (derive the relative key from `fileType` / `format` / `isEdited`, `persistFile`, reassign
`file.path`) exists twice already and is needed a third time. Forgetting it is precisely defect 2. Extract it:

```ts
private async persistImageFiles(asset: ThumbnailAsset, files: UpsertFileOptions[]) {
  for (const file of files) {
    const relativeKey = StorageCore.getRelativeImagePath(asset, {
      fileType: file.type,
      format: file.path.split('.').pop() as ImageFormat,
      isEdited: file.isEdited,
    });
    file.path = await this.persistFile(file.path, relativeKey, mimeTypes.lookup(file.path));
  }
}
```

Route all three call sites through it: `handleAssetEditThumbnailGeneration`, `handleGenerateThumbnails`, and the
new `handleVideoTrim` persist step. All three loops are fork-only lines, so this adds no upstream-rebase risk.

### 4. `handleVideoTrim`: the three fixes and their ordering

```
existingEncoded → ensureLocalFile()                     ← fix 3
  inputPath = encodedLocal?.localPath ?? localPath
  trim(inputPath, outputPath)                            ← outputPath = getEditedEncodedVideoPath(asset)
  finally: await encodedLocal?.cleanup()
probe(outputPath)                        ─┐
extractFrame(outputPath, framePath)      ─┤ every local read of outputPath
generateImageThumbnails(frame)           ─┘
persistImageFiles(asset, thumbnailResult.files)          ← fix 2
editedVideoFile.path = await persistFile(
  outputPath, StorageCore.getRelativeEditedEncodedVideoPath(asset), 'video/mp4')   ← fix 1
syncFiles(oldEdited, [editedVideoFile, ...thumbnailResult.files])
thumbhash update (unchanged)
```

The load-bearing invariant: **`persistFile` unlinks the local file after upload**, so probe and frame extraction
must run before it. Persisting eagerly right after `trim` is the natural-looking mistake and would break frame
extraction on S3. Carry an inline comment saying so.

In disk mode `persistFile` returns the absolute path unchanged, so disk behaviour is byte-for-byte what it is today.

### 5. Error handling

Unchanged in shape: an ffmpeg failure logs, unlinks the partial output, and returns `JobStatus.Failed`. One
addition — the encoded-input temp file is released in a `finally` around the trim, so a failed trim does not leak a
downloaded S3 temp file. The original's temp file is already cleaned by the caller's `finally` in
`handleAssetEditThumbnailGeneration`.

## Testing

TDD, unit tests in `server/src/services/media.service.spec.ts`. S3 mode is simulated with
`vi.spyOn(StorageService, 'getWriteBackend')` returning a fake backend — not a `DiskStorageBackend`, so
`persistFile` takes the S3 branch — plus a `resolveBackendForKey` stub backing `ensureLocalFile`.

1. **Input is materialized** — with a non-edited `EncodedVideo` whose path is a relative key, `mediaRepository.trim`
   receives the temp local path, not the key, and the temp file's cleanup runs.
2. **Trimmed video is persisted** — `backend.put` is called with `encoded-video/{ownerId}/{xx}/{yy}/{id}_edited.mp4`
   and content type `video/mp4`; the upserted `EncodedVideo` row carries that key, not an absolute path.
3. **Thumbnails are persisted** — `put` is called for preview and thumbnail with `_edited` relative keys, and those
   keys are what reach `upsertFiles`.
4. **Collision guard** — the persisted video key differs from `StorageCore.getRelativeEncodedVideoPath(asset)`, so a
   trim can never overwrite the transcoded original.
5. **Disk-mode regression** — the existing trim tests still pass with absolute paths, and no `put` occurs.

No e2e coverage: the e2e stack is disk-backed, so an S3 trim test would need infrastructure that suite does not
have. The unit tests are the gate.

## Files touched

- `server/src/cores/storage.core.ts` — three fork-only statics.
- `server/src/services/media.service.ts` — `persistFile` streaming source, `persistImageFiles` extraction and its
  three call sites, `handleVideoTrim` rewrite.
- `server/src/services/media.service.spec.ts` — the five tests above.
