import type { LoginResponseDto } from '@immich/sdk';
import { SharedSpaceRole, updateAsset, updateMemberTimeline } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { thumbnailUtils } from 'src/ui/specs/timeline/utils';
import { asBearerAuth, utils } from 'src/utils';

test.describe('Recently Added', () => {
  let admin: LoginResponseDto;
  let emptyUser: LoginResponseDto;

  const ASSET_COUNT = 12;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    // Seed a populated library for the admin: 12 assets on distinct days.
    for (let i = 0; i < ASSET_COUNT; i++) {
      const day = String(i + 1).padStart(2, '0');
      await utils.createAsset(admin.accessToken, {
        fileCreatedAt: `2023-08-${day}T10:00:00.000Z`,
        fileModifiedAt: `2023-08-${day}T10:00:00.000Z`,
      });
    }

    // A second user with an empty library, for the empty-state scenario.
    emptyUser = await utils.userSetup(admin.accessToken, {
      email: 'recently-added-empty@immich.cloud',
      name: 'Empty Library',
      password: 'password',
    });
  });

  // Scenario: Count shown for a populated library
  test('shows the item count in the header for a populated library', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto('/recently-added');

    await expect(page.getByTestId('page-header-description')).toHaveText(`${ASSET_COUNT} items`);
  });

  // Scenario: Count hidden for an empty library
  test('hides the item count and shows the placeholder for an empty library', async ({ context, page }) => {
    await utils.setAuthCookies(context, emptyUser.accessToken);
    await page.goto('/recently-added');

    // The empty-state placeholder confirms the timeline finished loading with no assets.
    // Copy comes from i18n/en.json `no_assets_message`.
    await expect(page.getByText('Click to upload your first photo')).toBeVisible();
    await expect(page.getByTestId('page-header-description')).toHaveCount(0);
  });

  // Scenario: Count is not shown while selecting
  test('replaces the header with the selection bar during multi-select', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto('/recently-added');
    await expect(page.getByTestId('page-header-description')).toHaveText(`${ASSET_COUNT} items`);

    // Enter multi-select: hover a thumbnail so its checkbox overlay renders, then click it.
    const thumb = thumbnailUtils.locator(page).first();
    await expect(thumb).toBeVisible();
    await thumb.hover();
    await thumb.locator('button[role="checkbox"]').click();

    // `hideNavbar` collapses the entire header row (title + count); the selection bar takes over.
    await expect(page.getByTestId('page-header-description')).toHaveCount(0);
    await expect(page.getByTestId('page-header')).toHaveCount(0);
  });
});

test.describe('Recently Added filters', () => {
  let admin: LoginResponseDto;
  const videos: Awaited<ReturnType<typeof utils.createAsset>>[] = [];

  const TOTAL = 20;
  const VIDEOS = 5;
  const RATED = 3;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    // Seed with *taken* dates deliberately unrelated to upload order, so "ordered by added date"
    // is a meaningful assertion: taken dates run backwards while added order runs forwards.
    const images = [];
    for (let i = 0; i < TOTAL - VIDEOS; i++) {
      const day = String(TOTAL - VIDEOS - i).padStart(2, '0');
      images.push(
        await utils.createAsset(admin.accessToken, {
          fileCreatedAt: `2023-09-${day}T10:00:00.000Z`,
          fileModifiedAt: `2023-09-${day}T10:00:00.000Z`,
        }),
      );
    }

    // Videos' taken dates run *opposite* to their upload order, so within the video-filtered set
    // "newest added first" and "newest taken first" disagree. That disagreement is the whole point
    // of the ordering scenario below — seeding them ascending would make the test pass equally
    // against orderBy: TakenAt, i.e. unable to detect the bug it exists to catch.
    for (let i = 0; i < VIDEOS; i++) {
      videos.push(
        await utils.createAsset(admin.accessToken, {
          fileCreatedAt: `2023-10-0${VIDEOS - i}T10:00:00.000Z`,
          fileModifiedAt: `2023-10-0${VIDEOS - i}T10:00:00.000Z`,
          assetData: { filename: `example-${i}.mp4` },
        }),
      );
    }

    for (const asset of images.slice(0, RATED)) {
      await updateAsset({ id: asset.id, updateAssetDto: { rating: 5 } }, { headers: asBearerAuth(admin.accessToken) });
    }
  });

  async function gotoRecentlyAdded(
    context: import('@playwright/test').BrowserContext,
    page: import('@playwright/test').Page,
    search = '',
  ) {
    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto('/recently-added');
    // Panel collapse is persisted in localStorage — start every test from a clean state.
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/recently-added${search}`);
    await page.waitForSelector('[data-testid="discovery-panel"], [data-testid="filter-toggle-btn"]');
  }

  test('renders the nine metadata filter sections and no text section', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page);

    await expect(page.getByTestId('discovery-panel')).toBeVisible();
    for (const section of [
      'timeline',
      'people',
      'location',
      'camera',
      'tags',
      'rating',
      'media',
      'favorites',
      'albums',
    ]) {
      await expect(page.getByTestId(`filter-section-${section}`)).toBeVisible();
    }
    // Slice 3 adds this; it must not exist yet.
    await expect(page.getByTestId('filter-section-text')).toHaveCount(0);
  });

  // Spec scenario: Filtering by media type updates grid, URL, and count
  test('filtering by media type updates the count and the URL', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page);
    await expect(page.getByTestId('page-header-description')).toHaveText(`${TOTAL} items`);

    const bucketResponse = page.waitForResponse((r) => r.url().includes('/timeline/buckets'));
    await page.getByTestId('media-type-video').click();
    await bucketResponse;

    await expect(page.getByTestId('page-header-description')).toHaveText(`${VIDEOS} items`);
    await expect(page).toHaveURL(/type=video/);
  });

  // Spec scenario: Removing a filter chip restores the full view
  test('removing the media-type chip restores the full view', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page);

    const filtered = page.waitForResponse((r) => r.url().includes('/timeline/buckets'));
    await page.getByTestId('media-type-video').click();
    await filtered;
    await expect(page.getByTestId('page-header-description')).toHaveText(`${VIDEOS} items`);

    // Collapse the panel so the ActiveFiltersBar and its chips are shown.
    await page.getByTestId('collapse-panel-btn').click();
    await expect(page.getByTestId('active-filters-bar')).toBeVisible();
    const chip = page.getByTestId('active-chip').first();
    await expect(chip).toBeVisible();

    const restored = page.waitForResponse((r) => r.url().includes('/timeline/buckets'));
    // Remove the chip itself (exercises handleRemoveActiveFilter), not "clear all".
    // dispatchEvent avoids the UserPageLayout absolute header overlaying the control,
    // the same workaround photos-filter-panel.e2e-spec.ts uses.
    await chip.getByRole('button').last().dispatchEvent('click');
    await restored;

    await expect(page.getByTestId('page-header-description')).toHaveText(`${TOTAL} items`);
    await expect(page).not.toHaveURL(/type=video/);
  });

  test('clear all removes every active filter', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page, '?rating=5');
    await expect(page.getByTestId('page-header-description')).toHaveText(`${RATED} items`);

    await page.getByTestId('collapse-panel-btn').click();
    await expect(page.getByTestId('active-filters-bar')).toBeVisible();

    const cleared = page.waitForResponse((r) => r.url().includes('/timeline/buckets'));
    await page.getByTestId('clear-all-btn').dispatchEvent('click');
    await cleared;

    await expect(page.getByTestId('page-header-description')).toHaveText(`${TOTAL} items`);
  });

  // Spec scenario: A filter matching nothing shows a zero count, not an empty account
  test('a filter that matches nothing shows "0 items" and keeps the panel open', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page, '?make=NoSuchCameraMake');

    await expect(page.getByTestId('page-header-description')).toHaveText('0 items');
    // The panel must stay mounted so the user can change the filter.
    await expect(page.getByTestId('discovery-panel')).toBeVisible();
  });

  // Spec scenario: Filters survive a reload (URL is source of truth)
  test('filters survive a reload', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page, '?rating=5');
    await expect(page.getByTestId('page-header-description')).toHaveText(`${RATED} items`);

    await page.reload();
    await expect(page.getByTestId('page-header-description')).toHaveText(`${RATED} items`);
    await expect(page).toHaveURL(/rating=5/);
  });

  // Spec scenario: Recently Added stays ordered by added date under a filter
  test('stays ordered by added date under a filter', async ({ context, page }) => {
    // Within the video-filtered set, added order and taken order run opposite (see the seeding),
    // so this scenario can tell the two ordering bases apart. Applying a filter must not change
    // the basis: the grid stays ordered by *added* date, newest first.
    await gotoRecentlyAdded(context, page);

    const filtered = page.waitForResponse((r) => r.url().includes('/timeline/buckets'));
    await page.getByTestId('media-type-video').click();
    await filtered;
    await expect(page.getByTestId('page-header-description')).toHaveText(`${VIDEOS} items`);

    // The LAST-UPLOADED video must lead the grid. Its taken date is the *oldest* of the five, so
    // this assertion fails if the view ever orders by taken date instead of added date.
    const first = thumbnailUtils.locator(page).first();
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute('data-asset', videos.at(-1)!.id);
  });
});

// Slice 3 Task 4: acceptance scenarios for the text-search path, driven exclusively through the
// `?q=` deep link (the navbar global search commits to the same URL) — NOT through the panel's
// `'text'` section, which is `<TextFilter>` editing description/originalFileName/ocr *metadata*
// filters and cannot submit a smart-search query. This describe resets the database and builds
// its own fixture: it cannot inherit from either describe above, both of which reset it too.

// Search-results mode never renders the browse-mode Timeline (`#asset-grid`); it renders either a
// result count or the empty state via SpaceSearchResults — the same component /photos uses (see
// photos-search.e2e-spec.ts). Asserting this MODE SWITCH first, before anything else, is what
// makes every scenario below fail for the right reason pre-wiring: today `/recently-added` ignores
// `?q=` entirely and keeps rendering the timeline, so this is exactly what goes red.
async function expectSearchResultsMode(page: import('@playwright/test').Page) {
  await expect(page.locator('#asset-grid')).toHaveCount(0);
  await expect(page.getByTestId('result-count').or(page.getByTestId('search-empty'))).toBeVisible({
    timeout: 15_000,
  });
}

test.describe('Recently Added text search', () => {
  let admin: LoginResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    // A few personal assets so the browse-mode header has a real, non-empty count to fall back to
    // once the query is cleared (an empty library hides the count entirely — see the "Recently
    // Added" describe above — which would make the clear-query scenario's count assertion moot).
    await Promise.all([
      utils.createAsset(admin.accessToken),
      utils.createAsset(admin.accessToken),
      utils.createAsset(admin.accessToken),
    ]);
  });

  async function gotoRecentlyAdded(
    context: import('@playwright/test').BrowserContext,
    page: import('@playwright/test').Page,
    path = '/recently-added',
  ) {
    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto(path);
    // Panel collapse is persisted in localStorage — start every test from a clean state (same
    // precaution as the "Recently Added filters" describe above).
    await page.evaluate(() => localStorage.clear());
    await page.goto(path);
    await page.waitForSelector(
      '[data-testid="discovery-panel"], [data-testid="collapsed-icon-strip"], [data-testid="result-count"], [data-testid="search-empty"]',
    );
  }

  // Scenario: A text query switches to search results with a total count
  test('a text query in the URL switches to search results with a total count', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page, '/recently-added?q=beach');

    await expectSearchResultsMode(page);
    // The header count now comes from the search total, not the timeline's asset count. Its exact
    // value depends on ML availability in this e2e stack (see the scope scenario below for why
    // that can't be made deterministic here) — this only pins the *shape* of the header text.
    await expect(page.getByTestId('page-header-description')).toHaveText(/^\d+ items$/, { timeout: 15_000 });
  });

  // Scenario: Clearing the query returns to the added-date timeline
  test('clearing the query returns to the added-date timeline', async ({ context, page }) => {
    await gotoRecentlyAdded(context, page, '/recently-added?q=beach');
    await expectSearchResultsMode(page);

    await page.goto('/recently-added');

    await expect(page.locator('#asset-grid')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('page-header-description')).toHaveText(/^\d+ items$/, { timeout: 15_000 });
  });

  // Scenario: Text search stays within own + partner scope
  test('text search stays within own + partner scope', async ({ context, page }) => {
    test.setTimeout(45_000);

    // A second user OWNS the shared asset and adds it to a space our test actor (admin) is a
    // member of — the reverse of the usual owner-is-admin shape used elsewhere in this file.
    const ownerLogin = await utils.userSetup(admin.accessToken, {
      email: 'recently-added-search-owner@immich.cloud',
      name: 'Search Space Owner',
      password: 'password',
    });

    const sharedAsset = await utils.createAsset(ownerLogin.accessToken);
    const space = await utils.createSpace(ownerLogin.accessToken, { name: 'Search Scope Space' });
    await utils.addSpaceMember(ownerLogin.accessToken, space.id, {
      userId: admin.userId,
      role: SharedSpaceRole.Viewer,
    });
    await utils.addSpaceAssets(ownerLogin.accessToken, space.id, [sharedAsset.id]);

    // Member-level timeline opt-in — NOT the album-level `showInTimeline` toggle, the two are not
    // interchangeable (spaces-albums-timeline.e2e-spec.ts:19-23). Self-PATCH:
    // `/shared-spaces/{id}/members/me/timeline` requires the member's own token, not the owner's
    // (see space-map-markers.e2e-spec.ts:62-66).
    await updateMemberTimeline(
      { id: space.id, sharedSpaceMemberTimelineDto: { showInTimeline: true } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    const query = 'harbor';
    const sharedThumbnail = page.locator(`img[src="/api/assets/${sharedAsset.id}/thumbnail"]`);

    // Positive control: the identical query on /photos (own + partner + shared spaces — it always
    // sends `withSharedSpaces: true`) DOES find the shared-space asset. Without this, the absence
    // assertion below would be unfalsifiable — it would pass for a dozen unrelated reasons (never
    // indexed, no semantic match, a missed opt-in, or a seeding bug), not because Recently Added
    // actually enforces its narrower own+partner scope.
    await utils.setAuthCookies(context, admin.accessToken);
    await page.goto(`/photos?q=${query}`);
    await expect(page.locator('#asset-grid')).toHaveCount(0);
    await expect(page.getByTestId('result-count').or(page.getByTestId('search-empty'))).toBeVisible({
      timeout: 15_000,
    });
    await expect(sharedThumbnail).toBeVisible({ timeout: 15_000 });

    // The real assertion: Recently Added is own + partner only, so the same query must still
    // switch into search mode (asserted BEFORE the absence check — otherwise this would also pass
    // against today's unwired route, whose own+partner *timeline* trivially never contains an
    // asset it was never seeded with in the first place).
    await page.goto(`/recently-added?q=${query}`);
    await expectSearchResultsMode(page);
    await expect(sharedThumbnail).toHaveCount(0);
  });
});
