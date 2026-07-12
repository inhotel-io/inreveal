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

The unit tests for trim mock storage and assert only ffmpeg arguments, in disk mode. The MinIO-backed S3 e2e suite
(`e2e/src/storage-migration.ts`, 20 phases, gated by `.github/workflows/storage-migration-tests.yml`) lists as its
first known gap: _"No video asset upload (transcoding too slow/unreliable in e2e)"_. Every S3 output path except
the video ones is covered there. That gap is the hole #671 came through, and closing it is part of this fix.

### Already correct, and therefore out of scope

The serving side is backend-aware: `playbackVideo` selects the edited `EncodedVideo` row
(`orderBy asset_file.isEdited desc` in `AssetRepository.getForVideo`) and passes the path to `serveFromBackend`
→ `StorageService.resolveBackendForKey`. Storing a relative key is sufficient; no changes to playback or download.

Realtime HLS ([#741](https://github.com/open-noodle/gallery/issues/741)) reads `asset.originalPath` only
(`transcoding.service.ts:227`) and never consults the `EncodedVideo` rows, so this fix neither triggers nor
half-fixes it. #741 lands afterwards and depends on this: it needs the trimmed video to actually exist in the
bucket, and inherits the `StorageCore` helpers added here to locate it.

## Scope

Fix forward only. Assets already carrying a broken trim on an S3 deployment stay broken until the user re-applies
or undoes the trim in the editor, which rewrites the rows correctly through the fixed path. No repair job, no
migration.

Also unchanged (pre-existing, accepted): if `probe`, `extractFrame`, or thumbnail generation throws _after_ a
successful trim, the exception propagates and the local partial output is left behind. The next successful trim
overwrites it.

The local disk path of the trimmed video is **unchanged** by this work — `StorageCore.getEditedEncodedVideoPath`
produces exactly what the current inline `getNestedPath(EncodedVideo, ownerId, \`${asset.id}\_edited.mp4\`)`
produces — so disk-mode deployments need no data migration.

## Design

### 1. Prerequisite: make `persistFile` testable

`persistFile` reads the generated file with `createReadStream` imported from `node:fs`. Under vitest those paths do
not exist, and because the mocked backend `put` never consumes the stream, the failed open emits an `'error'` event
with no listener — an unhandled error event that crashes or flakes the run. **Nothing in this file can be tested in
S3 mode until that changes**, which is why no such test exists today.

`asset.service`'s S3 sidecar path already avoids this by streaming through the repository layer
(`storageRepository.createPlainReadStream`, mocked as `mocks.storage.createPlainReadStream`). `persistFile` adopts
the same pattern:

- `createReadStream(localPath)` → `this.storageRepository.createPlainReadStream(localPath)`
- `unlink(localPath)` → `this.storageRepository.unlink(localPath)` (still best-effort; `StorageRepository.unlink`
  warns on ENOENT but rethrows other errors, so keep the surrounding swallow)

For the same reason, `handleVideoTrim`'s two raw `node:fs` unlinks — the partial output on ffmpeg failure, and the
extracted frame temp — move to `this.storageRepository.unlink(...).catch(() => {})`, which makes failure-path
cleanup assertable.

Production behaviour is identical.

### 2. `StorageCore`: one filename convention, two forms

The edited encoded video needs an S3 key. The existing `getRelativeEncodedVideoPath(asset)` returns the
**non-edited** key (`…/{id}.mp4`), so reusing it would make a trim overwrite the asset's transcoded original in the
bucket — a worse bug than the one being fixed.

Add fork-only statics next to the existing relative-key block, deriving both the local path and the S3 key from one
private filename helper, and leave upstream's `getEncodedVideoPath` untouched (keeps upstream rebases clean):

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

Note the two-level nesting is derived from the **filename**, not the id (`filename.slice(0, 2)` / `slice(2, 4)`), so
`{id}_edited.mp4` lands in the same `{xx}/{yy}` folder as `{id}.mp4` — the keys differ only in the basename.

The key is deterministic per asset, so a re-trim overwrites the same object in place. `syncFiles` then sees an
unchanged path and correctly queues no `FileDelete`. If the key ever became non-deterministic, `syncFiles` would
delete the object we had just uploaded — test D3 locks that down.

### 3. `MediaService`: extract `persistImageFiles`

The persist loop (derive the relative key from `fileType` / `format` / `isEdited`, `persistFile`, reassign
`file.path`) exists **three times** already:

- `handleAssetEditThumbnailGeneration`, over `generated.files`
- `handleGenerateThumbnails`, over `generated.files`
- `handleGenerateThumbnails`, again over `editedGenerated.files`

and is needed a fourth time in `handleVideoTrim`. Forgetting it is precisely defect 2. Extract it and route all four
call sites through it:

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

The load-bearing invariant: **`persistFile` unlinks the local file after upload**, so probe and frame extraction must
run before it. Persisting eagerly right after `trim` is the natural-looking mistake, and it would break frame
extraction on S3 while still satisfying every persistence assertion. Test D1 asserts the call order; carry an inline
comment too.

`storageCore.ensureFolders(outputPath)` stays: even on S3 the file is written locally first, then uploaded and
unlinked.

In disk mode `persistFile` returns the absolute path unchanged, so disk behaviour is byte-for-byte what it is today.

### 5. Error handling

Unchanged in shape: an ffmpeg failure logs, unlinks the partial output, and returns `JobStatus.Failed`. One addition
— the encoded-input temp file is released in a `finally` around the trim, so a failed trim does not leak a downloaded
S3 temp. The original's temp file is already cleaned by the caller's `finally` in `handleAssetEditThumbnailGeneration`.

## Test mechanics (get these wrong and the suite lies)

- **`server/test/vitest.config.mjs` sets no `restoreMocks` / `mockReset`, and there are no `setupFiles`.** A
  `vi.spyOn(StorageService, 'getWriteBackend')` therefore leaks into every later test in the file, silently running
  the disk-mode tests against an S3 backend. Every S3 test must restore its spies in `afterEach`.
- **Disk mode in unit tests works because `StorageService.diskBackend` is `undefined` in this spec file**, so
  `persistFile` takes its `!writeBackend` branch. That is load-bearing — do not "fix" it by constructing a
  `DiskStorageBackend`.
- S3 mode is simulated by spying `StorageService.getWriteBackend` to return a fake backend (any object that is not a
  `DiskStorageBackend` takes the S3 branch), plus a `resolveBackendForKey` stub whose `downloadToTemp` backs
  `ensureLocalFile`.
- `persistFile` is private; call it directly as `(sut as any).persistFile(...)`, following the precedent of
  `asset.service.spec.ts`'s `copySidecar` tests.

## Every test must be seen failing

Two kinds of test appear below, and they are **not** interchangeable:

- **RED** — fails against the code as it stands when the slice begins. The expected failure is named; if it fails for
  a different reason, stop and find out why.
- **GUARD** — passes on arrival (it pins behaviour that is already correct and must stay correct). A guard that has
  never failed proves nothing, so each one names a **mutation**: make that change, watch the guard fail, revert. A
  guard that survives its mutation is a bug in the test.

## Slices

### Slice 1 — Reproduce #671 on real S3 (e2e, unwired)

Author the `video-trim-s3` phase in the MinIO harness and **watch it fail against unfixed code**. Commit it wired
into the `switch` in `storage-migration.ts` only — **not** into `storage-migration.sh` or the CI workflow, which run
an explicit phase list. An unwired phase is inert, so every intermediate commit on this branch keeps CI green. Slice
6 wires it up once it's green.

`e2e/src/storage-migration.ts` provides every helper needed: `api`, `uploadAsset`, `waitForProcessing`, `queryDb`,
`dockerExec`, `minioFileExists`, `diskFileExists`.

Arrange (server in s3 write mode):

1. Force transcoding so the defect-3 precondition exists: set `ffmpeg.transcode = 'all'` through the system-config
   API (mirror `setStorageTemplate`), restoring the original config in the phase's teardown.
2. Build a tiny mp4 without committing a binary fixture: `dockerExec('immich-server', …)` runs ffmpeg's `lavfi` test
   source (a couple of seconds, small frame size), base64s it (`base64 … | tr -d '\n'`), and the runner decodes it
   into a Buffer.
3. Upload, `waitForProcessing`, then assert the precondition: a non-edited `EncodedVideo` row with a relative path
   whose object exists in MinIO. Record its `mc stat` size/etag.

Act: `PUT /assets/{id}/edits` with a Trim action, then `waitForProcessing`.

Assert:

- Every `isEdited` `asset_file` row (encoded video, preview, thumbnail, and fullsize if generated) has a **relative**
  path.
- The edited video key is `encoded-video/{ownerId}/{xx}/{yy}/{id}_edited.mp4` and the object **exists in MinIO**.
- Each edited thumbnail key contains `_edited` and exists in MinIO.
- The **non-edited** encoded object still exists with an unchanged size/etag — the collision guard, end to end.
- `GET /assets/{id}/video/playback` returns 200 — the trimmed video is served from S3.
- `asset.duration` matches the trimmed length.
- `diskFileExists(<local encoded-video path>)` is **false** — proof the output was uploaded and the local copy
  released, not merely written to the pod's disk.
- The phase's server logs contain no `FFmpeg trim failed` and no ENOENT.

Then undo (`DELETE /assets/{id}/edits`), `waitForProcessing`, and assert the edited objects are **gone from MinIO**
and playback still returns 200 (falling back to the transcoded original). This covers the undo path on S3, which
nothing tests today. Assert only object deletion and playback — if anything else about undo looks wrong (e.g.
`duration` not restored), **file it as a separate issue; do not grow this PR**.

Teardown: delete the asset, empty the trash, restore the ffmpeg config, leaving the suite state as it was found.
`migrate-to-disk` runs later in the same CI job and has never seen `encoded-video` rows.

**Expected RED:** the trim job fails with ENOENT (ffmpeg is handed the S3 key), so no `isEdited` rows appear and the
first assertion fails. If it instead fails at the precondition (no non-edited `EncodedVideo`), the transcode never
ran — fix the arrange step, because without that precondition the phase does not reproduce #671.

**Done when:** the phase fails for the documented reason, and `phaseMigrateToDisk` still passes when run after it.

### Slice 2 — `persistFile` onto the repository layer

Route `persistFile` and `handleVideoTrim`'s two unlinks through `storageRepository`, per Design §1.

- **A1 (RED)** S3: `(sut as any).persistFile('/local/out.jpg', 'thumbs/aa/bb/x.jpg', 'image/jpeg')` streams via
  `mocks.storage.createPlainReadStream`, calls `backend.put(key, thatStream, { contentType })`, unlinks the local
  temp via `mocks.storage.unlink`, and returns the key.
  _Expected red:_ `createPlainReadStream` is never called (the code uses raw `node:fs`). Run this test on its own for
  the red observation — the raw stream's ENOENT may also surface as an unhandled error.
- **A2 (GUARD)** Disk (`getWriteBackend()` → undefined): returns the local path, calls no `put`, and **does not
  unlink**. _Mutation:_ make `persistFile` unlink unconditionally; A2 must fail. Without this guard, a later
  "simplification" would delete the very file disk mode just wrote.

**Done when:** A1 and A2 pass, the full `media.service.spec.ts` suite passes **with zero changes to existing tests**,
and A2 has been mutation-proved.

### Slice 3 — Defect 3: never hand ffmpeg an S3 key

`ensureLocalFile` the encoded input; release it in a `finally` around the trim.

- **B1 (RED)** S3, asset has a non-edited `EncodedVideo` with a relative key → `mediaRepository.trim` receives the
  temp local path, not the key, and that temp's `cleanup` runs. _Expected red:_ `trim` is called with the relative
  key.
- **D2 (RED)** S3 trim failure → returns `JobStatus.Failed`, calls no `put`, runs the encoded temp's `cleanup`, and
  unlinks the partial output. _Expected red:_ `cleanup` is never called (nothing is downloaded today).
- **B2 (GUARD)** Disk, existing non-edited `EncodedVideo` with an absolute path → `trim` receives it unchanged, no
  download attempted. _Mutation:_ make `ensureLocalFile` treat absolute paths as keys; B2 must fail.
- **B3 (GUARD)** No `EncodedVideo` at all → `trim` receives the caller's already-materialized `localPath`, no extra
  download. _Mutation:_ pass `existingEncoded?.path ?? ''` into `ensureLocalFile`; B3 must fail.

**Done when:** B1, D2 pass; B2, B3 pass and are mutation-proved; the suite is green.

### Slice 4 — Defect 1: persist the trimmed video

Add the three `StorageCore` statics (Design §2); use `getEditedEncodedVideoPath` for the local output and
`persistFile` + `getRelativeEditedEncodedVideoPath` for the upload.

- **C1 (RED)** S3: `put` called with `encoded-video/{ownerId}/{xx}/{yy}/{id}_edited.mp4` and `video/mp4`; the upserted
  `EncodedVideo` row carries that key, not an absolute path. _Expected red:_ `put` is never called.
- **C3a (RED)** S3: the persisted video key differs from `StorageCore.getRelativeEncodedVideoPath(asset)` — a trim
  must never overwrite the asset's transcoded original. _Expected red:_ `put` is never called.
- **D1 (RED)** Ordering: the video `put` happens **after** `extractFrame` (compare `invocationCallOrder`), proving the
  local file still existed when the frame was pulled. _Expected red:_ `put` is never called. _After green, also
  mutation-prove it:_ move the `persistFile` call above `extractFrame`; D1 must fail. This is the whole reason D1
  exists — a D1 that cannot catch the reordering is worthless.
- **D3 (GUARD)** Re-trim idempotency: an asset that already has edited files at the same keys queues **no**
  `FileDelete` for the edited video key. _Mutation:_ make the edited filename non-deterministic (append a suffix);
  D3 must fail, because `syncFiles` would then delete the object just uploaded.

**Done when:** C1, C3a, D1 pass; D3 passes and is mutation-proved; D1 is mutation-proved; the suite is green.

### Slice 5 — Defect 2: persist the trim thumbnails

Extract `persistImageFiles` (Design §3) and route all **four** call sites through it.

- **C2 (RED)** S3: `put` is called for every file `generateImageThumbnails` returns (preview, thumbnail, and fullsize
  when generated) with `_edited` relative keys, and those keys are what reach `upsertFiles`. _Expected red:_ `put` is
  called only for the video (Slice 4), never for the thumbnails.
- **C3b (RED)** S3: no `put` targets a non-edited thumbnail key — a trim must not overwrite the asset's normal
  preview/thumbnail objects. _Expected red:_ no thumbnail `put` happens at all.
- **C4 (GUARD)** Disk: the existing trim tests still pass, paths stay absolute, no `put` occurs. _Mutation:_ force
  `persistFile` into its S3 branch; C4 must fail.

**Done when:** C2, C3b pass; C4 passes and is mutation-proved; the **whole server unit suite** is green (this slice
touches `handleGenerateThumbnails` and `handleAssetEditThumbnailGeneration`, so their tests are the blast-radius
guard).

### Slice 6 — Turn the e2e phase green and wire it in

1. Re-run `./storage-migration.sh --phase video-trim-s3` — it must now pass, including the undo assertions.
2. Run it **three consecutive times**. Flaky means not done: fix the root cause, do not add retries.
3. Only then wire it into `.github/workflows/storage-migration-tests.yml` (the `backend=s3` phase group, next to
   `copy-asset-sidecar-s3`) and into the full-workflow sequence in `storage-migration.sh`.
4. Run the full `./storage-migration.sh --cleanup` suite to prove no existing phase regressed — `migrate-to-disk`
   especially.
5. Update `e2e/README-storage-migration.md`: drop "No video asset upload" from the known gaps, document the phase.

If the phase proves genuinely unstable in CI (not in local runs), it stays a local `make` target and the PR says so
explicitly. **No flaky test gets wired into CI.**

**Done when:** the phase is green three times running, the full harness passes, and CI on the branch is green.

## Verification

- `cd server && pnpm test -- --run src/services/media.service.spec.ts`, then the full server unit suite.
- Final gate only (not per slice): `make check-server` and `make lint-server`.
- `cd e2e && ./storage-migration.sh --phase video-trim-s3` (red in Slice 1, green in Slice 6, ×3 for stability), then
  a full `./storage-migration.sh --cleanup` run. This stack binds the same ports as the e2e stack (:2285, pg :5435) —
  do not run it alongside `make dev` or `make e2e`.
- Recommended before release: RC build to the personal instance (real S3 on OVH) and trim a video that already has a
  transcoded version — the exact shape that fails today.

## Files touched

- `server/src/cores/storage.core.ts` — three fork-only statics (Slice 4).
- `server/src/services/media.service.ts` — `persistFile` streaming source and the two trim unlinks (Slice 2);
  `ensureLocalFile` on the trim input (Slice 3); `StorageCore` keys and video persistence (Slice 4);
  `persistImageFiles` extraction and its four call sites (Slice 5).
- `server/src/services/media.service.spec.ts` — twelve tests: A1–A2, B1–B3, C1–C4, D1–D3.
- `e2e/src/storage-migration.ts` — `video-trim-s3` phase and its switch entry (Slice 1).
- `e2e/storage-migration.sh`, `.github/workflows/storage-migration-tests.yml`,
  `e2e/README-storage-migration.md` — wiring and docs (Slice 6).
