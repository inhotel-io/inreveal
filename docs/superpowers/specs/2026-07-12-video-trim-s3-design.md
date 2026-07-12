# Video trim on S3 storage — design

Fixes [#671](https://github.com/open-noodle/gallery/issues/671).

## Problem

`handleVideoTrim` in `server/src/services/media.service.ts` is the only ffmpeg output path in the media pipeline
that never persists its outputs to the write backend, and it can hand an S3-relative key straight to ffmpeg.
Server-side video trim is therefore broken on S3-backed deployments. Disk mode is unaffected.

Three defects, all inside `handleVideoTrim`:

1. **Trimmed video never persisted.** `outputPath` is a local nested path; it goes into the `EncodedVideo`
   `asset_file` row and on to `syncFiles` without a `persistFile` call. On S3 the video is never uploaded and the
   DB records a local path.
2. **Trim thumbnails never persisted.** The files returned by `generateImageThumbnails` (local paths) go straight
   into `syncFiles` with no persist loop, unlike `handleAssetEditThumbnailGeneration`.
3. **S3 key fed to ffmpeg.** `const inputPath = existingEncoded?.path || localPath` — when a prior non-edited
   `EncodedVideo` exists in S3, `existingEncoded.path` is a relative key, passed to `mediaRepository.trim` without
   `ensureLocalFile`, so ffmpeg fails with ENOENT.

### Observed failure modes

- Asset **has** a transcoded (non-edited) `EncodedVideo` — the common case. Defect 3 fires first: ffmpeg gets a
  relative key, the job fails, trim never works.
- Asset has **no** transcoded video. ffmpeg reads the original (already materialized by the caller), so the trim
  "succeeds", but defects 1 and 2 mean the video and its thumbnails exist only on the pod's local disk with
  absolute paths in the DB. Playback works until the pod is replaced, then 404s permanently — `syncFiles` never
  revisits those rows.

### Why CI never caught it

The unit tests for trim (`media.service.spec.ts`) mock storage and assert only ffmpeg arguments, in disk mode.
The MinIO-backed S3 e2e suite (`e2e/src/storage-migration.ts`) lists, as its first known gap, _"No video asset
upload (transcoding too slow/unreliable in e2e)"_. Every S3 output path except the video ones is covered there.
That gap is the hole #671 came through, and closing it is part of this fix.

### Already correct, and therefore out of scope

The serving side is backend-aware: `playbackVideo` selects the edited `EncodedVideo` row
(`orderBy asset_file.isEdited desc` in `AssetRepository.getForVideo`) and passes the path to `serveFromBackend`
→ `StorageService.resolveBackendForKey`. Storing a relative key is sufficient; no changes to playback or download.

## Scope

Fix forward only. Assets already carrying a broken trim on an S3 deployment stay broken until the user re-applies
or undoes the trim in the editor, which rewrites the rows correctly through the fixed path. No repair job, no
migration.

Also unchanged (pre-existing, accepted): if `probe`, `extractFrame`, or thumbnail generation throws _after_ a
successful trim, the exception propagates and the local partial output is left behind. The next successful trim
overwrites it.

## Design

### 1. Prerequisite: make `persistFile` testable

`persistFile` reads the generated file with `createReadStream` imported from `node:fs`. Under vitest the generated
paths do not exist, and because the mocked backend `put` never consumes the stream, the failed open emits an
`'error'` event with no listener — an unhandled error event that crashes or flakes the test process. Nothing in
this file can be tested in S3 mode until that changes.

`asset.service`'s S3 sidecar path already avoids this by streaming through the repository layer
(`storageRepository.createPlainReadStream`, mocked in tests as `mocks.storage.createPlainReadStream`).
`persistFile` adopts the same pattern:

- `createReadStream(localPath)` → `this.storageRepository.createPlainReadStream(localPath)`
- `unlink(localPath)` → `this.storageRepository.unlink(localPath)` (still best-effort; `StorageRepository.unlink`
  warns on ENOENT but rethrows other errors, so keep the surrounding swallow)

For the same reason, `handleVideoTrim`'s two raw `node:fs` unlinks — the partial output on ffmpeg failure and the
extracted frame temp — move to `this.storageRepository.unlink(...).catch(() => {})`, which makes the failure-path
cleanup assertable.

Production behaviour is identical. This is a pure refactor, guarded by the existing suite: it must go in first and
turn the suite green with **zero test changes**.

### 2. `StorageCore`: one filename convention, two forms

The edited encoded video needs an S3 key. The existing `getRelativeEncodedVideoPath(asset)` returns the
**non-edited** key (`…/{id}.mp4`), so reusing it would make a trim overwrite the asset's transcoded original in the
bucket — a worse bug than the one being fixed.

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

The key is deterministic per asset, so a re-trim overwrites the same object in place. `syncFiles` then sees an
unchanged path and correctly queues no `FileDelete` — if the key ever became non-deterministic, `syncFiles` would
delete the object we had just uploaded. Test D3 locks this down.

### 3. `MediaService`: extract `persistImageFiles`

The persist loop (derive the relative key from `fileType` / `format` / `isEdited`, `persistFile`, reassign
`file.path`) exists **three times** already:

- `handleAssetEditThumbnailGeneration`, over `generated.files`
- `handleGenerateThumbnails`, over `generated.files`
- `handleGenerateThumbnails`, again over `editedGenerated.files`

and is needed a fourth time in `handleVideoTrim`. Forgetting it is precisely defect 2. Extract it and route all
four call sites through it:

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

All four loops are fork-only lines, so this adds no upstream-rebase risk.

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
must run before it. Persisting eagerly right after `trim` is the natural-looking mistake, and it would break frame
extraction on S3 while still satisfying every persistence assertion. Test D1 asserts the call order; carry an
inline comment too.

In disk mode `persistFile` returns the absolute path unchanged, so disk behaviour is byte-for-byte what it is today.

### 5. Error handling

Unchanged in shape: an ffmpeg failure logs, unlinks the partial output, and returns `JobStatus.Failed`. One
addition — the encoded-input temp file is released in a `finally` around the trim, so a failed trim does not leak a
downloaded S3 temp. The original's temp file is already cleaned by the caller's `finally` in
`handleAssetEditThumbnailGeneration`.

## Testing

### Test mechanics (get these wrong and the suite lies)

- **`server/test/vitest.config.mjs` sets no `restoreMocks` / `mockReset`, and there are no `setupFiles`.** A
  `vi.spyOn(StorageService, 'getWriteBackend')` therefore leaks into every later test in the file, silently running
  the disk-mode tests against an S3 backend. The S3 tests must restore their spies in `afterEach`.
- **Disk mode in unit tests works because `StorageService.diskBackend` is `undefined` in this spec file**, so
  `persistFile` takes its `!writeBackend` branch. That is load-bearing — do not "fix" it by constructing a
  `DiskStorageBackend`.
- S3 mode is simulated by spying `StorageService.getWriteBackend` to return a fake backend (any object that is not
  a `DiskStorageBackend` takes the S3 branch), plus a `resolveBackendForKey` stub whose `downloadToTemp` backs
  `ensureLocalFile`.

### Unit tests — `server/src/services/media.service.spec.ts`

`persistFile` refactor guards:

- **A1** S3: uploads via `storageRepository.createPlainReadStream` → `backend.put(key, stream, { contentType })`,
  then unlinks the local temp.
- **A2** Disk: returns the local path, calls no `put`, and **does not unlink** — a regression guard against
  deleting the file we just wrote.

Input materialization (defect 3):

- **B1** S3, asset has a non-edited `EncodedVideo` with a relative key → `mediaRepository.trim` receives the temp
  local path, not the key, and that temp's `cleanup` runs.
- **B2** Disk, same setup with an absolute path → `trim` receives it unchanged, with no download attempted.
- **B3** No `EncodedVideo` at all → `trim` receives the caller's already-materialized `localPath`; no extra download.

Persistence (defects 1 and 2):

- **C1** S3: `put` called with `encoded-video/{ownerId}/{xx}/{yy}/{id}_edited.mp4` and `video/mp4`; the upserted
  `EncodedVideo` row carries that key, not an absolute path.
- **C2** S3: `put` called for preview and thumbnail with `_edited` relative keys, and those keys are what reach
  `upsertFiles`.
- **C3** S3 collision guards: the video key differs from `StorageCore.getRelativeEncodedVideoPath(asset)`, and no
  `put` targets a non-edited thumbnail key — a trim must never overwrite the asset's transcoded original or its
  normal preview/thumbnail objects.
- **C4** Disk: existing trim tests still pass, paths stay absolute, no `put` occurs.

Invariants and failure paths:

- **D1** Ordering: the video `put` happens **after** `extractFrame` (assert via `invocationCallOrder`), proving the
  local file still existed when the frame was pulled.
- **D2** S3 trim failure: returns `JobStatus.Failed`, calls no `put`, runs the encoded temp's `cleanup`, and unlinks
  the partial output.
- **D3** Re-trim idempotency: asset already has edited files at the same keys → no `FileDelete` job is queued for
  the edited video key.

### E2E — new `video-trim-s3` phase in the MinIO harness

`e2e/src/storage-migration.ts` runs a real server against real MinIO with `IMMICH_STORAGE_BACKEND=s3` and already
provides every helper needed: `api`, `uploadAsset`, `waitForProcessing`, `queryDb`, `dockerExec`, `minioFileExists`,
`diskFileExists`. This phase reproduces #671 exactly, so it must be seen **failing against unfixed code** before the
fix lands.

Arrange (server in s3 write mode):

1. Force transcoding so the defect-3 precondition exists: set `ffmpeg.transcode = 'all'` through the system-config
   API (mirroring `setStorageTemplate`), and restore the original config at the end of the phase.
2. Build a tiny mp4 without committing a binary fixture: `dockerExec('immich-server', …)` runs ffmpeg's `lavfi`
   test source (a couple of seconds, small frame size), base64s it, and the runner decodes it into a Buffer.
3. Upload it, `waitForProcessing`, then assert the precondition holds: a non-edited `EncodedVideo` row with a
   relative path, whose object exists in MinIO. Record its `mc stat` size/etag.

Act: `PUT /assets/{id}/edits` with a Trim action, then `waitForProcessing`.

Assert:

- Every `isEdited` `asset_file` row (encoded video, preview, thumbnail) has a **relative** path.
- The edited video key is `encoded-video/{ownerId}/{xx}/{yy}/{id}_edited.mp4` and the object **exists in MinIO**.
- Each edited thumbnail key contains `_edited` and exists in MinIO.
- The **non-edited** encoded object still exists with an unchanged size/etag — the collision guard, end to end.
- `GET /assets/{id}/video/playback` returns 200 (the trimmed video is served from S3).
- `asset.duration` matches the trimmed length.
- `diskFileExists(<local encoded-video path>)` is **false** — proof the output was uploaded and the local copy
  released, not merely written to the pod's disk.
- The server log for the phase contains no `FFmpeg trim failed` and no ENOENT.

Teardown: delete the asset, empty the trash, restore the ffmpeg config, so the phase leaves the suite state as it
found it. This matters because `migrate-to-disk` runs afterwards and has never seen `encoded-video` rows; leaving
them behind risks destabilising an existing phase. **During implementation, confirm `phaseMigrateToDisk` still
passes with this phase in the sequence.**

Wiring: add the phase to the `switch` in `storage-migration.ts`, to the full-workflow sequence in
`storage-migration.sh`, and to the `backend=s3` phase group in `.github/workflows/storage-migration-tests.yml` —
**only after it runs green three consecutive times locally.** If it proves flaky, it stays a local make target and
the PR says so. No flaky test gets wired into CI.

## Implementation order (TDD)

1. **Refactor `persistFile` and the trim unlinks onto `storageRepository`.** No new tests, no behaviour change;
   the existing `media.service.spec.ts` suite must stay green as the guard.
2. **Write the e2e `video-trim-s3` phase and run it against unfixed code.** It must fail, and fail for the right
   reason — the trim job erroring on the S3 key. This proves the phase can actually detect #671.
3. **B1 red → green**: `ensureLocalFile` on the encoded input, cleanup in `finally`. B2 and B3 alongside.
4. **C1 red → green**: `StorageCore` statics, `persistFile` on the trimmed video.
5. **C2 red → green**: extract `persistImageFiles`, route all four call sites through it.
6. **C3, D1, D2, D3** as guards; **A1, A2** to close out `persistFile`; **C4** confirms disk mode is untouched.
7. **Rerun the e2e phase — now green.** Then run it three times consecutively to earn its place in CI.

## Verification

- `cd server && pnpm test -- --run src/services/media.service.spec.ts`, then the full server unit suite.
- `cd e2e && ./storage-migration.sh --phase video-trim-s3` (red before the fix, green after; ×3 for stability), and
  a full `./storage-migration.sh --cleanup` run to prove no existing phase regressed. Note this stack binds the same
  ports as the e2e stack (:2285, pg :5435) — do not run it alongside `make dev` or `make e2e`.
- Optional but recommended before release: RC build to the personal instance (real S3 on OVH) and trim a video that
  already has a transcoded version — the exact shape that fails today.

## Files touched

- `server/src/cores/storage.core.ts` — three fork-only statics.
- `server/src/services/media.service.ts` — `persistFile` streaming source, the two trim unlinks, `persistImageFiles`
  extraction and its four call sites, `handleVideoTrim` rewrite.
- `server/src/services/media.service.spec.ts` — the twelve tests above.
- `e2e/src/storage-migration.ts` — `video-trim-s3` phase and its switch entry.
- `e2e/storage-migration.sh` — phase in the full-workflow sequence.
- `.github/workflows/storage-migration-tests.yml` — phase in the `backend=s3` group (only if stable).
- `e2e/README-storage-migration.md` — drop the "no video asset upload" known gap, document the new phase.
