# Map Provider Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Maps and Apple Maps links to the web image info panel's existing map popup while preserving the OpenStreetMap link.

**Architecture:** Put provider URL construction in small tested helpers in `web/src/lib/utils/exif-utils.ts`. Use those helpers from `web/src/lib/components/asset-viewer/detail-panel.svelte` so the Svelte component only renders links and does not own provider URL syntax. Extend the existing web map test stub to render popup snippets, then test the detail panel renders all provider links when GPS coordinates are present.

**Tech Stack:** Svelte 5, TypeScript, Vitest, Testing Library Svelte, svelte-i18n, `URL`/`URLSearchParams`.

---

## File Structure

- Modify `web/src/lib/utils/exif-utils.ts`
  - Add pure helper functions for Google Maps, Apple Maps, OpenStreetMap, and a combined provider-link list.
- Modify `web/src/lib/utils/exif-utils.spec.ts`
  - Add red-first unit tests for helper URLs, including positive and negative coordinates.
- Modify `web/src/test-data/mocks/map-component.stub.svelte`
  - Render a supplied `popup` snippet for the first marker so component tests can assert popup contents without loading MapLibre.
- Create `web/src/lib/components/asset-viewer/detail-panel.spec.ts`
  - Add a component test that mocks the dynamic map import and verifies the image info panel popup contains Google, Apple, and OpenStreetMap links.
- Modify `web/src/lib/components/asset-viewer/detail-panel.svelte`
  - Replace hardcoded OpenStreetMap URL markup with provider links from the helper.
- Modify `i18n/en.json`
  - Add English strings for `open_in_google_maps` and `open_in_apple_maps`.

---

### Task 1: Add Map Provider URL Helpers With Unit Tests

**Files:**
- Modify: `web/src/lib/utils/exif-utils.spec.ts`
- Modify: `web/src/lib/utils/exif-utils.ts`

- [ ] **Step 1: Write failing helper tests**

Append these tests to `web/src/lib/utils/exif-utils.spec.ts`:

```ts
describe('map provider urls', () => {
  it('builds Google Maps coordinate search urls', () => {
    expect(getGoogleMapsUrl(48.85341, 2.3488)).toBe(
      'https://www.google.com/maps/search/?api=1&query=48.85341%2C2.3488',
    );
  });

  it('builds Apple Maps coordinate urls', () => {
    expect(getAppleMapsUrl(48.85341, 2.3488)).toBe(
      'https://maps.apple.com/?ll=48.85341%2C2.3488&q=48.85341%2C2.3488',
    );
  });

  it('builds OpenStreetMap urls that preserve the existing marker and map zoom behavior', () => {
    expect(getOpenStreetMapUrl(48.85341, 2.3488)).toBe(
      'https://www.openstreetmap.org/?mlat=48.85341&mlon=2.3488&zoom=13#map=15/48.85341/2.3488',
    );
  });

  it('builds provider links for negative coordinates', () => {
    expect(getMapProviderLinks(-33.8568, 151.2153)).toEqual([
      {
        key: 'google',
        label: 'open_in_google_maps',
        url: 'https://www.google.com/maps/search/?api=1&query=-33.8568%2C151.2153',
      },
      {
        key: 'apple',
        label: 'open_in_apple_maps',
        url: 'https://maps.apple.com/?ll=-33.8568%2C151.2153&q=-33.8568%2C151.2153',
      },
      {
        key: 'openStreetMap',
        label: 'open_in_openstreetmap',
        url: 'https://www.openstreetmap.org/?mlat=-33.8568&mlon=151.2153&zoom=13#map=15/-33.8568/151.2153',
      },
    ]);
  });
});
```

Also update the import at the top of `web/src/lib/utils/exif-utils.spec.ts`:

```ts
import {
  getAppleMapsUrl,
  getExifCount,
  getGoogleMapsUrl,
  getMapProviderLinks,
  getOpenStreetMapUrl,
} from '$lib/utils/exif-utils';
```

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```bash
pnpm --dir web test -- --run src/lib/utils/exif-utils.spec.ts
```

Expected: FAIL because `getGoogleMapsUrl`, `getAppleMapsUrl`, `getOpenStreetMapUrl`, and `getMapProviderLinks` are not exported yet.

- [ ] **Step 3: Add minimal helper implementation**

Update `web/src/lib/utils/exif-utils.ts` to:

```ts
import type { AssetResponseDto } from '@immich/sdk';

export const getExifCount = (asset: AssetResponseDto) => {
  return Object.values(asset.exifInfo ?? {}).filter(Boolean).length;
};

const coordinates = (lat: number, lon: number) => `${lat},${lon}`;

export const getGoogleMapsUrl = (lat: number, lon: number) => {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', coordinates(lat, lon));
  return url.toString();
};

export const getAppleMapsUrl = (lat: number, lon: number) => {
  const url = new URL('https://maps.apple.com/');
  url.searchParams.set('ll', coordinates(lat, lon));
  url.searchParams.set('q', coordinates(lat, lon));
  return url.toString();
};

export const getOpenStreetMapUrl = (lat: number, lon: number) => {
  const url = new URL('https://www.openstreetmap.org/');
  url.searchParams.set('mlat', String(lat));
  url.searchParams.set('mlon', String(lon));
  url.searchParams.set('zoom', '13');
  url.hash = `map=15/${lat}/${lon}`;
  return url.toString();
};

export const getMapProviderLinks = (lat: number, lon: number) => [
  {
    key: 'google',
    label: 'open_in_google_maps',
    url: getGoogleMapsUrl(lat, lon),
  },
  {
    key: 'apple',
    label: 'open_in_apple_maps',
    url: getAppleMapsUrl(lat, lon),
  },
  {
    key: 'openStreetMap',
    label: 'open_in_openstreetmap',
    url: getOpenStreetMapUrl(lat, lon),
  },
];
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run:

```bash
pnpm --dir web test -- --run src/lib/utils/exif-utils.spec.ts
```

Expected: PASS for existing EXIF count tests and the new map provider URL tests.

- [ ] **Step 5: Commit helper work**

Run:

```bash
git add web/src/lib/utils/exif-utils.ts web/src/lib/utils/exif-utils.spec.ts
git commit -m "test: cover map provider urls"
```

---

### Task 2: Add Image Info Panel Rendering Coverage

**Files:**
- Modify: `web/src/test-data/mocks/map-component.stub.svelte`
- Create: `web/src/lib/components/asset-viewer/detail-panel.spec.ts`

- [ ] **Step 1: Extend the map test stub**

Replace `web/src/test-data/mocks/map-component.stub.svelte` with:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  type Marker = {
    id: string;
    lat?: number;
    lon?: number;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };

  interface Props {
    mapMarkers?: Marker[];
    popup?: Snippet<[{ marker: Marker }]>;
    [key: string]: unknown;
  }

  let { mapMarkers = [], popup, ...rest }: Props = $props();
</script>

<div
  {...rest}
  data-testid="map-stub"
  data-marker-count={String(mapMarkers.length)}
  data-marker-ids={mapMarkers.map((marker) => marker.id).join(',')}
>
  {#if popup && mapMarkers[0]}
    <div data-testid="map-popup">
      {@render popup({ marker: mapMarkers[0] })}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Add failing detail panel test**

Create `web/src/lib/components/asset-viewer/detail-panel.spec.ts`:

```ts
import { getAppleMapsUrl, getGoogleMapsUrl, getOpenStreetMapUrl } from '$lib/utils/exif-utils';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import { screen, waitFor } from '@testing-library/svelte';
import DetailPanel from './detail-panel.svelte';

const { mockAuthManager } = vi.hoisted(() => ({
  mockAuthManager: {
    authenticated: true,
    isSharedLink: true,
    user: { id: 'owner-id' },
  },
}));

vi.mock('$lib/components/shared-components/map/map.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/map-component.stub.svelte');
  return { default: MockComponent };
});

vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mockAuthManager }));

vi.mock('$lib/managers/feature-flags-manager.svelte', () => ({
  featureFlagsManager: { value: { map: true } },
}));

describe('DetailPanel map provider links', () => {
  it('renders Google, Apple, and OpenStreetMap links in the image info panel map popup', async () => {
    const lat = 48.85341;
    const lon = 2.3488;
    const asset = assetFactory.build({
      id: 'asset-with-location',
      ownerId: 'owner-id',
      exifInfo: {
        latitude: lat,
        longitude: lon,
        city: 'Paris',
        country: 'France',
      },
    });

    renderWithTooltips(DetailPanel, { asset });

    await waitFor(() => expect(screen.getByTestId('map-popup')).toBeInTheDocument());

    const googleLink = screen.getByRole('link', { name: 'open_in_google_maps' });
    const appleLink = screen.getByRole('link', { name: 'open_in_apple_maps' });
    const openStreetMapLink = screen.getByRole('link', { name: 'open_in_openstreetmap' });

    expect(googleLink).toHaveAttribute('href', getGoogleMapsUrl(lat, lon));
    expect(appleLink).toHaveAttribute('href', getAppleMapsUrl(lat, lon));
    expect(openStreetMapLink).toHaveAttribute('href', getOpenStreetMapUrl(lat, lon));

    for (const link of [googleLink, appleLink, openStreetMapLink]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
```

- [ ] **Step 3: Run detail panel test and verify RED**

Run:

```bash
pnpm --dir web test -- --run src/lib/components/asset-viewer/detail-panel.spec.ts
```

Expected: FAIL because only `open_in_openstreetmap` is rendered in `detail-panel.svelte`; `open_in_google_maps` and `open_in_apple_maps` are missing.

- [ ] **Step 4: Keep the red test uncommitted**

Do not commit while this test is red. Leave `web/src/test-data/mocks/map-component.stub.svelte` and
`web/src/lib/components/asset-viewer/detail-panel.spec.ts` in the working tree for Task 3.

Expected: `git status --short` shows those two files as modified/untracked, and the failing test output from Step 3 confirms the UI behavior is not implemented yet.

---

### Task 3: Render Provider Links In The Detail Panel

**Files:**
- Modify: `web/src/lib/components/asset-viewer/detail-panel.svelte`
- Modify: `i18n/en.json`

- [ ] **Step 1: Add English labels**

Update the `open_*` section of `i18n/en.json` so it includes:

```json
  "open_in_apple_maps": "Open in Apple Maps",
  "open_in_app_banner_aria_label": "Mobile app suggestion",
  "open_in_app_banner_dismiss": "Dismiss banner",
  "open_in_app_banner_get_app": "Don't have the app?",
  "open_in_app_banner_open": "Open",
  "open_in_app_banner_subtitle": "Better in the app",
  "open_in_app_banner_title": "Open in Immich",
  "open_in_browser": "Open in browser",
  "open_in_google_maps": "Open in Google Maps",
  "open_in_map_view": "Open in map view",
  "open_in_openstreetmap": "Open in OpenStreetMap",
```

- [ ] **Step 2: Import provider link helper**

In `web/src/lib/components/asset-viewer/detail-panel.svelte`, add:

```ts
import { getMapProviderLinks } from '$lib/utils/exif-utils';
```

near the other `$lib/utils/*` imports.

- [ ] **Step 3: Replace hardcoded OpenStreetMap popup link**

Replace the popup body inside `web/src/lib/components/asset-viewer/detail-panel.svelte` with:

```svelte
{#snippet popup({ marker })}
  {@const { lat, lon } = marker}
  {@const mapProviderLinks = getMapProviderLinks(lat, lon)}
  <div class="flex flex-col items-center gap-1">
    <p class="font-bold">{lat.toPrecision(6)}, {lon.toPrecision(6)}</p>
    <div class="flex flex-col items-center gap-1">
      {#each mapProviderLinks as link}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium text-primary underline focus:outline-none"
        >
          {$t(link.label)}
        </a>
      {/each}
    </div>
  </div>
{/snippet}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm --dir web test -- --run src/lib/utils/exif-utils.spec.ts src/lib/components/asset-viewer/detail-panel.spec.ts
```

Expected: PASS for helper tests and detail panel rendering coverage.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add web/src/test-data/mocks/map-component.stub.svelte web/src/lib/components/asset-viewer/detail-panel.spec.ts web/src/lib/components/asset-viewer/detail-panel.svelte i18n/en.json
git commit -m "feat: add map provider links to asset info panel"
```

---

### Task 4: Final Verification

**Files:**
- Verify all changed files from Tasks 1-3.

- [ ] **Step 1: Run formatting checks**

Run:

```bash
pnpm --dir web run format
pnpm --dir i18n run format
```

Expected: both commands exit 0. If either fails because files need formatting, run:

```bash
pnpm --dir web run format:fix
pnpm --dir i18n run format:fix
```

Then rerun the two format checks.

- [ ] **Step 2: Run focused unit tests**

Run:

```bash
pnpm --dir web test -- --run src/lib/utils/exif-utils.spec.ts src/lib/components/asset-viewer/detail-panel.spec.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run web compile checks**

Run:

```bash
pnpm --dir open-api/typescript-sdk run build
pnpm --dir web run check:svelte
pnpm --dir web run check:typescript
```

Expected: all commands exit 0 with no errors or warnings. The SDK build is required before `check:typescript` because `web` imports `@immich/sdk` from the workspace package's built declarations.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
base_commit=$(git log --format=%H --grep='docs: plan map provider links' -1)
git diff --stat "$base_commit"..HEAD -- web/src/lib/utils/exif-utils.ts web/src/lib/utils/exif-utils.spec.ts web/src/test-data/mocks/map-component.stub.svelte web/src/lib/components/asset-viewer/detail-panel.spec.ts web/src/lib/components/asset-viewer/detail-panel.svelte i18n/en.json
git diff "$base_commit"..HEAD -- web/src/lib/utils/exif-utils.ts web/src/lib/utils/exif-utils.spec.ts web/src/test-data/mocks/map-component.stub.svelte web/src/lib/components/asset-viewer/detail-panel.spec.ts web/src/lib/components/asset-viewer/detail-panel.svelte i18n/en.json
```

Expected: only the planned helper tests, helper implementation, map stub extension, detail panel test, detail panel rendering change, and English labels are present.

- [ ] **Step 5: Commit any formatting-only changes**

If formatting commands changed files after Task 3, run:

```bash
git add web/src/lib/utils/exif-utils.ts web/src/lib/utils/exif-utils.spec.ts web/src/test-data/mocks/map-component.stub.svelte web/src/lib/components/asset-viewer/detail-panel.spec.ts web/src/lib/components/asset-viewer/detail-panel.svelte i18n/en.json
git commit -m "chore: format map provider links"
```

If `git status --short` is clean, skip this step.

---

## Self-Review

- Spec coverage: The plan adds Google Maps and Apple Maps links to the web image info panel popup, preserves OpenStreetMap, verifies links open in new tabs, avoids mobile/global map/API changes, and includes helper plus UI coverage.
- TDD coverage: Task 1 requires helper tests to fail before helper implementation. Task 2 requires the detail panel rendering test to fail before component implementation.
- Commit hygiene: The plan does not commit deliberately failing tests; red tests remain local until the green implementation commit.
- Placeholder scan: No TBD/TODO/fill-in steps remain. Every code-changing step includes concrete code and commands.
- Type consistency: Helper names used in tests, component, and plan are consistent: `getGoogleMapsUrl`, `getAppleMapsUrl`, `getOpenStreetMapUrl`, and `getMapProviderLinks`.
