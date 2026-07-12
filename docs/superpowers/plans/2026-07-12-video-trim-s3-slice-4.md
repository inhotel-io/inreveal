# Video Trim on S3 — Slice 4: Defect 3, never hand ffmpeg an S3 key

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the trim job picks the asset's existing (non-edited) encoded video as its ffmpeg input, materialize it locally first — on S3 that path is a relative key ffmpeg cannot open.

**Architecture:** `handleVideoTrim` selects `existingEncoded?.path || localPath` as the ffmpeg input. `localPath` is already materialized by the caller, but `existingEncoded.path` comes straight from the DB, and on S3 that is a relative key → ENOENT. Route it through `BaseService.ensureLocalFile` (which downloads to a temp file and hands back a cleanup) and release the temp in a `finally` around the trim, so a failed trim does not leak it.

**Tech Stack:** NestJS, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-video-trim-s3-design.md`, Slice 4 (design §6, fix 3).
- Slices 1–3 are complete. Slice 3 moved `persistFile` and `handleVideoTrim`'s unlinks onto `storageRepository`, so `mocks.storage.unlink` is assertable.
- This slice adds **only** the input materialization. Do NOT add `persistFile` for the video, the `StorageCore` statics, or `persistImageFiles` — Slices 5 and 6.
- **`server/test/vitest.config.mjs` sets no `restoreMocks` and there are no `setupFiles`.** Every test that spies on `StorageService` must restore in `afterEach`, or the disk-mode tests silently run against S3.
- Disk mode works in this spec file because `StorageService.diskBackend` is `undefined`; `ensureLocalFile` returns absolute paths unchanged with a no-op cleanup, without consulting any backend.
- Run tests from `server/`: `pnpm test -- --run src/services/media.service.spec.ts`.

---

### Task 1: Materialize the encoded-video input

**Files:**
- Modify: `server/src/services/media.service.ts`, `handleVideoTrim` (lines ~291–305)
- Test: `server/src/services/media.service.spec.ts` (add to the existing `describe` that holds the trim tests — the one containing `'should trim video when edits contain Trim action'`)

**Interfaces:**
- Consumes: `BaseService.ensureLocalFile(filePath: string): Promise<{ localPath: string; cleanup: () => Promise<void> }>` — absolute paths pass through with a no-op cleanup; relative keys are downloaded via `StorageService.resolveBackendForKey(key).downloadToTemp(key)`.
- Produces: no signature change to `handleVideoTrim`.

- [ ] **Step 1: Write the failing tests**

Add these four tests alongside the existing trim tests in `server/src/services/media.service.spec.ts`. They drive `handleVideoTrim` through its only caller, `sut.handleAssetEditThumbnailGeneration({ id })`, exactly as the existing trim tests do.

Add an `afterEach(() => vi.restoreAllMocks())` to the enclosing `describe` if one is not already present.

```ts
    it('materializes an S3 encoded-video input before handing it to ffmpeg', async () => {
      const cleanup = vi.fn().mockResolvedValue(void 0);
      const { StorageService } = await import('src/services/storage.service.js');
      vi.spyOn(StorageService, 'resolveBackendForKey').mockReturnValue({
        downloadToTemp: vi.fn().mockResolvedValue({ tempPath: '/tmp/dl-encoded.mp4', cleanup }),
      } as any);

      const asset = AssetFactory.from({ type: AssetType.Video })
        .exif()
        .edit({ action: AssetEditAction.Trim, parameters: { startTime: 5, endTime: 25 } as any })
        .files([
          {
            type: AssetFileType.EncodedVideo,
            isEdited: false,
            path: 'encoded-video/owner/ab/cd/video.mp4',
          },
        ])
        .build();
      mocks.assetJob.getForGenerateThumbnailJob.mockResolvedValue(getForGenerateThumbnail(asset));
      mocks.media.probe.mockResolvedValue({
        ...videoInfoStub.noAudioStreams,
        format: { ...videoInfoStub.noAudioStreams.format, duration: 20 },
      });
      mocks.media.decodeImage.mockResolvedValue({ data: rawBuffer, info: rawInfo as OutputInfo });
      mocks.media.getImageMetadata.mockResolvedValue({ width: 1920, height: 1080, isTransparent: false });

      await sut.handleAssetEditThumbnailGeneration({ id: asset.id });

      expect(mocks.media.trim).toHaveBeenCalledWith('/tmp/dl-encoded.mp4', expect.any(String), 5, 20);
      expect(cleanup).toHaveBeenCalled();
    });

    it('releases the downloaded encoded-video temp when ffmpeg fails', async () => {
      const cleanup = vi.fn().mockResolvedValue(void 0);
      const { StorageService } = await import('src/services/storage.service.js');
      vi.spyOn(StorageService, 'resolveBackendForKey').mockReturnValue({
        downloadToTemp: vi.fn().mockResolvedValue({ tempPath: '/tmp/dl-encoded.mp4', cleanup }),
      } as any);

      const asset = AssetFactory.from({ type: AssetType.Video })
        .exif()
        .edit({ action: AssetEditAction.Trim, parameters: { startTime: 5, endTime: 25 } as any })
        .files([
          {
            type: AssetFileType.EncodedVideo,
            isEdited: false,
            path: 'encoded-video/owner/ab/cd/video.mp4',
          },
        ])
        .build();
      mocks.assetJob.getForGenerateThumbnailJob.mockResolvedValue(getForGenerateThumbnail(asset));
      mocks.media.trim.mockRejectedValue(new Error('FFmpeg error'));

      const result = await sut.handleAssetEditThumbnailGeneration({ id: asset.id });

      expect(result).toBe(JobStatus.Failed);
      expect(cleanup).toHaveBeenCalled();
      expect(mocks.storage.unlink).toHaveBeenCalledWith(expect.stringContaining('_edited.mp4'));
    });

    it('passes a disk encoded-video path to ffmpeg unchanged, without downloading', async () => {
      const { StorageService } = await import('src/services/storage.service.js');
      const resolveSpy = vi.spyOn(StorageService, 'resolveBackendForKey');

      const asset = AssetFactory.from({ type: AssetType.Video })
        .exif()
        .edit({ action: AssetEditAction.Trim, parameters: { startTime: 5, endTime: 25 } as any })
        .files([{ type: AssetFileType.EncodedVideo, isEdited: false, path: '/data/encoded-video/video.mp4' }])
        .build();
      mocks.assetJob.getForGenerateThumbnailJob.mockResolvedValue(getForGenerateThumbnail(asset));
      mocks.media.probe.mockResolvedValue({
        ...videoInfoStub.noAudioStreams,
        format: { ...videoInfoStub.noAudioStreams.format, duration: 20 },
      });
      mocks.media.decodeImage.mockResolvedValue({ data: rawBuffer, info: rawInfo as OutputInfo });
      mocks.media.getImageMetadata.mockResolvedValue({ width: 1920, height: 1080, isTransparent: false });

      await sut.handleAssetEditThumbnailGeneration({ id: asset.id });

      expect(mocks.media.trim).toHaveBeenCalledWith('/data/encoded-video/video.mp4', expect.any(String), 5, 20);
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('falls back to the original when the asset has no encoded video', async () => {
      const { StorageService } = await import('src/services/storage.service.js');
      const resolveSpy = vi.spyOn(StorageService, 'resolveBackendForKey');

      const asset = AssetFactory.from({ type: AssetType.Video })
        .exif()
        .edit({ action: AssetEditAction.Trim, parameters: { startTime: 5, endTime: 25 } as any })
        .build();
      mocks.assetJob.getForGenerateThumbnailJob.mockResolvedValue(getForGenerateThumbnail(asset));
      mocks.media.probe.mockResolvedValue({
        ...videoInfoStub.noAudioStreams,
        format: { ...videoInfoStub.noAudioStreams.format, duration: 20 },
      });
      mocks.media.decodeImage.mockResolvedValue({ data: rawBuffer, info: rawInfo as OutputInfo });
      mocks.media.getImageMetadata.mockResolvedValue({ width: 1920, height: 1080, isTransparent: false });

      await sut.handleAssetEditThumbnailGeneration({ id: asset.id });

      expect(mocks.media.trim).toHaveBeenCalledWith(asset.originalPath, expect.any(String), 5, 20);
      expect(resolveSpy).not.toHaveBeenCalled();
    });
```

The factory's default `originalPath` is absolute, so `ensureLocalFile` passes it through and the last test's expectation holds. If `AssetFactory`'s `.files([...])` entries need more fields (e.g. `isProgressive`, `isTransparent`), copy the shape used by the existing test `'should handle video undo by cleaning up edited files'` in the same file.

- [ ] **Step 2: Run the tests to verify the reds**

```bash
cd server
pnpm test -- --run src/services/media.service.spec.ts
```

Expected:
- **B1** "materializes an S3 encoded-video input…" → **FAILS**: `trim` was called with `'encoded-video/owner/ab/cd/video.mp4'` (the raw key), not `/tmp/dl-encoded.mp4`. This is #671's defect 3, reproduced in a unit test.
- **D2** "releases the downloaded encoded-video temp when ffmpeg fails" → **FAILS**: `cleanup` was never called (nothing is downloaded today).
- **B2** "passes a disk encoded-video path… unchanged" → **PASSES already** (GUARD).
- **B3** "falls back to the original…" → **PASSES already** (GUARD).

- [ ] **Step 3: Implement**

In `server/src/services/media.service.ts`, `handleVideoTrim`, replace the input selection and the trim block:

```ts
    // Select input: prefer non-edited encoded video, fall back to original.
    // On S3 the encoded video's path is a relative key ffmpeg cannot open, so
    // materialize it locally first and release it as soon as ffmpeg is done.
    const existingEncoded = asset.files.find((f) => f.type === AssetFileType.EncodedVideo && !f.isEdited);
    const encodedLocal = existingEncoded ? await this.ensureLocalFile(existingEncoded.path) : undefined;
    const inputPath = encodedLocal?.localPath ?? localPath;

    // Output path for edited encoded video in EncodedVideo directory
    const outputPath = StorageCore.getNestedPath(StorageFolder.EncodedVideo, asset.ownerId, `${asset.id}_edited.mp4`);
    this.storageCore.ensureFolders(outputPath);

    try {
      await this.mediaRepository.trim(inputPath, outputPath, params.startTime, duration);
    } catch (error) {
      this.logger.error(`FFmpeg trim failed for asset ${asset.id}: ${error}`);
      await this.storageRepository.unlink(outputPath).catch(() => {});
      return JobStatus.Failed;
    } finally {
      await encodedLocal?.cleanup();
    }
```

The `finally` runs on the `return JobStatus.Failed` path too, which is what D2 asserts.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm test -- --run src/services/media.service.spec.ts
```

Expected: PASS — all four new tests plus every existing test in the file.

- [ ] **Step 5: Mutation-prove the two guards**

**B2** — make `ensureLocalFile` treat absolute paths as keys, in `server/src/services/base.service.ts`:

```ts
  protected async ensureLocalFile(filePath: string): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
    // if (isAbsolute(filePath)) { return { localPath: filePath, cleanup: async () => {} }; }   // MUTATION: commented out
    const { StorageService } = await import('./storage.service.js');
    ...
```

Run the file. Expected: **B2 FAILS** (`resolveBackendForKey` was called). Revert.

**B3** — in `handleVideoTrim`, force the download branch:

```ts
    const encodedLocal = await this.ensureLocalFile(existingEncoded?.path ?? '');   // MUTATION
```

Run the file. Expected: **B3 FAILS** (`resolveBackendForKey` was called even with no encoded video). Revert, and confirm the suite is green again.

If either guard survives its mutation, the test is broken — fix it before continuing.

- [ ] **Step 6: Run the full server unit suite**

```bash
pnpm test -- --run
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/media.service.ts server/src/services/media.service.spec.ts
git commit -m "fix(media): materialize the encoded-video trim input on S3 (#671)

handleVideoTrim preferred the asset's existing non-edited encoded video as
its ffmpeg input, but passed asset_file.path straight to ffmpeg. On S3 that
is a relative key, so the trim died with ENOENT for any asset that had
already been transcoded — the common case. Route it through ensureLocalFile
and release the temp in a finally, so a failed trim leaks nothing."
```

---

## Self-Review

**Spec coverage:** B1 (RED, S3 input materialized + cleanup), D2 (RED, failure path releases the temp and unlinks the partial output), B2 (GUARD, disk path untouched, mutation-proved), B3 (GUARD, no encoded video → original, mutation-proved). All four from the spec's Slice 4.

**Placeholders:** none.

**Type consistency:** `ensureLocalFile` returns `{ localPath, cleanup }` — matches `base.service.ts:398`. `mocks.storage.unlink` is assertable because Slice 3 routed the trim unlinks through `storageRepository`. `AssetFileType.EncodedVideo`, `AssetEditAction.Trim`, `JobStatus.Failed`, `videoInfoStub`, `rawBuffer`, `rawInfo`, `getForGenerateThumbnail` are all already imported in this spec.

**Not in this slice:** the `StorageCore` statics and video persistence (Slice 5) — note `outputPath` still uses the inline `getNestedPath(...)` here and is replaced in Slice 5; `persistImageFiles` (Slice 6); e2e wiring (Slice 7).
