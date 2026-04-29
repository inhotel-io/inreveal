# Google Takeout Zip On-Demand Files Design

Date: 2026-04-29

## Context

The in-browser Google Photos Takeout scanner currently materializes every media entry from a selected zip during scan. `scanZipFile()` calls `entry.arrayBuffer()` for each media file, stores the decompressed bytes in `mediaBlobs`, then builds `File` objects for every item before upload starts. For large Takeout archives this can retain many gigabytes of media in browser heap and makes scan run heavy decompression work on the main thread.

Runtime consumers do not need media bytes during review. The audit found that:

- `import-wizard.svelte` needs the current item name for progress and errors.
- `google-takeout-uploader.ts` needs name and last-modified metadata before upload, then bytes only when hashing and appending to `FormData`.
- `import-review-step.svelte` reads `item.path` for extension-derived counts and does not read bytes.

Additional `TakeoutMediaItem.file` references are test fixtures or assertions that must be updated to the new shape.

## Goals

- Scanning a multi-gigabyte zip must not decompress and retain all media files.
- The review flow must keep using cheap metadata: path, name, size, last modified, metadata, and album name.
- Upload must preserve current behavior for zip and folder imports.
- Sidecar JSON may still be extracted during scan because sidecars are small and needed for metadata matching.
- The implementation should be testable with the existing Vitest scanner and uploader specs.

## Non-Goals

- No server-side changes.
- No size warning UI changes.
- No broader import wizard redesign.
- No attempt to stream directly into the upload request in this change.

## Data Model

`TakeoutMediaItem` changes from an eager file object to metadata plus an on-demand file loader:

```ts
export interface TakeoutMediaItem {
  path: string;
  name: string;
  size: number;
  lastModified: number;
  getFile: () => Promise<File>;
  metadata?: TakeoutMetadata;
  albumName?: string;
}
```

Folder imports keep the original selected `File` and implement `getFile` as a closure returning that file. Zip imports populate `name`, `size`, and `lastModified` from zip entry metadata and implement `getFile` as a closure that extracts only that entry.

## Zip Scan Design

`scanZipFile()` will:

1. Open the zip with zip.js and read the central directory with `getEntries()`.
2. Build a per-zip entry map keyed by entry filename.
3. For media entries, record only metadata and the filename. Do not call `entry.arrayBuffer()` or `entry.getData()` during scan.
4. For sidecar entries, extract text during scan and keep it in `sidecarTexts`.
5. Match sidecars to media paths after the entry loop, as today.
6. Build `TakeoutMediaItem` objects from recorded media descriptors, metadata matches, and on-demand `getFile` closures.

The primary implementation should use a per-zip central-directory cache so uploads do not reparse every zip entry for every item. The cache may retain zip entry metadata and the source zip `File`, but it must not retain extracted media blobs.

Because zip.js reader and entry lifetimes can be subtle, the implementation must verify whether entries remain extractable after `reader.close()`. If they do not, the extractor should reopen a `ZipReader` as needed and cache only the resulting entry map, closing readers after extraction. The invariant is more important than the exact lifecycle: scan must not extract media, and upload must extract only the requested media file.

## Worker Configuration

The existing scanner disables zip.js web workers because prior eager extraction hit stream lifecycle issues during SvelteKit navigation. After media extraction moves out of the scan loop, scan only reads the central directory and sidecar JSON. The implementation should try `configure({ useWebWorkers: true })` for the scanner path if tests and manual validation show no lifecycle regression.

If worker use still causes stream lifecycle errors with the on-demand extractor, keep workers disabled for this change. The memory fix does not depend on workers.

## Upload Design

`uploadTakeoutItem()` will call `const file = await item.getFile()` once per item and use that local `File` for:

- checksum calculation when duplicate skipping is enabled,
- `assetData` in `FormData`,
- any upload code that requires a `File` object.

Name and timestamp-only values should use `item.name` and `item.lastModified` so they remain cheap and do not force extraction. The local `file` must not be stored beyond the upload function, allowing the browser to reclaim the extracted media bytes after the upload finishes.

## UI Changes

`import-wizard.svelte` will replace `item.file.name` with `item.name` for progress and error reporting. `import-review-step.svelte` does not need runtime changes unless TypeScript fixtures or props require the new shape in tests.

## Testing

Update the scanner, parser, uploader, and import component specs to construct `TakeoutMediaItem` with `name`, `size`, `lastModified`, and `getFile`.

Add scanner coverage that:

- scans a small zip and verifies media `getFile()` returns the expected bytes,
- verifies scanning does not extract media entries,
- verifies media extraction happens only when `getFile()` or upload is called,
- keeps folder-source behavior unchanged by returning the original file through `getFile`,
- keeps sidecar matching, album detection, progress reconciliation, and mixed zip/folder behavior intact.

Add uploader coverage that:

- verifies `uploadTakeoutItem()` calls `getFile()` during upload,
- verifies duplicate checks still hash the file bytes at upload time,
- verifies name and last-modified metadata are preserved.

Baseline verification in the worktree after setup:

```text
pnpm --dir web exec vitest run src/lib/utils/google-takeout-scanner.spec.ts src/lib/utils/google-takeout-uploader.spec.ts
Test Files  2 passed
Tests       37 passed
```

The local SDK package must be built in a fresh worktree before these tests can resolve `@immich/sdk`:

```text
pnpm --dir open-api/typescript-sdk build
```

## Acceptance Criteria

- Scan does not call media entry extraction APIs for media entries.
- Scan memory growth is proportional to zip metadata, sidecar JSON, and `TakeoutMediaItem` metadata, not decompressed media bytes.
- Upload still works for small zip imports and folder-source imports.
- Media names, last-modified timestamps, sidecar metadata, album names, and duplicate handling are preserved.
- Focused scanner and uploader tests pass.
- Full `pnpm test` and `pnpm lint` are run before completion, or any pre-existing blocker is documented.
