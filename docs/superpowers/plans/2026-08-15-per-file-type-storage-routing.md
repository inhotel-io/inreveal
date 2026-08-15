# Per-file-type storage routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin choose, per file kind (originals / thumbnails / encoded video), whether new files are written to local disk or to S3, configurable in the admin UI and via the config file.

**Architecture:** `SystemConfig` gains `storage.routing`, three enum knobs defaulting to `auto` (follow `IMMICH_STORAGE_BACKEND`). A pure resolver turns a knob plus the env backend into a concrete backend. The existing single global `StorageService.getWriteBackend()` becomes `getWriteBackend(kind, config)` and the seven write paths pass their kind. Reads, deletes and serving are untouched because the backend is already inferred from key shape (absolute = disk, relative = S3), which is also why flipping a knob can never strand existing files. The existing storage migrator is reused unchanged except that its validation becomes per-kind.

**Tech Stack:** NestJS 11 + Kysely + zod (server), SvelteKit + Svelte 5 runes (web), vitest everywhere.

**Spec:** `docs/superpowers/specs/2026-08-15-per-file-type-storage-routing-design.md`

## Global Constraints

- **No relative imports in server code.** Use the `src/` path alias.
- **Prettier:** 120 char width, single quotes, trailing commas, semicolons.
- **ESLint zero-warning policy:** `--max-warnings 0`.
- **i18n:** every user-facing string must land in `i18n/en.json` **and** all nine maintained locales in the same commit: `de` `fr` `it` `nl` `pl` `es` `ru` `zh_Hans` `zh_Hant`. Keys are alphabetically sorted, 2-space indent, unescaped Unicode. German/Italian/Spanish address the user informally (`du`/`tu`/`tú`); French and Russian use formal `vous`/`вы`.
- **Do not commit branded output.** Leave upstream `immich` names in source.
- **No `Co-Authored-By` or `Generated-with` trailers in commits.**

### Verified command reference — CLAUDE.md is wrong about several of these

| Purpose                          | Correct command                                                            | Never use                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Server unit test, one file       | `cd server && pnpm test --run <path>`                                      | `pnpm test -- --run <path>` — the `--` is passed to vitest, which drops the path filter and runs the **whole suite** (false green) |
| Server unit test, one file (alt) | `cd server && pnpm exec vitest run --config test/vitest.config.mjs <path>` | `pnpm exec vitest run <path>` — loads no config, dies with `describe is not defined` (false red)                                   |
| Server medium test               | `cd server && pnpm test:medium --run <path>`                               | —                                                                                                                                  |
| Server typecheck                 | `cd server && pnpm check`                                                  | `make check-server` — **does not exist**; the Makefile catch-all reports it as `[dev] Error 1`                                     |
| Server lint                      | `cd server && pnpm lint`                                                   | `make lint-server` — does not exist                                                                                                |
| Web test                         | `cd web && pnpm test --run <path>`                                         | —                                                                                                                                  |
| Web typecheck                    | `cd web && pnpm check:typescript`                                          | `make check-web` — does not exist                                                                                                  |
| Web svelte check                 | `cd web && pnpm check:svelte`                                              | —                                                                                                                                  |
| Prettier                         | `npx prettier --check <paths>` / `--write`                                 | —                                                                                                                                  |

**OpenAPI regeneration from this worktree** — do **not** run `mise open-api`. Its task list uses `//server:...`, and `//` resolves to the **main checkout**, so it would regenerate clients from main's server source. Run:

```bash
cd server && pnpm build && node ./dist/bin/sync-open-api.js
cd .. && mise run open-api-typescript   # uses `:`-prefixed tasks, worktree-local — safe
mise run open-api-dart                  # needs Java (JDK 21)
```

Dart model files are marked `-diff` in `.gitattributes`, so `git diff` shows them as `Bin N -> M bytes`. Verify content with `grep`, not `git diff`.

---

### Task 1: Config model and the pure router

Adds the config keys and the resolution function. No behaviour changes yet — nothing calls the router.

**Files:**

- Modify: `server/src/dtos/system-config.dto.ts` (add enum + schema, register in `SystemConfigSchema`)
- Modify: `server/src/config.ts` (add type + defaults)
- Create: `server/src/backends/storage-router.ts`
- Create: `server/src/backends/storage-router.spec.ts`
- Modify: `server/src/services/system-config.service.spec.ts` (extend the full-config literal)
- Modify: `docs/superpowers/specs/2026-08-15-per-file-type-storage-routing-design.md` (one-line correction, see Step 8)

**Interfaces:**

- Produces:
  - `StorageRouting` enum: `Auto = 'auto'`, `Disk = 'disk'`, `S3 = 's3'` (exported from `src/dtos/system-config.dto`)
  - `StorageRoutingKind` enum: `Originals = 'originals'`, `Thumbnails = 'thumbnails'`, `EncodedVideo = 'encodedVideo'` (exported from `src/backends/storage-router`)
  - `resolveRouting(routing: StorageRouting, envBackend: 'disk' | 's3'): 'disk' | 's3'`
  - `MIGRATION_FILE_TYPE_TO_KIND: Record<StorageMigrationFileType, StorageRoutingKind>`
  - `StorageMigrationFileType` union type: `'originals' | 'thumbnails' | 'previews' | 'fullsize' | 'encodedVideos' | 'sidecars' | 'personThumbnails' | 'profileImages'`
  - `SystemConfig['storage']['routing']` with the three knobs

- [ ] **Step 1: Write the failing router test**

Create `server/src/backends/storage-router.spec.ts`:

```ts
import {
  MIGRATION_FILE_TYPE_TO_KIND,
  resolveRouting,
  StorageMigrationFileType,
  StorageRoutingKind,
} from 'src/backends/storage-router';
import { StorageRouting } from 'src/dtos/system-config.dto';
import { describe, expect, it } from 'vitest';

describe('resolveRouting', () => {
  it('follows the env backend when set to auto', () => {
    expect(resolveRouting(StorageRouting.Auto, 'disk')).toBe('disk');
    expect(resolveRouting(StorageRouting.Auto, 's3')).toBe('s3');
  });

  it('pins to disk regardless of the env backend', () => {
    expect(resolveRouting(StorageRouting.Disk, 'disk')).toBe('disk');
    expect(resolveRouting(StorageRouting.Disk, 's3')).toBe('disk');
  });

  it('pins to s3 regardless of the env backend', () => {
    expect(resolveRouting(StorageRouting.S3, 'disk')).toBe('s3');
    expect(resolveRouting(StorageRouting.S3, 's3')).toBe('s3');
  });
});

describe('MIGRATION_FILE_TYPE_TO_KIND', () => {
  const allFileTypes: StorageMigrationFileType[] = [
    'originals',
    'thumbnails',
    'previews',
    'fullsize',
    'encodedVideos',
    'sidecars',
    'personThumbnails',
    'profileImages',
  ];

  it('maps every migration file type to exactly one kind', () => {
    for (const fileType of allFileTypes) {
      expect(MIGRATION_FILE_TYPE_TO_KIND[fileType]).toBeDefined();
    }
    expect(Object.keys(MIGRATION_FILE_TYPE_TO_KIND).sort()).toEqual([...allFileTypes].sort());
  });

  it('groups derivatives under thumbnails and originals with sidecars', () => {
    expect(MIGRATION_FILE_TYPE_TO_KIND.originals).toBe(StorageRoutingKind.Originals);
    expect(MIGRATION_FILE_TYPE_TO_KIND.sidecars).toBe(StorageRoutingKind.Originals);
    expect(MIGRATION_FILE_TYPE_TO_KIND.thumbnails).toBe(StorageRoutingKind.Thumbnails);
    expect(MIGRATION_FILE_TYPE_TO_KIND.previews).toBe(StorageRoutingKind.Thumbnails);
    expect(MIGRATION_FILE_TYPE_TO_KIND.fullsize).toBe(StorageRoutingKind.Thumbnails);
    expect(MIGRATION_FILE_TYPE_TO_KIND.personThumbnails).toBe(StorageRoutingKind.Thumbnails);
    expect(MIGRATION_FILE_TYPE_TO_KIND.profileImages).toBe(StorageRoutingKind.Thumbnails);
    expect(MIGRATION_FILE_TYPE_TO_KIND.encodedVideos).toBe(StorageRoutingKind.EncodedVideo);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && pnpm test --run src/backends/storage-router.spec.ts`
Expected: FAIL — `Cannot find module 'src/backends/storage-router'`.

- [ ] **Step 3: Add the `StorageRouting` enum and config schema**

In `server/src/dtos/system-config.dto.ts`, immediately **above** `const SystemConfigStorageUsageSchema` (around line 454), add:

```ts
// Gallery-fork: per-file-type storage routing. `Auto` follows IMMICH_STORAGE_BACKEND.
export enum StorageRouting {
  Auto = 'auto',
  Disk = 'disk',
  S3 = 's3',
}

const StorageRoutingSchema = z.enum(StorageRouting).describe('Storage routing').meta({ id: 'StorageRouting' });

const SystemConfigStorageSchema = z
  .object({
    routing: z
      .object({
        originals: StorageRoutingSchema.describe('Where newly written original files and sidecars are stored'),
        thumbnails: StorageRoutingSchema.describe(
          'Where newly written thumbnails, previews, fullsize images, person thumbnails and profile images are stored',
        ),
        encodedVideo: StorageRoutingSchema.describe('Where newly written transcoded videos are stored'),
      })
      .meta({ id: 'SystemConfigStorageRoutingDto' }),
  })
  .meta({ id: 'SystemConfigStorageDto' });
```

Then register it in `SystemConfigSchema` — insert directly above the `storageTemplate:` line (around line 481):

```ts
    // Gallery-fork: see SystemConfigStorageSchema above.
    storage: SystemConfigStorageSchema,
    storageTemplate: SystemConfigStorageTemplateSchema,
```

- [ ] **Step 4: Add the config type and defaults**

In `server/src/config.ts`, update the import on line 2:

```ts
import { ReleaseChannel, StorageRouting } from 'src/dtos/system-config.dto';
```

Add to the `SystemConfig` type, directly above the existing `storageTemplate: {` block (around line 159):

```ts
// Gallery-fork: per-file-type storage routing; `auto` follows IMMICH_STORAGE_BACKEND.
storage: {
  routing: {
    originals: StorageRouting;
    thumbnails: StorageRouting;
    encodedVideo: StorageRouting;
  }
}
```

Add to the `defaults` object, directly above the existing `storageTemplate: {` block (around line 414):

```ts
  // Gallery-fork: defaults to `auto` everywhere, so behaviour matches IMMICH_STORAGE_BACKEND
  // exactly and no existing install changes on upgrade.
  storage: {
    routing: {
      originals: StorageRouting.Auto,
      thumbnails: StorageRouting.Auto,
      encodedVideo: StorageRouting.Auto,
    },
  },
```

- [ ] **Step 5: Create the router**

Create `server/src/backends/storage-router.ts`:

```ts
import { StorageRouting } from 'src/dtos/system-config.dto';

/**
 * The three routable groups. Eight physical file types collapse into these because no
 * deployment wants previews on S3 while thumbnails sit on disk, and three knobs give
 * eight documented combinations instead of 256.
 */
export enum StorageRoutingKind {
  Originals = 'originals',
  Thumbnails = 'thumbnails',
  EncodedVideo = 'encodedVideo',
}

/** The file-type keys the storage migrator exposes. */
export type StorageMigrationFileType =
  | 'originals'
  | 'thumbnails'
  | 'previews'
  | 'fullsize'
  | 'encodedVideos'
  | 'sidecars'
  | 'personThumbnails'
  | 'profileImages';

/**
 * Single source of truth for which knob owns which migrator file type. The router, the
 * migration validator and the routing-counts query all read this, so they cannot disagree.
 */
export const MIGRATION_FILE_TYPE_TO_KIND: Record<StorageMigrationFileType, StorageRoutingKind> = {
  originals: StorageRoutingKind.Originals,
  sidecars: StorageRoutingKind.Originals,
  thumbnails: StorageRoutingKind.Thumbnails,
  previews: StorageRoutingKind.Thumbnails,
  fullsize: StorageRoutingKind.Thumbnails,
  personThumbnails: StorageRoutingKind.Thumbnails,
  profileImages: StorageRoutingKind.Thumbnails,
  encodedVideos: StorageRoutingKind.EncodedVideo,
};

/**
 * Resolve a knob to a concrete backend. Pure: no config lookup, no backend instances, no
 * S3-availability check — callers handle the missing-backend fallback so this stays a
 * total function over the truth table.
 */
export const resolveRouting = (routing: StorageRouting, envBackend: 'disk' | 's3'): 'disk' | 's3' => {
  switch (routing) {
    case StorageRouting.Disk: {
      return 'disk';
    }
    case StorageRouting.S3: {
      return 's3';
    }
    default: {
      return envBackend;
    }
  }
};
```

- [ ] **Step 6: Run the router test to verify it passes**

Run: `cd server && pnpm test --run src/backends/storage-router.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Extend the system-config spec fixture**

`server/src/services/system-config.service.spec.ts` holds a full `SystemConfig` literal (`updatedConfig`, around line 211) that must stay exhaustive. Add, immediately above its `storageTemplate:` entry:

```ts
  storage: {
    routing: {
      originals: StorageRouting.Auto,
      thumbnails: StorageRouting.Auto,
      encodedVideo: StorageRouting.Auto,
    },
  },
```

Import `StorageRouting` from `src/dtos/system-config.dto` at the top of that spec file.

Then add a defaults test, next to the existing `describe('storageUsage defaults', ...)` block:

```ts
describe('storage routing defaults', () => {
  it('should default every kind to auto', async () => {
    const sut = newTestService(SystemConfigService, mocks);
    mocks.systemMetadata.get.mockResolvedValue({});

    const config = await sut.getSystemConfig();

    expect(config.storage.routing).toEqual({
      originals: StorageRouting.Auto,
      thumbnails: StorageRouting.Auto,
      encodedVideo: StorageRouting.Auto,
    });
  });

  it('should drop a knob from the persisted partial config when set back to auto', async () => {
    const sut = newTestService(SystemConfigService, mocks);
    mocks.systemMetadata.get.mockResolvedValue({ storage: { routing: { thumbnails: 'disk' } } });

    await sut.updateSystemConfig({
      ...defaults,
      storage: { routing: { originals: 'auto', thumbnails: 'auto', encodedVideo: 'auto' } },
    } as never);

    // updateConfig strips values equal to the default, so the key disappears entirely and
    // the install goes back to following IMMICH_STORAGE_BACKEND.
    expect(mocks.systemMetadata.set).toHaveBeenCalledWith(
      SystemMetadataKey.SystemConfig,
      expect.not.objectContaining({ storage: expect.anything() }),
    );
  });

  it('should accept storage routing from a config file', async () => {
    const sut = newTestService(SystemConfigService, mocks);
    mocks.config.getEnv.mockReturnValue({ configFile: '/path/to/config.json' } as never);
    mocks.systemMetadata.readFile.mockResolvedValue(JSON.stringify({ storage: { routing: { thumbnails: 'disk' } } }));

    const config = await sut.getSystemConfig();

    expect(config.storage.routing.thumbnails).toBe(StorageRouting.Disk);
    expect(config.storage.routing.originals).toBe(StorageRouting.Auto);
  });
});
```

Match the surrounding tests' existing setup style — if the neighbouring `storageUsage` tests build `sut`/`mocks` differently, copy that exact shape rather than the sketch above.

- [ ] **Step 8: Correct the spec's Files-touched line**

The spec lists `src/services/base.service.ts — getWriteBackend(kind)`. That would create a circular import: `base.service` → `storage.service` → `base.service`. The resolver instead lands as a static on `StorageService`, which every call site already imports. In `docs/superpowers/specs/2026-08-15-per-file-type-storage-routing-design.md`, replace the line

```
- `src/services/base.service.ts` — `getWriteBackend(kind)`
```

with

```
- `src/services/storage.service.ts` — `getWriteBackend(kind, config)` static, `ConfigValidate` /
  `ConfigInit` handlers. Deliberately not on `BaseService`: that would close an import cycle
  (`base.service` → `storage.service` → `base.service`), and every call site already imports
  `StorageService`.
```

and delete the now-duplicated `src/services/storage.service.ts` bullet below it.

Also update the "Resolution" section sentence `A thin \`BaseService.getWriteBackend(kind)\` combines it with`to`A \`StorageService.getWriteBackend(kind, config)\` static combines it with`.

- [ ] **Step 9: Run the full gate**

```bash
cd server && pnpm test --run src/backends/storage-router.spec.ts src/services/system-config.service.spec.ts
cd server && pnpm check
cd server && pnpm lint
npx prettier --check server/src/backends/storage-router.ts server/src/config.ts server/src/dtos/system-config.dto.ts docs/superpowers/specs/2026-08-15-per-file-type-storage-routing-design.md
```

Expected: all pass. `pnpm check` is the important one — vitest does not typecheck.

- [ ] **Step 10: Commit**

```bash
git add server/src/backends/storage-router.ts server/src/backends/storage-router.spec.ts \
  server/src/config.ts server/src/dtos/system-config.dto.ts \
  server/src/services/system-config.service.spec.ts \
  docs/superpowers/specs/2026-08-15-per-file-type-storage-routing-design.md
git commit -m "feat(storage): add per-file-type routing config and resolver"
```

---

### Task 2: Backend resolution and the three validation layers

**Files:**

- Modify: `server/src/services/storage.service.ts`
- Modify: `server/src/services/storage.service.spec.ts`

**Interfaces:**

- Consumes: `resolveRouting`, `StorageRoutingKind` (Task 1); `SystemConfig['storage']['routing']` (Task 1)
- Produces:
  - `StorageService.getWriteBackend(kind: StorageRoutingKind, config: SystemConfig): StorageBackend`
  - `StorageService.onConfigValidate({ newConfig })` — throws on an `s3` pin with no bucket
  - `StorageService.onStorageConfigInit({ newConfig })` — logs, never throws

The existing zero-argument `getWriteBackend()` is **replaced**, not kept alongside. Task 3 updates every caller in the same series; leaving both would let a call site silently keep global behaviour.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/services/storage.service.spec.ts`. Follow the file's existing `newTestService(StorageService, ...)` setup — read the top of the file first and reuse its `sut` / `mocks` construction verbatim.

```ts
describe('getWriteBackend', () => {
  it('should route a kind pinned to disk to the disk backend even when the env is s3', () => {
    const disk = {} as never;
    const s3 = {} as never;
    vi.spyOn(StorageService, 'getDiskBackend').mockReturnValue(disk);
    vi.spyOn(StorageService, 'getS3Backend').mockReturnValue(s3);
    mocks.config.getEnv.mockReturnValue({ storage: { backend: 's3' } } as never);

    const config = {
      storage: {
        routing: { originals: StorageRouting.S3, thumbnails: StorageRouting.Disk, encodedVideo: StorageRouting.Auto },
      },
    } as never;

    expect(StorageService.getWriteBackend(StorageRoutingKind.Thumbnails, config)).toBe(disk);
    expect(StorageService.getWriteBackend(StorageRoutingKind.Originals, config)).toBe(s3);
    expect(StorageService.getWriteBackend(StorageRoutingKind.EncodedVideo, config)).toBe(s3);
  });

  it('should fall back to disk when a kind resolves to s3 but no s3 backend exists', () => {
    const disk = {} as never;
    vi.spyOn(StorageService, 'getDiskBackend').mockReturnValue(disk);
    vi.spyOn(StorageService, 'getS3Backend').mockReturnValue(undefined);
    mocks.config.getEnv.mockReturnValue({ storage: { backend: 'disk' } } as never);

    const config = {
      storage: {
        routing: { originals: StorageRouting.S3, thumbnails: StorageRouting.Auto, encodedVideo: StorageRouting.Auto },
      },
    } as never;

    expect(StorageService.getWriteBackend(StorageRoutingKind.Originals, config)).toBe(disk);
  });
});

describe('existing env-only startup check', () => {
  it('should still throw when IMMICH_STORAGE_BACKEND is s3 and no bucket is configured', async () => {
    // Unchanged behaviour, pinned so the new validation layers do not accidentally replace it.
    // It runs before SystemConfig is available (BootstrapEventPriority.StorageService = -195 vs
    // SystemConfig = 100), so it cannot become routing-aware.
    mocks.config.getEnv.mockReturnValue(mockEnvData({ storage: { backend: 's3', s3: { bucket: '' } } } as never));

    await expect(sut.onBootstrap()).rejects.toThrow(/IMMICH_STORAGE_BACKEND/);
  });
});

describe('onConfigValidate', () => {
  it('should reject a kind pinned to s3 when no bucket is configured', () => {
    mocks.config.getEnv.mockReturnValue({ storage: { s3: { bucket: '' } } } as never);

    expect(() =>
      sut.onConfigValidate({
        newConfig: {
          storage: {
            routing: { originals: StorageRouting.S3, thumbnails: StorageRouting.Auto, encodedVideo: StorageRouting.S3 },
          },
        },
      } as never),
    ).toThrow(/originals, encodedVideo/);
  });

  it('should allow s3 pins when a bucket is configured', () => {
    mocks.config.getEnv.mockReturnValue({ storage: { s3: { bucket: 'photos' } } } as never);

    expect(() =>
      sut.onConfigValidate({
        newConfig: {
          storage: {
            routing: {
              originals: StorageRouting.S3,
              thumbnails: StorageRouting.Auto,
              encodedVideo: StorageRouting.Auto,
            },
          },
        },
      } as never),
    ).not.toThrow();
  });

  it('should allow disk and auto pins with no bucket', () => {
    mocks.config.getEnv.mockReturnValue({ storage: { s3: { bucket: '' } } } as never);

    expect(() =>
      sut.onConfigValidate({
        newConfig: {
          storage: {
            routing: {
              originals: StorageRouting.Disk,
              thumbnails: StorageRouting.Auto,
              encodedVideo: StorageRouting.Disk,
            },
          },
        },
      } as never),
    ).not.toThrow();
  });
});

describe('onStorageConfigInit', () => {
  it('should log an error but not throw for an s3 pin with no bucket', () => {
    mocks.config.getEnv.mockReturnValue({ storage: { s3: { bucket: '' } } } as never);

    expect(() =>
      sut.onStorageConfigInit({
        newConfig: {
          storage: {
            routing: {
              originals: StorageRouting.S3,
              thumbnails: StorageRouting.Auto,
              encodedVideo: StorageRouting.Auto,
            },
          },
        },
      } as never),
    ).not.toThrow();

    expect(mocks.logger.error).toHaveBeenCalledWith(expect.stringContaining('originals'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pnpm test --run src/services/storage.service.spec.ts`
Expected: FAIL — `StorageService.getWriteBackend is not a function` / `sut.onConfigValidate is not a function`.

- [ ] **Step 3: Implement resolution and validation**

In `server/src/services/storage.service.ts`, add these imports:

```ts
import { resolveRouting, StorageRoutingKind } from 'src/backends/storage-router';
import { SystemConfig } from 'src/config';
import { StorageRouting } from 'src/dtos/system-config.dto';
import { ArgOf } from 'src/repositories/event.repository';
```

Replace the existing `getWriteBackend()` static (lines 39-44) with:

```ts
  static getWriteBackend(kind: StorageRoutingKind, config: SystemConfig): StorageBackend {
    const resolved = resolveRouting(config.storage.routing[kind], StorageService.writeBackendType);
    if (resolved === 's3') {
      if (StorageService.s3Backend) {
        return StorageService.s3Backend;
      }
      // Credentials can be removed from the environment after routing was configured. Failing
      // every write would brick a running instance; disk is always safe because stored keys are
      // self-describing, so the file remains readable wherever it lands.
      StorageService.warnMissingS3Backend(kind);
    }
    return StorageService.diskBackend;
  }

  private static warnedKinds = new Set<StorageRoutingKind>();

  private static warnMissingS3Backend(kind: StorageRoutingKind) {
    if (StorageService.warnedKinds.has(kind)) {
      return;
    }
    StorageService.warnedKinds.add(kind);
    // eslint-disable-next-line no-console
    console.warn(`Storage routing for "${kind}" is set to s3 but no S3 backend is configured; writing to disk.`);
  }
```

Add the two event handlers as instance methods on the class:

```ts
  private getS3PinnedKindsWithoutBucket(config: SystemConfig): StorageRoutingKind[] {
    const { bucket } = this.configRepository.getEnv().storage.s3;
    if (bucket) {
      return [];
    }
    return Object.values(StorageRoutingKind).filter((kind) => config.storage.routing[kind] === StorageRouting.S3);
  }

  @OnEvent({ name: 'ConfigValidate' })
  onConfigValidate({ newConfig }: ArgOf<'ConfigValidate'>) {
    const offending = this.getS3PinnedKindsWithoutBucket(newConfig);
    if (offending.length > 0) {
      throw new Error(
        `Storage routing cannot be set to S3 for ${offending.join(', ')} because IMMICH_S3_BUCKET is not configured.`,
      );
    }
  }

  // Config-file installs never emit ConfigValidate (SystemConfigService.updateSystemConfig rejects
  // outright when IMMICH_CONFIG_FILE is set), so this is their only signal. It logs rather than
  // throws: a config edit must not prevent a running instance from starting.
  @OnEvent({ name: 'ConfigInit' })
  onStorageConfigInit({ newConfig }: ArgOf<'ConfigInit'>) {
    const offending = this.getS3PinnedKindsWithoutBucket(newConfig);
    if (offending.length > 0) {
      this.logger.error(
        `Storage routing is set to S3 for ${offending.join(', ')} but IMMICH_S3_BUCKET is not configured; those files will be written to disk instead.`,
      );
    }
  }
```

The handler is named `onStorageConfigInit`, not `onConfigInit`, because a class may not declare two methods with the same name and other services in this codebase use `onConfigInit` for their own purposes — keep the names distinct to avoid confusion when reading stack traces.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test --run src/services/storage.service.spec.ts`
Expected: PASS. Existing tests in the file must also still pass; if a test constructed `getWriteBackend()` with no arguments, update it to the new signature.

- [ ] **Step 5: Gate and commit**

```bash
cd server && pnpm check && pnpm lint
cd .. && npx prettier --check server/src/services/storage.service.ts server/src/services/storage.service.spec.ts
git add server/src/services/storage.service.ts server/src/services/storage.service.spec.ts
git commit -m "feat(storage): resolve the write backend per file kind"
```

`pnpm check` will report errors in `media.service.ts`, `asset-media.service.ts`, `user.service.ts` and `auth.service.ts` because their `getWriteBackend()` calls no longer typecheck. **That is expected at this point** — Task 3 fixes them. Commit anyway so the two tasks stay reviewable separately, and note the expected failures in the commit body:

```bash
git commit -m "feat(storage): resolve the write backend per file kind" -m "Callers are updated in the following commit; tsc is temporarily red on the four call sites."
```

---

### Task 3: Wire the seven write paths

**Files:**

- Modify: `server/src/services/media.service.ts` (`persistFile` and its four callers)
- Modify: `server/src/services/asset-media.service.ts:396`
- Modify: `server/src/services/user.service.ts:127`
- Modify: `server/src/services/auth.service.ts:407`
- Modify: `server/src/services/media.service.spec.ts`
- Modify: `server/src/services/asset-media.service.spec.ts`
- Modify: `server/src/services/user.service.spec.ts`
- Modify: `server/src/services/auth.service.spec.ts`

**Interfaces:**

- Consumes: `StorageService.getWriteBackend(kind, config)` (Task 2), `StorageRoutingKind` (Task 1)
- Produces: `MediaService.persistFile(localPath, relativeKey, kind, contentType?)`

- [ ] **Step 1: Update the two existing `persistFile` tests**

`server/src/services/media.service.spec.ts:52-84` already has a `describe('persistFile')` block that calls `(sut as any).persistFile('/local/out.jpg', 'thumbs/aa/bb/x.jpg', 'image/jpeg')`. The new signature inserts `kind` third, so **both existing tests must be updated** or they will silently pass `'image/jpeg'` as the kind:

```ts
const result = await (sut as any).persistFile(
  '/local/out.jpg',
  'thumbs/aa/bb/x.jpg',
  StorageRoutingKind.Thumbnails,
  'image/jpeg',
);
```

Keep that block's `afterEach(() => vi.restoreAllMocks())` — its comment explains that `vitest.config.mjs` sets no `restoreMocks` and there are no `setupFiles`, so a `getWriteBackend` spy leaks into every later test in the file and silently runs the disk-mode tests against S3.

- [ ] **Step 2: Write the failing routing tests**

Add to `server/src/services/media.service.spec.ts`, directly after the existing `persistFile` block:

```ts
describe('persistFile routing', () => {
  afterEach(() => {
    // Same leak hazard as the block above.
    vi.restoreAllMocks();
  });

  it('passes the caller-supplied kind through to getWriteBackend', async () => {
    const put = vi.fn().mockResolvedValue(void 0);
    const stream = makeStream([Buffer.from('data')]);
    const { StorageService } = await import('src/services/storage.service.js');
    const getWriteBackend = vi.spyOn(StorageService, 'getWriteBackend').mockReturnValue({ put } as any);
    mocks.storage.createPlainReadStream.mockReturnValue(stream as any);

    await (sut as any).persistFile(
      '/local/out.mp4',
      'encoded-video/aa/bb/x.mp4',
      StorageRoutingKind.EncodedVideo,
      'video/mp4',
    );

    expect(getWriteBackend).toHaveBeenCalledWith(StorageRoutingKind.EncodedVideo, expect.anything());
  });

  it('resolves the backend exactly once per call', async () => {
    const put = vi.fn().mockResolvedValue(void 0);
    const stream = makeStream([Buffer.from('data')]);
    const { StorageService } = await import('src/services/storage.service.js');
    const getWriteBackend = vi.spyOn(StorageService, 'getWriteBackend').mockReturnValue({ put } as any);
    mocks.storage.createPlainReadStream.mockReturnValue(stream as any);

    await (sut as any).persistFile('/local/out.jpg', 'thumbs/aa/bb/x.jpg', StorageRoutingKind.Thumbnails, 'image/jpeg');

    // Resolving twice would let a concurrent config save upload without unlinking
    // (orphaned local file) or unlink without uploading (data loss).
    expect(getWriteBackend).toHaveBeenCalledTimes(1);
  });

  it('takes the disk branch when the resolved backend is the disk backend', async () => {
    const { StorageService } = await import('src/services/storage.service.js');
    const { DiskStorageBackend } = await import('src/backends/disk-storage.backend.js');
    const diskBackend = Object.create(DiskStorageBackend.prototype);
    vi.spyOn(StorageService, 'getWriteBackend').mockReturnValue(diskBackend as any);

    const result = await (sut as any).persistFile(
      '/local/out.jpg',
      'thumbs/aa/bb/x.jpg',
      StorageRoutingKind.Thumbnails,
      'image/jpeg',
    );

    // This is also spec test 10: a kind that resolves to s3 with no S3 backend gets the
    // disk backend from getWriteBackend, and must not lose the file.
    expect(result).toBe('/local/out.jpg');
    expect(mocks.storage.unlink).not.toHaveBeenCalled();
  });

  it('uses one resolved backend for every file in a persistImageFiles batch', async () => {
    const put = vi.fn().mockResolvedValue(void 0);
    const stream = makeStream([Buffer.from('data')]);
    const { StorageService } = await import('src/services/storage.service.js');
    const getWriteBackend = vi.spyOn(StorageService, 'getWriteBackend').mockReturnValue({ put } as any);
    mocks.storage.createPlainReadStream.mockReturnValue(stream as any);

    const asset = { id: 'asset-1', ownerId: 'user-1' };
    const files = [
      {
        assetId: 'asset-1',
        type: AssetFileType.Thumbnail,
        path: '/local/a.webp',
        isEdited: false,
        isProgressive: false,
        isTransparent: false,
      },
      {
        assetId: 'asset-1',
        type: AssetFileType.Preview,
        path: '/local/b.jpeg',
        isEdited: false,
        isProgressive: false,
        isTransparent: false,
      },
    ];

    await (sut as any).persistImageFiles(asset, files);

    expect(getWriteBackend).toHaveBeenCalledTimes(2);
    for (const call of getWriteBackend.mock.calls) {
      expect(call[0]).toBe(StorageRoutingKind.Thumbnails);
    }
    expect(files.every((file) => !file.path.startsWith('/local/'))).toBe(true);
  });
});
```

Import `StorageRoutingKind` from `src/backends/storage-router` at the top of the spec.

- [ ] **Step 3: Write the failing tests for the other three services**

In `asset-media.service.spec.ts`, `user.service.spec.ts` and `auth.service.spec.ts`, spy on `StorageService.getWriteBackend` the same way and assert the **kind argument**, which is what these tasks actually change:

- `asset-media.service.spec.ts`: uploading an asset calls `getWriteBackend` with `StorageRoutingKind.Originals`; when the returned backend is an S3 stub, both the original and the sidecar are `put` and both temp paths are queued for `JobName.FileDelete`; when it is a `DiskStorageBackend` instance, no `put` happens and `originalPath` stays absolute.
- `user.service.spec.ts`: `createProfileImage` calls `getWriteBackend` with `StorageRoutingKind.Thumbnails` — **not** `Originals`.
- `auth.service.spec.ts`: the OAuth profile-picture sync path calls `getWriteBackend` with `StorageRoutingKind.Thumbnails`.

Each of these three spec files already constructs `sut`/`mocks` via `newTestService`; reuse that and add a `vi.restoreAllMocks()` in the new block's `afterEach` for the same spy-leak reason.

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd server && pnpm test --run src/services/media.service.spec.ts src/services/asset-media.service.spec.ts src/services/user.service.spec.ts src/services/auth.service.spec.ts
```

Expected: FAIL — `getWriteBackend` still takes no arguments, so the kind assertions fail.

- [ ] **Step 5: Thread the kind through `persistFile`**

In `server/src/services/media.service.ts`, replace `persistFile` (lines 79-97) with:

```ts
  /**
   * After generating a file locally, uploads it to the backend this kind routes to.
   * Returns the key to store in the DB.
   *
   * The backend is resolved ONCE here and both branches read that single value. Resolving
   * twice would let a concurrent config save produce an upload with no unlink (orphaned
   * local file) or an unlink with no upload (data loss).
   */
  private async persistFile(
    localPath: string,
    relativeKey: string,
    kind: StorageRoutingKind,
    contentType?: string,
  ): Promise<string> {
    const config = await this.getConfig({ withCache: true });
    const writeBackend = StorageService.getWriteBackend(kind, config);
    if (!writeBackend || writeBackend instanceof DiskStorageBackend) {
      // Disk mode: the file was already written to the final path
      return localPath;
    }
    // S3 mode: upload the locally-generated file
    const stream = this.storageRepository.createPlainReadStream(localPath);
    await writeBackend.put(relativeKey, stream, { contentType });
    // Clean up local temp file
    await this.storageRepository.unlink(localPath).catch(() => {
      /* ignore */
    });
    return relativeKey;
  }
```

Add the import:

```ts
import { StorageRoutingKind } from 'src/backends/storage-router';
```

Update the four call sites:

1. `persistImageFiles` (around line 111):

```ts
file.path = await this.persistFile(file.path, relativeKey, StorageRoutingKind.Thumbnails, mimeTypes.lookup(file.path));
```

2. Edited encoded video (around line 380):

```ts
const editedVideoPath = await this.persistFile(
  outputPath,
  StorageCore.getRelativeEditedEncodedVideoPath(asset),
  StorageRoutingKind.EncodedVideo,
  'video/mp4',
);
```

3. Person thumbnail (around line 709):

```ts
const finalPath = await this.persistFile(thumbnailPath, relativeKey, StorageRoutingKind.Thumbnails, 'image/jpeg');
```

4. Encoded video (around line 909):

```ts
const finalPath = await this.persistFile(output, relativeKey, StorageRoutingKind.EncodedVideo, 'video/mp4');
```

- [ ] **Step 6: Update the three remaining call sites**

`server/src/services/asset-media.service.ts` around line 396 — a `config` may not be in scope here; fetch one:

```ts
// If this kind routes to S3, upload the file and update the path
const config = await this.getConfig({ withCache: true });
writeBackend = StorageService.getWriteBackend(StorageRoutingKind.Originals, config);
```

`server/src/services/user.service.ts` line 127 — a `config` is already in scope from line 118:

```ts
const writeBackend = StorageService.getWriteBackend(StorageRoutingKind.Thumbnails, config);
```

`server/src/services/auth.service.ts` line 407 — a `config` is already in scope from line 399:

```ts
const writeBackend = StorageService.getWriteBackend(StorageRoutingKind.Thumbnails, config);
```

Add `import { StorageRoutingKind } from 'src/backends/storage-router';` to each of the three files.

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd server && pnpm test --run src/services/media.service.spec.ts src/services/asset-media.service.spec.ts src/services/user.service.spec.ts src/services/auth.service.spec.ts
cd server && pnpm check
```

Expected: PASS, and `pnpm check` is now clean again (Task 2's temporary red is resolved).

- [ ] **Step 8: Gate and commit**

```bash
cd server && pnpm lint
cd .. && npx prettier --check "server/src/services/*.ts"
git add server/src/services/media.service.ts server/src/services/asset-media.service.ts \
  server/src/services/user.service.ts server/src/services/auth.service.ts \
  server/src/services/media.service.spec.ts server/src/services/asset-media.service.spec.ts \
  server/src/services/user.service.spec.ts server/src/services/auth.service.spec.ts
git commit -m "feat(storage): route each write path by its file kind"
```

---

### Task 4: Per-kind migration validation

**Files:**

- Modify: `server/src/services/storage-migration.service.ts:24-34`
- Modify: `server/src/services/storage-migration.service.spec.ts`

**Interfaces:**

- Consumes: `MIGRATION_FILE_TYPE_TO_KIND`, `resolveRouting`, `StorageMigrationFileType` (Task 1)
- Produces: `validateRouting(direction, fileTypes, config)` replaces `validateBackendConfig(direction)`

- [ ] **Step 1: Write the failing tests**

Add to `server/src/services/storage-migration.service.spec.ts`, reusing the file's existing `sut`/`mocks` setup:

```ts
describe('per-kind routing validation', () => {
  const routing = (originals: string, thumbnails: string, encodedVideo: string) => ({
    storage: { routing: { originals, thumbnails, encodedVideo } },
  });

  const allFileTypes = {
    originals: false,
    thumbnails: false,
    previews: false,
    fullsize: false,
    encodedVideos: false,
    sidecars: false,
    personThumbnails: false,
    profileImages: false,
  };

  beforeEach(() => {
    mocks.config.getEnv.mockReturnValue({ storage: { backend: 'disk', s3: { bucket: 'photos' } } } as never);
  });

  it('should reject migrating thumbnails to disk while they route to s3', async () => {
    mocks.systemMetadata.get.mockResolvedValue(routing('auto', 's3', 'auto'));

    await expect(
      sut.start({
        direction: 'toDisk',
        deleteSource: false,
        concurrency: 5,
        fileTypes: { ...allFileTypes, thumbnails: true },
      }),
    ).rejects.toThrow(/thumbnails/);
  });

  it('should name every contradicting kind, not just the first', async () => {
    mocks.systemMetadata.get.mockResolvedValue(routing('s3', 's3', 'auto'));

    await expect(
      sut.start({
        direction: 'toDisk',
        deleteSource: false,
        concurrency: 5,
        fileTypes: { ...allFileTypes, originals: true, thumbnails: true },
      }),
    ).rejects.toThrow(/originals[\s\S]*thumbnails|thumbnails[\s\S]*originals/);
  });

  it('should explain that an auto knob resolved via the env var', async () => {
    mocks.systemMetadata.get.mockResolvedValue(routing('auto', 'auto', 'auto'));
    mocks.config.getEnv.mockReturnValue({ storage: { backend: 's3', s3: { bucket: 'photos' } } } as never);

    await expect(
      sut.start({
        direction: 'toDisk',
        deleteSource: false,
        concurrency: 5,
        fileTypes: { ...allFileTypes, thumbnails: true },
      }),
    ).rejects.toThrow(/IMMICH_STORAGE_BACKEND/);
  });

  it('should accept a selection whose kinds all match the direction', async () => {
    mocks.systemMetadata.get.mockResolvedValue(routing('auto', 'disk', 'auto'));
    mocks.storageMigration.getFileCounts.mockResolvedValue({
      originals: 0,
      thumbnails: 3,
      previews: 0,
      fullsize: 0,
      sidecars: 0,
      encodedVideos: 0,
      personThumbnails: 0,
      profileImages: 0,
    });
    mocks.job.isActive.mockResolvedValue(false);

    await expect(
      sut.start({
        direction: 'toDisk',
        deleteSource: false,
        concurrency: 5,
        fileTypes: { ...allFileTypes, thumbnails: true },
      }),
    ).resolves.toEqual({ batchId: expect.any(String) });
  });

  it('should re-validate at dequeue and fail when routing changed after start', async () => {
    // start() validated against the old routing; the job runs later. A batch that would no
    // longer converge must fail rather than half-migrate.
    mocks.systemMetadata.get.mockResolvedValue(routing('auto', 's3', 'auto'));

    await expect(
      sut.handleQueueAll({
        direction: 'toDisk',
        deleteSource: false,
        concurrency: 5,
        batchId: 'batch-1',
        fileTypes: { ...allFileTypes, thumbnails: true },
      } as never),
    ).rejects.toThrow(/thumbnails/);

    expect(mocks.job.queueAll).not.toHaveBeenCalled();
  });

  it('should ignore the routing of file types that were not selected', async () => {
    mocks.systemMetadata.get.mockResolvedValue(routing('s3', 'disk', 's3'));
    mocks.storageMigration.getFileCounts.mockResolvedValue({
      originals: 0,
      thumbnails: 3,
      previews: 0,
      fullsize: 0,
      sidecars: 0,
      encodedVideos: 0,
      personThumbnails: 0,
      profileImages: 0,
    });
    mocks.job.isActive.mockResolvedValue(false);

    await expect(
      sut.start({
        direction: 'toDisk',
        deleteSource: false,
        concurrency: 5,
        fileTypes: { ...allFileTypes, thumbnails: true },
      }),
    ).resolves.toEqual({ batchId: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && pnpm test --run src/services/storage-migration.service.spec.ts`
Expected: FAIL — the current global check rejects or accepts on `IMMICH_STORAGE_BACKEND` alone.

- [ ] **Step 3: Replace the global check**

In `server/src/services/storage-migration.service.ts`, add imports:

```ts
import {
  MIGRATION_FILE_TYPE_TO_KIND,
  resolveRouting,
  StorageMigrationFileType,
  StorageRoutingKind,
} from 'src/backends/storage-router';
import { StorageRouting } from 'src/dtos/system-config.dto';
```

Replace `validateBackendConfig` (lines 24-34) with:

```ts
  private async validateRouting(
    direction: StorageMigrationDirection,
    fileTypes: StorageMigrationFileTypes,
  ): Promise<void> {
    const target = direction === 'toS3' ? 's3' : 'disk';
    const config = await this.getConfig({ withCache: true });
    const envBackend = this.configRepository.getEnv().storage.backend;

    // A kind whose new writes go elsewhere would never converge: migrate the backlog and the
    // very next thumbnail lands back on the other backend. Reject before queueing anything.
    const offending = new Map<StorageRoutingKind, string>();
    for (const [fileType, selected] of Object.entries(fileTypes) as Array<[StorageMigrationFileType, boolean]>) {
      if (!selected) {
        continue;
      }
      const kind = MIGRATION_FILE_TYPE_TO_KIND[fileType];
      const routing = config.storage.routing[kind];
      if (resolveRouting(routing, envBackend) !== target) {
        const via = routing === StorageRouting.Auto ? ' (via IMMICH_STORAGE_BACKEND)' : '';
        offending.set(kind, `${kind} is routed to ${resolveRouting(routing, envBackend)}${via}`);
      }
    }

    if (offending.size > 0) {
      throw new BadRequestException(
        `Cannot migrate to ${target}: ${[...offending.values()].join('; ')}. ` +
          `Change the storage routing for those kinds first.`,
      );
    }
  }
```

Update the two callers: `start()` (line 78) becomes `await this.validateRouting(options.direction, options.fileTypes);` and `handleQueueAll` (line 123) becomes `await this.validateRouting(direction, fileTypes);`.

`handleQueueAll` re-validates at dequeue on purpose: routing can change between `start()` and the job actually running, and a batch that would no longer converge must fail rather than half-migrate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && pnpm test --run src/services/storage-migration.service.spec.ts`
Expected: PASS. Existing tests asserting the old global message must be updated to the new one.

- [ ] **Step 5: Gate and commit**

```bash
cd server && pnpm check && pnpm lint
cd .. && npx prettier --check server/src/services/storage-migration.service.ts server/src/services/storage-migration.service.spec.ts
git add server/src/services/storage-migration.service.ts server/src/services/storage-migration.service.spec.ts
git commit -m "feat(storage): validate storage migrations per file kind"
```

---

### Task 5: Companion fixes — external libraries and startup determinism

Two latent bugs that become materially more likely once mixed storage is permanent.

**Files:**

- Modify: `server/src/repositories/storage-migration.repository.ts`
- Modify: `server/src/repositories/asset.repository.ts:1068`
- Modify: `server/src/services/storage.service.ts` (media-location check)
- Modify: `server/src/services/storage.service.spec.ts`
- Modify: `server/src/cores/storage.core.spec.ts`
- Create/modify: `server/test/medium/specs/storage-migration.medium.spec.ts` (follow whatever medium-spec layout the repo already uses — check `server/test/medium/specs/` first and match it)

**Interfaces:**

- Produces: `StorageMigrationRepository.getRoutingCounts(): Promise<Record<StorageRoutingKind, { disk: number; s3: number }>>`

- [ ] **Step 1: Write the failing tests**

Medium tests (real DB) for the repository:

```ts
describe('external library exclusion', () => {
  it('should not stream external-library originals', async () => {
    // insert one owned asset with originalPath '/data/library/u/a.jpg'
    // insert one external asset (libraryId set) with originalPath '/mnt/nas/photos/b.jpg'
    const rows = [];
    for await (const row of sut.streamOriginals('toS3')) {
      rows.push(row);
    }
    expect(rows.map((r) => r.originalPath)).toEqual(['/data/library/u/a.jpg']);
  });

  it('should not stream external-library sidecars but should stream their thumbnails', async () => {
    // external asset with a Sidecar asset_file and a Thumbnail asset_file, both absolute
    const rows = [];
    for await (const row of sut.streamAssetFiles('toS3', [AssetFileType.Sidecar, AssetFileType.Thumbnail])) {
      rows.push(row);
    }
    expect(rows.map((r) => r.type)).toEqual([AssetFileType.Thumbnail]);
  });
});

describe('getRoutingCounts', () => {
  it('should return zero for every kind on an empty library', async () => {
    await expect(sut.getRoutingCounts()).resolves.toEqual({
      originals: { disk: 0, s3: 0 },
      thumbnails: { disk: 0, s3: 0 },
      encodedVideo: { disk: 0, s3: 0 },
    });
  });

  it('should exclude empty person thumbnail and profile image paths', async () => {
    // person with thumbnailPath '', user with profileImagePath ''
    const counts = await sut.getRoutingCounts();
    expect(counts.thumbnails).toEqual({ disk: 0, s3: 0 });
  });

  it('should have disk and s3 counts that sum to the total for every kind', async () => {
    // Seed a mixed fixture: some absolute paths, some relative keys, for each kind.
    const counts = await sut.getRoutingCounts();

    expect(counts.originals.disk + counts.originals.s3).toBe(expectedOriginalsTotal);
    expect(counts.thumbnails.disk + counts.thumbnails.s3).toBe(expectedThumbnailsTotal);
    expect(counts.encodedVideo.disk + counts.encodedVideo.s3).toBe(expectedEncodedVideoTotal);
  });

  it('should agree with the streams for every kind and direction', async () => {
    // Seed a mixed fixture, then for each direction count the rows each stream yields and
    // compare against getRoutingCounts. This is the drift guard: the shared predicate is a
    // requirement, and a hand-copied second predicate fails here.
    for (const direction of ['toS3', 'toDisk'] as const) {
      const streamed = { originals: 0, thumbnails: 0, encodedVideo: 0 };
      for await (const _ of sut.streamOriginals(direction)) {
        streamed.originals++;
      }
      // ...repeat for streamAssetFiles (sidecars into originals, thumbnail types into
      // thumbnails), streamEncodedVideos, streamPersonThumbnails, streamProfileImages

      const counts = await sut.getRoutingCounts();
      const side = direction === 'toS3' ? 'disk' : 's3';
      expect(streamed.originals).toBe(counts.originals[side]);
      expect(streamed.thumbnails).toBe(counts.thumbnails[side]);
      expect(streamed.encodedVideo).toBe(counts.encodedVideo[side]);
    }
  });
});
```

Unit tests for startup determinism, in `storage.service.spec.ts`:

```ts
describe('media location check with mixed storage', () => {
  it('should skip the location check when no disk-resident file exists', async () => {
    mocks.asset.getFileSamples.mockResolvedValue([]);
    mocks.systemMetadata.get.mockResolvedValue({ location: '/old/location' });

    await expect(sut.onBootstrap()).resolves.not.toThrow();
    expect(mocks.database.migrateFilePaths).not.toHaveBeenCalled();
  });
});
```

And in `storage.core.spec.ts`:

```ts
it('should not move a file whose path is a relative S3 key', async () => {
  await sut.moveFile({
    entityId: 'asset-1',
    pathType: AssetPathType.Original,
    oldPath: 'thumbs/user/ab/cd/abcd_thumbnail.webp',
    newPath: '/data/thumbs/user/ab/cd/abcd_thumbnail.webp',
  });

  expect(mocks.move.create).not.toHaveBeenCalled();
  expect(mocks.storage.rename).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && pnpm test --run src/services/storage.service.spec.ts src/cores/storage.core.spec.ts
cd server && pnpm test:medium --run test/medium/specs/storage-migration.medium.spec.ts
```

The `moveFile` test may already pass — it pins existing behaviour rather than changing it. That is fine and intended; note it in the commit message so a reviewer is not confused by a test that never went red.

**If a fresh worktree cannot run medium tests**, build the SDKs first:

```bash
pnpm --filter @immich/sdk build && pnpm --filter @immich/plugin-sdk build
```

An unbuilt medium run **exits 0** while 143/169 files fail collection — read the `Test Files` line, never the exit code.

- [ ] **Step 3: Add the shared predicate and external-library filter**

In `server/src/repositories/storage-migration.repository.ts`, add near the top:

```ts
/**
 * Path-shape predicate shared by the streams and the routing counts. A hand-copied second
 * predicate is how the settings page ends up nagging an admin toward a migration that
 * detaches their external library.
 */
const pathOperator = (direction: StorageMigrationDirection) => (direction === 'toS3' ? 'like' : ('not like' as const));
const PATH_PATTERN = '/%';
```

Add `.where('asset.libraryId', 'is', null)` to `streamOriginals`, and to `streamAssetFiles` restrict it to sidecars only:

```ts
  streamAssetFiles(direction: StorageMigrationDirection, fileTypes: AssetFileType[]) {
    return this.db
      .selectFrom('asset_file')
      .innerJoin('asset', 'asset.id', 'asset_file.assetId')
      .select(['asset_file.id', 'asset_file.assetId', 'asset_file.path', 'asset_file.type'])
      .where('asset_file.type', 'in', fileTypes)
      // External-library originals and their sidecars live outside the media location and are
      // matched on by the library scanner. Rewriting their paths detaches the asset from its
      // source file. Immich-generated derivatives of external assets stay migratable.
      .where((eb) =>
        eb.or([eb('asset_file.type', '!=', AssetFileType.Sidecar), eb('asset.libraryId', 'is', null)]),
      )
      .$if(direction === 'toS3', (qb) => qb.where('asset_file.path', 'like', PATH_PATTERN))
      .$if(direction === 'toDisk', (qb) => qb.where('asset_file.path', 'not like', PATH_PATTERN))
      .stream();
  }
```

Apply the same `asset.libraryId is null` predicate to the originals branch of `getFileCounts`.

- [ ] **Step 4: Add `getRoutingCounts`**

```ts
  async getRoutingCounts(): Promise<Record<StorageRoutingKind, { disk: number; s3: number }>> {
    // One pass per table: `filter (where path like '/%')` gives the disk count and its
    // complement gives the s3 count, so both directions come out of a single scan.
    const [originals, assetFiles, encodedVideos, personThumbnails, profileImages] = await Promise.all([
      this.db
        .selectFrom('asset')
        .select((eb) => [
          eb.fn.countAll<number>().filterWhere('originalPath', 'like', PATH_PATTERN).as('disk'),
          eb.fn.countAll<number>().filterWhere('originalPath', 'not like', PATH_PATTERN).as('s3'),
        ])
        .where('libraryId', 'is', null)
        .executeTakeFirstOrThrow(),

      this.db
        .selectFrom('asset_file')
        .innerJoin('asset', 'asset.id', 'asset_file.assetId')
        .select((eb) => [
          eb.fn
            .countAll<number>()
            .filterWhere(eb.and([eb('asset_file.type', '=', AssetFileType.Sidecar), eb('asset_file.path', 'like', PATH_PATTERN)]))
            .as('sidecarDisk'),
          eb.fn
            .countAll<number>()
            .filterWhere(eb.and([eb('asset_file.type', '=', AssetFileType.Sidecar), eb('asset_file.path', 'not like', PATH_PATTERN)]))
            .as('sidecarS3'),
          eb.fn
            .countAll<number>()
            .filterWhere(eb.and([eb('asset_file.type', 'in', THUMBNAIL_FILE_TYPES), eb('asset_file.path', 'like', PATH_PATTERN)]))
            .as('thumbDisk'),
          eb.fn
            .countAll<number>()
            .filterWhere(eb.and([eb('asset_file.type', 'in', THUMBNAIL_FILE_TYPES), eb('asset_file.path', 'not like', PATH_PATTERN)]))
            .as('thumbS3'),
        ])
        .where((eb) => eb.or([eb('asset_file.type', '!=', AssetFileType.Sidecar), eb('asset.libraryId', 'is', null)]))
        .executeTakeFirstOrThrow(),

      this.db
        .selectFrom('asset_file')
        .select((eb) => [
          eb.fn.countAll<number>().filterWhere('path', 'like', PATH_PATTERN).as('disk'),
          eb.fn.countAll<number>().filterWhere('path', 'not like', PATH_PATTERN).as('s3'),
        ])
        .where('type', '=', AssetFileType.EncodedVideo)
        .executeTakeFirstOrThrow(),

      this.db
        .selectFrom('person')
        .select((eb) => [
          eb.fn.countAll<number>().filterWhere('thumbnailPath', 'like', PATH_PATTERN).as('disk'),
          eb.fn.countAll<number>().filterWhere('thumbnailPath', 'not like', PATH_PATTERN).as('s3'),
        ])
        .where('thumbnailPath', '!=', '')
        .executeTakeFirstOrThrow(),

      this.db
        .selectFrom('user')
        .select((eb) => [
          eb.fn.countAll<number>().filterWhere('profileImagePath', 'like', PATH_PATTERN).as('disk'),
          eb.fn.countAll<number>().filterWhere('profileImagePath', 'not like', PATH_PATTERN).as('s3'),
        ])
        .where('profileImagePath', '!=', '')
        .executeTakeFirstOrThrow(),
    ]);

    return {
      [StorageRoutingKind.Originals]: {
        disk: originals.disk + assetFiles.sidecarDisk,
        s3: originals.s3 + assetFiles.sidecarS3,
      },
      [StorageRoutingKind.Thumbnails]: {
        disk: assetFiles.thumbDisk + personThumbnails.disk + profileImages.disk,
        s3: assetFiles.thumbS3 + personThumbnails.s3 + profileImages.s3,
      },
      [StorageRoutingKind.EncodedVideo]: { disk: encodedVideos.disk, s3: encodedVideos.s3 },
    };
  }
```

with, near the top of the file:

```ts
const THUMBNAIL_FILE_TYPES = [AssetFileType.Thumbnail, AssetFileType.Preview, AssetFileType.FullSize];
```

**Note:** `EncodedVideo` rows live in `asset_file` alongside thumbnails. Confirm that the `encodedVideos` count and the `thumbnails` count do not double-count by checking `AssetFileType` values before running — if `EncodedVideo` is a member of the same table, the `THUMBNAIL_FILE_TYPES` list above already excludes it, which is why it is written as an explicit allowlist rather than a negation.

- [ ] **Step 5: Fix `getFileSamples` and the media-location check**

In `server/src/repositories/asset.repository.ts`, replace `getFileSamples` (line 1068):

```ts
  getFileSamples() {
    // Only disk-resident files: the media location describes filesystem paths, so a relative
    // S3 key is never a valid sample. Without this filter, an unordered `limit 3` on a mixed
    // install returns an S3 key at random and the location check below throws
    // InconsistentMediaLocation on some restarts but not others.
    return this.db
      .selectFrom('asset_file')
      .select(['assetId', 'path'])
      .where('path', 'like', '/%')
      .limit(sql.lit(3))
      .execute();
  }
```

No change is needed in `storage.service.ts` beyond confirming the existing `if (samples.length > 0)` guard now correctly skips the check when the library is entirely on S3 — read lines 143-178 and verify, then add a comment recording why the guard is load-bearing.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd server && pnpm test --run src/services/storage.service.spec.ts src/cores/storage.core.spec.ts
cd server && pnpm test:medium --run test/medium/specs/storage-migration.medium.spec.ts
cd server && pnpm check && pnpm lint
```

Check the reported `Test Files` count matches what you expect — a green run of zero files is the worst outcome here.

- [ ] **Step 7: Commit**

```bash
git add server/src/repositories/storage-migration.repository.ts server/src/repositories/asset.repository.ts \
  server/src/services/storage.service.ts server/src/services/storage.service.spec.ts \
  server/src/cores/storage.core.spec.ts server/test/medium/specs/storage-migration.medium.spec.ts
git commit -m "fix(storage): exclude external libraries from migration and stabilise the media-location check"
```

---

### Task 6: Routing status endpoint, S3 feature flag, OpenAPI

**Files:**

- Modify: `server/src/dtos/storage-migration.dto.ts`
- Modify: `server/src/services/storage-migration.service.ts`
- Modify: `server/src/controllers/storage-migration.controller.ts`
- Modify: `server/src/dtos/server.dto.ts`
- Modify: `server/src/services/server.service.ts:119`
- Modify: `server/src/services/server.service.spec.ts`
- Modify: `server/src/services/storage-migration.service.spec.ts`
- Regenerate: `open-api/immich-openapi-specs.json`, `packages/sdk/src/fetch-client.ts`, `mobile/openapi/**`

**Interfaces:**

- Produces:
  - `GET /storage-migration/routing` → `{ originals: { routedTo, misplacedCount }, thumbnails: {...}, encodedVideo: {...} }`
  - `ServerFeaturesDto.s3Storage: boolean`

- [ ] **Step 1: Write the failing tests**

In `server/src/services/storage-migration.service.spec.ts`:

```ts
describe('getRoutingStatus', () => {
  it('should report the resolved backend and the count on the other backend', async () => {
    mocks.config.getEnv.mockReturnValue({ storage: { backend: 's3', s3: { bucket: 'photos' } } } as never);
    mocks.systemMetadata.get.mockResolvedValue({
      storage: { routing: { originals: 'auto', thumbnails: 'disk', encodedVideo: 'auto' } },
    });
    mocks.storageMigration.getRoutingCounts.mockResolvedValue({
      originals: { disk: 4, s3: 100 },
      thumbnails: { disk: 20, s3: 7 },
      encodedVideo: { disk: 0, s3: 3 },
    });

    await expect(sut.getRoutingStatus()).resolves.toEqual({
      originals: { routedTo: 's3', misplacedCount: 4 },
      thumbnails: { routedTo: 'disk', misplacedCount: 7 },
      encodedVideo: { routedTo: 's3', misplacedCount: 0 },
    });
  });

  it('should never return auto as the resolved backend', async () => {
    mocks.config.getEnv.mockReturnValue({ storage: { backend: 'disk', s3: { bucket: '' } } } as never);
    mocks.systemMetadata.get.mockResolvedValue({});
    mocks.storageMigration.getRoutingCounts.mockResolvedValue({
      originals: { disk: 0, s3: 0 },
      thumbnails: { disk: 0, s3: 0 },
      encodedVideo: { disk: 0, s3: 0 },
    });

    const status = await sut.getRoutingStatus();

    for (const value of Object.values(status)) {
      expect(['disk', 's3']).toContain(value.routedTo);
    }
  });
});
```

In `server/src/services/server.service.spec.ts`, extend the existing `getFeatures` test's expected object with `s3Storage: false`, and add:

```ts
it('should report s3Storage when a bucket is configured', async () => {
  mocks.config.getEnv.mockReturnValue({ storage: { s3: { bucket: 'photos' } } } as never);
  await expect(sut.getFeatures()).resolves.toEqual(expect.objectContaining({ s3Storage: true }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && pnpm test --run src/services/storage-migration.service.spec.ts src/services/server.service.spec.ts
```

Expected: FAIL — `sut.getRoutingStatus is not a function`, and `s3Storage` missing from the features object.

- [ ] **Step 3: Add the DTO**

In `server/src/dtos/storage-migration.dto.ts`, append before the exported classes:

```ts
const StorageRoutingStatusEntrySchema = z
  .object({
    routedTo: z.enum(['disk', 's3']).describe('The resolved backend new files of this kind are written to'),
    misplacedCount: z.int().describe('Number of files of this kind currently stored on the other backend'),
  })
  .meta({ id: 'StorageRoutingStatusEntryDto' });

const StorageRoutingStatusSchema = z
  .object({
    originals: StorageRoutingStatusEntrySchema,
    thumbnails: StorageRoutingStatusEntrySchema,
    encodedVideo: StorageRoutingStatusEntrySchema,
  })
  .meta({ id: 'StorageRoutingStatusDto' });
```

and add `export class StorageRoutingStatusDto extends createZodDto(StorageRoutingStatusSchema) {}`.

- [ ] **Step 4: Add the service method and the endpoint**

In `storage-migration.service.ts`:

```ts
  async getRoutingStatus() {
    const config = await this.getConfig({ withCache: true });
    const envBackend = this.configRepository.getEnv().storage.backend;
    const counts = await this.storageMigrationRepository.getRoutingCounts();

    const entry = (kind: StorageRoutingKind) => {
      const routedTo = resolveRouting(config.storage.routing[kind], envBackend);
      // "Misplaced" is whatever sits on the backend this kind is NOT routed to.
      return { routedTo, misplacedCount: routedTo === 's3' ? counts[kind].disk : counts[kind].s3 };
    };

    return {
      originals: entry(StorageRoutingKind.Originals),
      thumbnails: entry(StorageRoutingKind.Thumbnails),
      encodedVideo: entry(StorageRoutingKind.EncodedVideo),
    };
  }
```

In `storage-migration.controller.ts`, add after `getEstimate`:

```ts
  @Get('routing')
  @Authenticated({ permission: Permission.JobRead, admin: true })
  @Endpoint({
    summary: 'Get storage routing status',
    description:
      'Report, per file kind, which backend new files are written to and how many existing files are on the other backend.',
    history: new HistoryBuilder().added('v2.8.0').alpha('v2.8.0'),
  })
  getRoutingStatus(): Promise<StorageRoutingStatusDto> {
    return this.service.getRoutingStatus();
  }
```

Check the repo's current version before writing `added('v2.8.0')` — use the next unreleased version, matching how the neighbouring endpoints are annotated.

- [ ] **Step 5: Add the feature flag**

In `server/src/dtos/server.dto.ts`, add to `ServerFeaturesSchema` after `realtimeTranscoding`:

```ts
    s3Storage: z.boolean().describe('Whether an S3 storage backend is configured'),
```

In `server/src/services/server.service.ts` `getFeatures()`, extend the env destructure and the returned object:

```ts
    const { configFile, peopleStatistics, storage } = this.configRepository.getEnv();
    // ...
      s3Storage: !!storage.s3.bucket,
```

- [ ] **Step 6: Run tests, then regenerate the API clients**

```bash
cd server && pnpm test --run src/services/storage-migration.service.spec.ts src/services/server.service.spec.ts
cd server && pnpm check && pnpm lint
cd server && pnpm build && node ./dist/bin/sync-open-api.js
cd .. && mise run open-api-typescript
mise run open-api-dart
```

Do **not** run `mise open-api` — its `//server:...` tasks resolve to the main checkout, not this worktree.

Verify the Dart client actually regenerated by grepping (git shows those files as `Bin N -> M bytes` because `.gitattributes` marks them `-diff`):

```bash
grep -rl "s3Storage" mobile/openapi/lib/ | head
grep -rl "StorageRoutingStatus" mobile/openapi/lib/ | head
```

Both must return at least one file.

- [ ] **Step 7: Commit**

```bash
git add server/src/dtos/storage-migration.dto.ts server/src/dtos/server.dto.ts \
  server/src/services/storage-migration.service.ts server/src/services/server.service.ts \
  server/src/controllers/storage-migration.controller.ts \
  server/src/services/storage-migration.service.spec.ts server/src/services/server.service.spec.ts \
  open-api/immich-openapi-specs.json packages/sdk/src/fetch-client.ts mobile/openapi
git commit -m "feat(storage): expose routing status and an s3Storage feature flag"
```

---

### Task 7: Per-option `disabled` on `SettingSelect`

**Files:**

- Modify: `web/src/routes/admin/system-settings/SettingSelect.svelte`
- Create: `web/src/routes/admin/system-settings/SettingSelect.spec.ts`

**Interfaces:**

- Produces: `options: { value: string | number; text: string; disabled?: boolean }[]`

- [ ] **Step 1: Write the failing test**

Create `web/src/routes/admin/system-settings/SettingSelect.spec.ts`:

```ts
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import SettingSelect from './SettingSelect.svelte';

describe('SettingSelect', () => {
  it('disables only the option marked disabled', () => {
    render(SettingSelect, {
      props: {
        value: 'a',
        name: 'test',
        label: 'Test',
        options: [
          { value: 'a', text: 'A' },
          { value: 'b', text: 'B', disabled: true },
        ],
      },
    });

    expect(screen.getByRole('option', { name: 'A' })).not.toBeDisabled();
    expect(screen.getByRole('option', { name: 'B' })).toBeDisabled();
  });

  it('leaves options without the field enabled', () => {
    render(SettingSelect, {
      props: {
        value: 'a',
        name: 'test',
        label: 'Test',
        options: [
          { value: 'a', text: 'A' },
          { value: 'b', text: 'B' },
        ],
      },
    });

    expect(screen.getByRole('option', { name: 'B' })).not.toBeDisabled();
  });

  it('still disables the whole select via the component prop', () => {
    render(SettingSelect, {
      props: {
        value: 'a',
        name: 'test',
        label: 'Test',
        disabled: true,
        options: [{ value: 'a', text: 'A' }],
      },
    });

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test --run src/routes/admin/system-settings/SettingSelect.spec.ts`
Expected: FAIL — option B is not disabled.

- [ ] **Step 3: Implement**

In `SettingSelect.svelte`, widen the `options` type on line 12:

```ts
    options: { value: string | number; text: string; disabled?: boolean }[];
```

and forward it in the template (line 80):

```svelte
      {#each options as option (option.value)}
        <option value={option.value} disabled={option.disabled}>{option.text}</option>
      {/each}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && pnpm test --run src/routes/admin/system-settings/SettingSelect.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Gate and commit**

```bash
cd web && pnpm check:typescript && pnpm check:svelte
cd .. && npx prettier --check web/src/routes/admin/system-settings/SettingSelect.svelte web/src/routes/admin/system-settings/SettingSelect.spec.ts
git add web/src/routes/admin/system-settings/SettingSelect.svelte web/src/routes/admin/system-settings/SettingSelect.spec.ts
git commit -m "feat(web): allow individual SettingSelect options to be disabled"
```

The other panels rendering `SettingSelect` pass options without the field, so they are unaffected — test 2 is the regression guard for them.

---

### Task 8: Storage routing settings panel

**Files:**

- Create: `web/src/routes/admin/system-settings/StorageSettings.svelte`
- Create: `web/src/routes/admin/system-settings/StorageSettings.spec.ts`
- Modify: `web/src/routes/admin/system-settings/+page.svelte` (settings array at `:65`)
- Modify: `i18n/en.json` and the nine maintained locales

**Interfaces:**

- Consumes: `SettingSelect` per-option `disabled` (Task 7); `getStorageRoutingStatus` from `@immich/sdk` (Task 6); `featureFlagsManager.value.s3Storage` (Task 6)

**i18n keys** (exact English; add all of these to all ten files):

```json
"storage_routing_settings": "Storage routing",
"storage_routing_settings_description": "Choose where newly created files are stored",
"storage_routing_originals": "Original files",
"storage_routing_originals_description": "Uploaded photos and videos, and their sidecar files",
"storage_routing_thumbnails": "Thumbnails",
"storage_routing_thumbnails_description": "Thumbnails, previews, full-size images, person thumbnails and profile images",
"storage_routing_encoded_video": "Transcoded videos",
"storage_routing_encoded_video_description": "Videos re-encoded for playback",
"storage_routing_option_auto": "Follow IMMICH_STORAGE_BACKEND (currently: {backend})",
"storage_routing_option_disk": "Local disk",
"storage_routing_option_s3": "S3",
"storage_routing_s3_unavailable": "Set IMMICH_S3_BUCKET to enable S3 storage",
"storage_routing_misplaced": "{count, plural, one {# file is} other {# files are}} still stored on the other backend",
"storage_routing_migrate_link": "Migrate them",
"storage_routing_only_affects_new_files": "Changing this only affects newly created files. Existing files stay where they are and remain accessible.",
"storage_migration_blocked_by_routing": "This file type is routed to the other backend. Change storage routing first."
```

All keys live under the `admin` object in `i18n/en.json`, inserted alphabetically. German is worked below as the register example; the other eight follow the same rules (informal `tu`/`tú` for `it`/`es`, formal `vous`/`вы` for `fr`/`ru`):

```json
"storage_routing_settings": "Speicher-Routing",
"storage_routing_settings_description": "Lege fest, wo neu erstellte Dateien gespeichert werden",
"storage_routing_originals": "Originaldateien",
"storage_routing_originals_description": "Hochgeladene Fotos und Videos sowie deren Sidecar-Dateien",
"storage_routing_thumbnails": "Vorschaubilder",
"storage_routing_thumbnails_description": "Vorschaubilder, Vorschauen, Bilder in voller Größe, Personenbilder und Profilbilder",
"storage_routing_encoded_video": "Transkodierte Videos",
"storage_routing_encoded_video_description": "Für die Wiedergabe neu kodierte Videos",
"storage_routing_option_auto": "IMMICH_STORAGE_BACKEND folgen (aktuell: {backend})",
"storage_routing_option_disk": "Lokaler Speicher",
"storage_routing_option_s3": "S3",
"storage_routing_s3_unavailable": "Setze IMMICH_S3_BUCKET, um S3-Speicher zu aktivieren",
"storage_routing_misplaced": "{count, plural, one {# Datei liegt} other {# Dateien liegen}} noch im anderen Speicher",
"storage_routing_migrate_link": "Jetzt migrieren",
"storage_routing_only_affects_new_files": "Diese Änderung betrifft nur neu erstellte Dateien. Vorhandene Dateien bleiben, wo sie sind, und bleiben erreichbar.",
"storage_migration_blocked_by_routing": "Dieser Dateityp ist auf den anderen Speicher geroutet. Ändere zuerst das Speicher-Routing."
```

- [ ] **Step 1: Write the failing component test**

Create `web/src/routes/admin/system-settings/StorageSettings.spec.ts`, mirroring the mock setup in `MemoriesSettings.spec.ts` (read it first — it mocks `feature-flags-manager.svelte`, `system-config-manager.svelte` and `$lib/services/system-config.service`). Add a mock for the SDK call:

```ts
vi.mock(import('@immich/sdk'), async (importOriginal) => ({
  ...(await importOriginal()),
  getStorageRoutingStatus: vi.fn().mockResolvedValue({
    originals: { routedTo: 'disk', misplacedCount: 0 },
    thumbnails: { routedTo: 'disk', misplacedCount: 42 },
    encodedVideo: { routedTo: 'disk', misplacedCount: 0 },
  }),
}));
```

Tests:

1. `renders the S3 option disabled when s3Storage is false` — set `mocks.featureFlags.s3Storage = false`, assert the three S3 `<option>`s are disabled and the hint text is present.
2. `enables the S3 option when s3Storage is true`.
3. `disables every control when configFile is true`.
4. `interpolates the resolved env backend into the auto label` — assert the auto option text contains `S3` when the status reports `routedTo: 's3'` for an `auto` knob.
5. `renders the migrate link only when misplacedCount is greater than zero` — assert exactly one link, and that the originals and encodedVideo rows have none.
6. `points the migrate link at the migration page with direction and file types prefilled` — assert `href` contains `direction=toDisk` and the thumbnail-group file types.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test --run src/routes/admin/system-settings/StorageSettings.spec.ts`
Expected: FAIL — the component does not exist.

Note: pass the **explicit spec path**. A glob over a SvelteKit route directory containing `(...)` or `[...]` segments silently matches zero files and reports a clean pass.

- [ ] **Step 3: Implement the component**

Create `web/src/routes/admin/system-settings/StorageSettings.svelte`, modelled on `StorageUsageSettings.svelte`:

```svelte
<script lang="ts">
  import SettingButtonsRow from '$lib/components/shared-components/settings/SystemConfigButtonRow.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { systemConfigManager } from '$lib/managers/system-config-manager.svelte';
  import { getStorageRoutingStatus, StorageRouting, type StorageRoutingStatusDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiHelpCircleOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fade } from 'svelte/transition';
  import SettingSelect from './SettingSelect.svelte';

  const disabled = $derived(featureFlagsManager.value.configFile);
  const s3Available = $derived(featureFlagsManager.value.s3Storage);
  let configToEdit = $state(systemConfigManager.cloneValue());
  let status = $state<StorageRoutingStatusDto | undefined>();

  onMount(async () => {
    status = await getStorageRoutingStatus();
  });

  const kinds = [
    { key: 'originals', label: 'storage_routing_originals', desc: 'storage_routing_originals_description' },
    { key: 'thumbnails', label: 'storage_routing_thumbnails', desc: 'storage_routing_thumbnails_description' },
    { key: 'encodedVideo', label: 'storage_routing_encoded_video', desc: 'storage_routing_encoded_video_description' },
  ] as const;

  const optionsFor = (resolved: string | undefined) => [
    {
      value: StorageRouting.Auto,
      text: $t('admin.storage_routing_option_auto', { values: { backend: resolved === 's3' ? 'S3' : $t('admin.storage_routing_option_disk') } }),
    },
    { value: StorageRouting.Disk, text: $t('admin.storage_routing_option_disk') },
    { value: StorageRouting.S3, text: $t('admin.storage_routing_option_s3'), disabled: !s3Available },
  ];

  // The backlog moves in the opposite direction to where the kind is routed now.
  const migrateHref = (key: string, routedTo: string) => {
    const fileTypes =
      key === 'originals'
        ? 'originals,sidecars'
        : key === 'thumbnails'
          ? 'thumbnails,previews,fullsize,personThumbnails,profileImages'
          : 'encodedVideos';
    return `/admin/storage-migration?direction=${routedTo === 's3' ? 'toS3' : 'toDisk'}&fileTypes=${fileTypes}`;
  };
</script>

<div class="mt-2">
  <div in:fade={{ duration: 500 }}>
    <form autocomplete="off" class="mx-4 mt-4" onsubmit={(event) => event.preventDefault()}>
      <div class="ms-4 mt-4 flex flex-col gap-4">
        {#each kinds as kind (kind.key)}
          <div>
            <SettingSelect
              label={$t(`admin.${kind.label}`)}
              desc={$t(`admin.${kind.desc}`)}
              name={kind.key}
              bind:value={configToEdit.storage.routing[kind.key]}
              options={optionsFor(status?.[kind.key]?.routedTo)}
              {disabled}
            />
            {#if status && status[kind.key].misplacedCount > 0}
              <p class="text-sm dark:text-immich-dark-fg">
                {$t('admin.storage_routing_misplaced', { values: { count: status[kind.key].misplacedCount } })}
                <a class="underline" href={migrateHref(kind.key, status[kind.key].routedTo)}>
                  {$t('admin.storage_routing_migrate_link')}
                </a>
              </p>
            {/if}
          </div>
        {/each}

        {#if !s3Available}
          <p class="text-sm dark:text-immich-dark-fg">
            <Icon icon={mdiHelpCircleOutline} class="inline" size="15" />
            {$t('admin.storage_routing_s3_unavailable')}
          </p>
        {/if}

        <p class="text-sm dark:text-immich-dark-fg">
          <Icon icon={mdiHelpCircleOutline} class="inline" size="15" />
          {$t('admin.storage_routing_only_affects_new_files')}
        </p>
      </div>

      <SettingButtonsRow bind:configToEdit keys={['storage']} {disabled} />
    </form>
  </div>
</div>
```

Confirm the generated SDK's export names before writing the import — if `make open-api` produced `getRoutingStatus` rather than `getStorageRoutingStatus`, use the generated name.

- [ ] **Step 4: Register the section**

In `web/src/routes/admin/system-settings/+page.svelte`, import the component and insert an entry into the `settings` array immediately before the `StorageTemplateSettings` entry:

```ts
    // Gallery-fork: per-file-type storage routing.
    {
      component: StorageSettings,
      title: $t('admin.storage_routing_settings'),
      subtitle: $t('admin.storage_routing_settings_description'),
      key: 'storage-routing',
      icon: mdiDatabaseOutline,
    },
```

Import `mdiDatabaseOutline` from `@mdi/js` alongside the existing icon imports.

- [ ] **Step 5: Add the i18n keys**

Add all seventeen keys to `i18n/en.json` and the nine maintained locales, alphabetically placed inside the `admin` object. Then:

```bash
npx prettier --write i18n/*.json
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd web && pnpm test --run src/routes/admin/system-settings/StorageSettings.spec.ts src/routes/admin/system-settings/SettingSelect.spec.ts
cd web && pnpm check:typescript && pnpm check:svelte
```

`check:svelte` can silently scan zero files locally — check the reported file count in its output before trusting a pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/routes/admin/system-settings/StorageSettings.svelte \
  web/src/routes/admin/system-settings/StorageSettings.spec.ts \
  web/src/routes/admin/system-settings/+page.svelte i18n
git commit -m "feat(web): add a storage routing section to system settings"
```

---

### Task 9: Migration page — routing-aware checkboxes and prefill

**Files:**

- Modify: `web/src/routes/admin/storage-migration/+page.svelte`
- Create: `web/src/routes/admin/storage-migration/page.spec.ts`

**Interfaces:**

- Consumes: `getStorageRoutingStatus` (Task 6), `MIGRATION_FILE_TYPE_TO_KIND` semantics (Task 1, mirrored in the web layer as a local constant)

- [ ] **Step 1: Write the failing test**

Create `web/src/routes/admin/storage-migration/page.spec.ts` with two tests:

1. `disables file types whose routing contradicts the selected direction` — mock `getStorageRoutingStatus` to report `thumbnails: { routedTo: 's3' }`, select direction `toDisk`, and assert the thumbnails/previews/fullsize/personThumbnails/profileImages checkboxes are disabled and carry the `storage_migration_blocked_by_routing` reason, while `originals` is enabled.
2. `prefills direction and file types from query params` — render with `?direction=toS3&fileTypes=thumbnails,previews` and assert the direction radio and exactly those two checkboxes are selected.

Read the existing page to find the real element roles and labels before writing the queries. Avoid `queryBy...` assertions that pass whether or not the element exists — assert on a positive `getBy` for the enabled case and `toBeDisabled()` for the disabled case.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm test --run src/routes/admin/storage-migration/page.spec.ts`
Expected: FAIL — checkboxes are never disabled and query params are ignored.

- [ ] **Step 3: Implement**

In `web/src/routes/admin/storage-migration/+page.svelte`:

```ts
import { page } from '$app/state';
import { getStorageRoutingStatus, type StorageRoutingStatusDto } from '@immich/sdk';

const FILE_TYPE_TO_KIND: Record<string, 'originals' | 'thumbnails' | 'encodedVideo'> = {
  originals: 'originals',
  sidecars: 'originals',
  thumbnails: 'thumbnails',
  previews: 'thumbnails',
  fullsize: 'thumbnails',
  personThumbnails: 'thumbnails',
  profileImages: 'thumbnails',
  encodedVideos: 'encodedVideo',
};

let routingStatus = $state<StorageRoutingStatusDto | undefined>();

onMount(async () => {
  routingStatus = await getStorageRoutingStatus();

  const params = page.url.searchParams;
  const requestedDirection = params.get('direction');
  if (requestedDirection === 'toS3' || requestedDirection === 'toDisk') {
    direction = requestedDirection as StorageMigrationDirection;
  }
  const requested = params.get('fileTypes');
  if (requested) {
    const wanted = new Set(requested.split(','));
    for (const key of Object.keys(FILE_TYPE_TO_KIND)) {
      selectedFileTypes[key] = wanted.has(key);
    }
  }
});

// A file type whose new writes go the other way can never converge, and the server rejects
// it anyway — disable it here so the invalid combination is unreachable.
const isBlocked = (fileType: string) => {
  if (!routingStatus) {
    return false;
  }
  const target = direction === StorageMigrationDirection.ToS3 ? 's3' : 'disk';
  return routingStatus[FILE_TYPE_TO_KIND[fileType]].routedTo !== target;
};
```

Apply `disabled={isBlocked(<fileType>)}` and a `title={isBlocked(<fileType>) ? $t('admin.storage_migration_blocked_by_routing') : undefined}` to each checkbox, matching however the existing markup binds them. Read lines 190-300 of the page first — the file types are currently bound as individual `bind:checked` expressions and may need converting to a keyed record for `selectedFileTypes` to work as written above.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && pnpm test --run src/routes/admin/storage-migration/page.spec.ts
cd web && pnpm check:typescript && pnpm check:svelte
```

- [ ] **Step 5: Commit**

```bash
npx prettier --check web/src/routes/admin/storage-migration/+page.svelte web/src/routes/admin/storage-migration/page.spec.ts
git add web/src/routes/admin/storage-migration/+page.svelte web/src/routes/admin/storage-migration/page.spec.ts
git commit -m "feat(web): make the storage migration page routing-aware"
```

---

### Task 10: Documentation

**Files:**

- Modify: `docs/docs/features/s3-storage.md`
- Modify: `docs/docs/features/storage-migration.md`
- Modify: `docs/docs/install/environment-variables.md`

- [ ] **Step 1: Document routing in the S3 feature page**

Add a "Choosing where each file kind is stored" section to `docs/docs/features/s3-storage.md` covering:

- the three knobs and exactly which physical file types each covers
- that `auto` follows `IMMICH_STORAGE_BACKEND` and is the default, so upgrading changes nothing
- that changing a knob affects **only newly created files**, and existing files stay readable because the stored path itself identifies the backend
- **the integrity-check limitation**: configuring S3 at all disables all integrity check jobs today, linking `https://github.com/open-noodle/gallery/issues/685`
- a warning not to remove S3 credentials until the routing page reports zero files on S3, or those files become unreadable

- [ ] **Step 2: Document the per-kind validation rule**

In `docs/docs/features/storage-migration.md`, document that a file type can only be migrated in the direction its routing points, with the error text an admin will see, and that external-library originals and sidecars are deliberately never migrated. Add a note that running with **Delete source files** unchecked leaves the file on both backends, so storage usage counts it twice until the source is removed.

- [ ] **Step 3: Clarify the env var**

In `docs/docs/install/environment-variables.md`, update the `IMMICH_STORAGE_BACKEND` row to say it is the fallback used by any file kind whose routing is set to `auto`, rather than an absolute switch, and link the routing section.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --check docs/docs/features/s3-storage.md docs/docs/features/storage-migration.md docs/docs/install/environment-variables.md
```

CI Docs Build is strict about prettier — run `--write` if the check fails, then re-check.

```bash
git add docs/docs
git commit -m "docs: document per-file-type storage routing"
```

---

### Task 11: e2e coverage

Covers spec test items 49-57, which no earlier task touches.

**Files:**

- Modify: `e2e/src/specs/server/api/system-config.e2e-spec.ts`
- Create or modify: an e2e API spec for the routing endpoint, alongside the existing storage-migration API specs (locate them first with `grep -rl "storage-migration" e2e/src/specs/`)
- Modify: `e2e/src/storage-migration.ts` (the standalone MinIO harness driven by `e2e/storage-migration.sh`)

- [ ] **Step 1: Extend the system-config e2e default shape**

`e2e/src/specs/server/api/system-config.e2e-spec.ts` asserts the full default config object. Add the `storage.routing` block with all three knobs set to `auto`. Run it and confirm it fails first if you skip this — a stale expected object is exactly the kind of break that lands in CI rather than locally.

- [ ] **Step 2: Add API specs for the routing endpoint**

```ts
describe('GET /storage-migration/routing', () => {
  it('should require authentication', async () => {
    const { status, body } = await request(app).get('/storage-migration/routing');
    expect(status).toBe(401);
    expect(body).toEqual(errorDto.unauthorized);
  });

  it('should require admin', async () => {
    const { status } = await request(app)
      .get('/storage-migration/routing')
      .set('Authorization', `Bearer ${nonAdmin.accessToken}`);
    expect(status).toBe(403);
  });

  it('should report a resolved backend and a count for every kind', async () => {
    const { status, body } = await request(app)
      .get('/storage-migration/routing')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(status).toBe(200);
    for (const kind of ['originals', 'thumbnails', 'encodedVideo']) {
      expect(['disk', 's3']).toContain(body[kind].routedTo);
      expect(body[kind].misplacedCount).toBeGreaterThanOrEqual(0);
    }
  });
});
```

Match the surrounding file's harness — read a neighbouring spec for how it obtains `admin` / `nonAdmin` and whether it uses `request(app)` or a generated SDK client.

- [ ] **Step 3: Add mixed-routing phases to the MinIO harness**

`e2e/src/storage-migration.ts` is a phase-based script driven by `e2e/storage-migration.sh` and run with `make storage-migration-tests`. It already brings up MinIO via `docker-compose.storage-migration.yml`, uploads assets, and inspects both the DB and the bucket. Add a phase covering, in order:

1. Set `originals: s3`, `thumbnails: disk`, `encodedVideo: disk` via the system-config API. Upload an image and a video. Assert `asset.originalPath` is a relative key present in MinIO; assert the thumbnail and preview paths are absolute, present on disk, and absent from MinIO; assert both serve over HTTP with 200 and correct bytes.
2. Flip `thumbnails` to `s3`; upload a second asset. Assert the new thumbnail is in MinIO **and** the first asset's thumbnail still serves from disk. This is the "flipping is safe" guarantee and the single most valuable assertion in the file.
3. Run the migrator for thumbnails `toS3`. Assert `GET /storage-migration/routing` reports `thumbnails.misplacedCount === 0` and the old thumbnails now serve from MinIO.
4. Roll that batch back. Assert paths revert and every file still serves.
5. Delete an asset whose files span both backends. Assert the S3 object and the disk file are both gone.
6. Pin a knob to `s3` with the bucket unset. Assert the server starts, logs the routing error, and writes that kind to disk.
7. With the mixed routing from phase 1 in place, restart the server with a changed `IMMICH_MEDIA_LOCATION` and assert it boots. This is the end-to-end form of the `getFileSamples` fix and the only test that exercises real Postgres row ordering rather than a fixture.

- [ ] **Step 4: Run what the environment allows**

```bash
cd e2e && pnpm test --run src/specs/server/api/system-config.e2e-spec.ts
make storage-migration-tests
```

`make storage-migration-tests` needs Docker. If Docker is unavailable in this environment, **say so explicitly** in the task report and in the PR description — do not describe unrun tests as passing.

- [ ] **Step 5: Commit**

```bash
git add e2e/src
git commit -m "test(storage): cover per-file-type routing end to end"
```

---

## Final verification

Run before opening the PR:

```bash
cd server && pnpm check && pnpm lint && pnpm test --run
cd ../web && pnpm check:typescript && pnpm check:svelte && pnpm test --run
cd .. && npx prettier --check "server/src/**/*.ts" "web/src/**/*.svelte" "i18n/*.json" "docs/**/*.md"
```

Confirm the reported test-file counts are non-zero and match expectations. A green run of zero files is the failure mode to watch for in this repo.

The e2e harness phases from the spec (`make storage-migration-tests`, items 51-57) require Docker and MinIO. Run them if the environment allows; if not, say so explicitly in the PR description rather than implying they passed.
