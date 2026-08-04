# Slice 6 — e2e seed data and coverage (#910)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** The Playwright suites stop assuming every filter section is always rendered, and gain direct
coverage for the new hide behaviour.

**Architecture:** Seed data changes, not test-logic changes. Suites that click a control inside a section
must seed enough variety for that section to be available; the feature itself is not weakened to suit them.

**Tech Stack:** Playwright, Vitest (e2e runner), the fork's `utils` seeding helpers.

- **Spec:** `docs/superpowers/specs/2026-08-04-interdependent-filter-sections-910-design.md` §8.4
- **Branch:** `fix/910-interdependent-filter-sections`
- **Depends on:** Slice 5. Nothing is gated before it, so these tests cannot fail first without it.
- **Scope:** `e2e/src/specs/web/`. No app source.

## Global Constraints

- Per `feedback_e2e_stack_port_2285_vs_dev_2283`, `make e2e` serves on **2285**; a `make dev` stack is 2283.
  Run the web suites with `make e2e-web-dev` against a running dev stack, or the full `make e2e` stack.
- Per `reference_e2e_web_playwright_2283_empty_body`, `make e2e-web-dev` on port 2283 can serve zero-byte
  bodies. If every test fails on an empty page, that is the environment, not the change.
- Per `feedback_no_flake_allowance`, never mark a failure as flaky and retry. Diagnose it.
- Per `feedback_e2e_waitforqueuefinish_false_done`, `waitForQueueFinish` returns "done" while the queue is
  merely momentarily empty. Rating and EXIF assertions must poll rather than trust it.

## File Structure

| File                                                | Responsibility                         |
| --------------------------------------------------- | -------------------------------------- |
| `e2e/src/specs/web/photos-filter-panel.e2e-spec.ts` | seed a video; new hide coverage        |
| `e2e/src/specs/web/spaces-filter-panel.e2e-spec.ts` | seed a video, a favourite and an album |

---

## Task 1: Seed the photos suite so its sections stay available

**Files:**

- Modify: `e2e/src/specs/web/photos-filter-panel.e2e-spec.ts:14-29` (`beforeAll`)

The suite creates three assets, all images (`utils.createAsset` defaults to `makeRandomImage()` named
`example.png`), and rates one. Rating therefore stays available; **Media does not** — `mediaTypes` is
`['IMAGE']`, which is `< 2`. The `media-type-image` click at `:78` will fail.

- [ ] **Step 1: Run the suite to see the failure**

```bash
make e2e-web-dev
```

Expected: FAIL in "should filter by media type" at `:78` — `media-type-image` never becomes visible,
because the section is not rendered.

This is the RED step. Do not skip it: seeing the exact failure confirms slice 5 gates what it should,
and confirms the seed is the cause rather than something else.

- [ ] **Step 2: Seed a video**

The fork's pattern is a random-image body with a video extension — the server types the asset from the
filename. Copy it from `recently-added-filters.e2e-spec.ts:102-110`:

```ts
// #910: the Media section only renders when both types are present. Without a video the section
// is (correctly) hidden and every media-type assertion below has nothing to click.
await utils.createAsset(admin.accessToken, {
  fileCreatedAt: '2023-06-01T10:00:00.000Z',
  fileModifiedAt: '2023-06-01T10:00:00.000Z',
  assetData: { filename: 'example-video.mp4' },
});
```

- [ ] **Step 3: Run the suite to verify it passes**

```bash
make e2e-web-dev
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/src/specs/web/photos-filter-panel.e2e-spec.ts
git commit -m "test(e2e): seed a video so the media filter section renders (#910)"
```

---

## Task 2: Seed the spaces suite

**Files:**

- Modify: `e2e/src/specs/web/spaces-filter-panel.e2e-spec.ts` — `createPopulatedSpace`

This suite asserts `filter-section-rating` and `filter-section-media` are visible (`:95-96`) and clicks
`rating-star-N` / `media-type-*` around 25 times. `createPopulatedSpace` builds the fixture.

- [ ] **Step 1: Run the suite to see the failures**

```bash
make e2e-web-dev
```

Expected: FAIL at `:95-96` and at every media-type and rating click, depending on what
`createPopulatedSpace` currently seeds. Note the full list before changing anything.

- [ ] **Step 2: Extend `createPopulatedSpace`**

Read the whole helper first. Add whatever the Step 1 failures show is missing, from this set:

```ts
// #910: each of these keeps one filter section available. Without them the section is correctly
// hidden and the assertions below have nothing to act on.
// — a video, so Media has two types
await utils.createAsset(admin.accessToken, {
  fileCreatedAt: '2023-06-01T10:00:00.000Z',
  fileModifiedAt: '2023-06-01T10:00:00.000Z',
  assetData: { filename: 'space-video.mp4' },
});
// — a rating, so Rating is available
await updateAsset({ id: asset1.id, updateAssetDto: { rating: 5 } }, { headers: asBearerAuth(admin.accessToken) });
// — a favourite, so Favorites is available
await updateAsset(
  { id: asset2.id, updateAssetDto: { isFavorite: true } },
  { headers: asBearerAuth(admin.accessToken) },
);
```

`updateAsset` and `asBearerAuth` are already imported in `photos-filter-panel.e2e-spec.ts`; add the same
imports here if absent.

For the Albums section, the space needs both a filed and an un-filed asset. If the suite has an
albums-section assertion, add an album containing exactly one of the seeded assets; if it does not, leave
the section to be hidden and do not add an assertion for it.

- [ ] **Step 3: Run the suite to verify it passes**

```bash
make e2e-web-dev
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/src/specs/web/spaces-filter-panel.e2e-spec.ts
git commit -m "test(e2e): seed varied space assets so every filter section renders (#910)"
```

---

## Task 3: Direct coverage for the hide behaviour

**Files:**

- Modify: `e2e/src/specs/web/photos-filter-panel.e2e-spec.ts`

Tasks 1 and 2 prove the feature does not break existing flows. This proves it works.

- [ ] **Step 1: Write the tests**

These need a library **without** the seeded variety, so they get their own `test.describe` with its own
`beforeAll` and a `utils.resetDatabase()`. Placing them in the existing describe would fight its fixture.

```ts
test.describe('Photos FilterPanel — unavailable sections (#910)', () => {
  let admin: LoginResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    // Images only, nothing rated, nothing favourited, no albums.
    await utils.createAsset(admin.accessToken, {
      fileCreatedAt: '2023-08-15T10:00:00.000Z',
      fileModifiedAt: '2023-08-15T10:00:00.000Z',
    });
  });

  test('hides the sections that cannot filter anything', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto('/photos');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('[data-testid="discovery-panel"]');

    // The positive assertion first: the panel rendered, so the negatives below mean something.
    await expect(page.locator('[data-testid="filter-section-timeline"]')).toBeVisible();

    await expect(page.locator('[data-testid="filter-section-media"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="filter-section-rating"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="filter-section-favorites"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="section-toggle-rating"]')).toHaveCount(0);
  });

  test('shows the favorites section once something is favourited', async ({ context, page }) => {
    const [asset] = await utils.getAssets(admin.accessToken);
    await updateAsset(
      { id: asset.id, updateAssetDto: { isFavorite: true } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto('/photos');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('[data-testid="filter-section-favorites"]')).toBeVisible();
  });
});
```

`utils.getAssets` may not exist under that name — check `e2e/src/utils.ts` and either use the real helper
or capture the asset id from `createAsset` in `beforeAll` into a suite-level variable.

- [ ] **Step 2: Run them**

```bash
make e2e-web-dev
```

Expected: PASS. If "hides the sections" fails, slice 5's gating is not reaching the browser — check that
the page provider forwards the new facets (slice 4) before touching this test.

- [ ] **Step 3: Commit**

```bash
git add e2e/src/specs/web/photos-filter-panel.e2e-spec.ts
git commit -m "test(e2e): cover hiding and revealing unusable filter sections (#910)"
```

---

## Done when

- `make e2e-web-dev` is green for `photos-filter-panel` and `spaces-filter-panel`.
- No assertion was deleted or weakened to accommodate the feature — only seed data was added, plus the new
  describe block in Task 3.
