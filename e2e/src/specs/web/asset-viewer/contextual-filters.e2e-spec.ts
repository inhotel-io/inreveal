import { getAssetInfo, getFilteredMapMarkers, SharedSpaceRole, updateAssets, type LoginResponseDto } from '@immich/sdk';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { asBearerAuth, testAssetDir, utils } from 'src/utils';

/**
 * The two camera fixtures every scenario below is built on. They are picked so that no assertion can
 * pass vacuously:
 *
 * - `prairie_falcon.jpg` — a full Canon EXIF block (make `Canon`, model `Canon EOS R5`) and **no GPS**.
 * - `IMG_2682.heic`      — Apple / iPhone 7 EXIF **and** GPS.
 *
 * Two DISTINCT makes means a camera filter has something to exclude, and a map filtered by one make
 * has a second marker it must drop. A single-fixture test would pass even if the filter did nothing.
 */
const CANON_FIXTURE = 'albums/nature/prairie_falcon.jpg';
const APPLE_FIXTURE = 'formats/heic/IMG_2682.heic';

const upload = (accessToken: string, path: string) =>
  utils.createAsset(accessToken, {
    assetData: { bytes: readFileSync(`${testAssetDir}/${path}`), filename: basename(path) },
  });

/**
 * `prairie_falcon.jpg` carries no GPS EXIF, so it has to be put on the map explicitly. The bulk
 * update reverse-geocodes the point server-side, which is what fills in city/state/country — and the
 * asset viewer's location row (and therefore its 🗺️ pin) only renders once `country` is set.
 *
 * Must run AFTER metadata extraction has drained, or the extraction job overwrites it back to null.
 */
const setAssetGeo = (accessToken: string, id: string, latitude: number, longitude: number) =>
  updateAssets({ assetBulkUpdateDto: { ids: [id], latitude, longitude } }, { headers: asBearerAuth(accessToken) });

/** The camera as the DetailPanel labels it — read back from the SERVER, not hard-coded. */
const readCamera = async (accessToken: string, id: string) => {
  const info = await getAssetInfo({ id }, { headers: asBearerAuth(accessToken) });
  const make = info.exifInfo?.make ?? '';
  const model = info.exifInfo?.model ?? '';
  expect(make, 'the fixture must carry camera EXIF, or every camera assertion here is vacuous').not.toBe('');
  return { make, model, label: [make, model].filter(Boolean).join(' ') };
};

/**
 * `commit`, not the default `load`: the asset viewer downloads the FULL-SIZE original, and waiting
 * for the page's load event therefore waits for that image. Nothing here needs the pixels — the
 * detail panel is driven by the asset's JSON — and the two waits below are the real barrier.
 */
const openDetailPanel = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'commit' });
  await page.waitForSelector('#immich-asset-viewer');
  await page.getByRole('button', { name: 'Info' }).click();
  await expect(page.locator('#detail-panel')).toBeVisible();
};

/**
 * The map's markers, straight from the API — deliberately NOT through `page.request`, which shares
 * the browser context's cookie jar and turned this pure data-setup call into a flake.
 */
const markerIds = async (accessToken: string, params: Parameters<typeof getFilteredMapMarkers>[0]) => {
  const markers = await getFilteredMapMarkers(params, { headers: asBearerAuth(accessToken) });
  return markers.map((marker) => marker.id);
};

/**
 * `/map` mounts MapLibre, which pulls its style and tiles from an EXTERNAL host. Waiting for the
 * page's `load` event (waitForURL's default) therefore waits on a third party and times out under
 * load. Nothing asserted here needs a rendered tile: the URL, the marker query and the chip bar all
 * come from the app itself, so commit is the right barrier.
 */
const waitForMapUrl = (page: Page) => page.waitForURL((url) => url.pathname === '/map', { waitUntil: 'commit' });

/**
 * Slice 7's headline scenario, end to end (spec §5.4/§6, plan R8, P1).
 *
 * Inside a Space, clicking a metadata value in the asset viewer filters THAT SPACE — the viewer
 * closes, the URL carries the filter, and a removable chip appears. The 🔍 icon is the escape hatch:
 * the same filter, but across the whole library.
 *
 * The person case is the one that cannot be caught by inspecting the URL alone (R8): a Space sends
 * `FilterState.personIds` as **`spacePersonIds`**, which the server validates as `z.array(z.uuidv4())`
 * — a BARE uuid. A `space-person:<uuid>` token there is a zod reject → **400** → the whole Space
 * timeline errors out. So this file drives a real Space, with a real space person, against the real
 * server, and asserts the timeline request comes back 200 with the asset still in it.
 *
 * The viewer is a SPACE MEMBER, not the owner: a member is the only viewer for whom the asset's
 * people are resolved to the space's people (`asset.people[].spacePersonId`), which is exactly the
 * shape the person patch depends on.
 */
test.describe('Asset viewer contextual filters', () => {
  let admin: LoginResponseDto;
  let member: LoginResponseDto;
  let spaceId: string;
  let assetId: string;
  let spacePersonId: string;
  let make: string;
  let model: string;
  let cameraLabel: string;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    await utils.connectDatabase();

    admin = await utils.adminSetup();
    member = await utils.userSetup(admin.accessToken, {
      email: 'space-member@test.com',
      name: 'Space Member',
      password: 'password',
    });

    const space = await utils.createSpace(admin.accessToken, { name: 'Iceland' });
    spaceId = space.id;
    await utils.addSpaceMember(admin.accessToken, spaceId, {
      userId: member.userId,
      role: SharedSpaceRole.Editor,
    });

    // A real photo with real camera EXIF (prairie_falcon.jpg carries a full Canon block), plus a
    // second, EXIF-less asset so the camera/person filters actually NARROW the space (2 → 1) rather
    // than trivially matching everything in it.
    const asset = await utils.createAsset(admin.accessToken, {
      assetData: {
        bytes: readFileSync(`${testAssetDir}/albums/nature/prairie_falcon.jpg`),
        filename: 'prairie_falcon.jpg',
      },
    });
    assetId = asset.id;
    const other = await utils.createAsset(admin.accessToken);
    await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');
    await utils.addSpaceAssets(admin.accessToken, spaceId, [assetId, other.id]);

    const info = await getAssetInfo({ id: assetId }, { headers: asBearerAuth(admin.accessToken) });
    make = info.exifInfo?.make ?? '';
    model = info.exifInfo?.model ?? '';
    expect(make, 'the fixture must have camera EXIF for this suite to mean anything').not.toBe('');
    cameraLabel = [make, model].filter(Boolean).join(' ');

    const person = await utils.createSpacePerson(spaceId, 'Alice', admin.userId, assetId);
    spacePersonId = person.spacePersonId;
  });

  const openDetailPanelInSpace = async (page: Page) => {
    await page.goto(`/spaces/${spaceId}/photos/${assetId}`);
    await page.waitForSelector('#immich-asset-viewer');
    await page.getByRole('button', { name: 'Info' }).click();
    await expect(page.locator('#detail-panel')).toBeVisible();
  };

  test('clicking the camera filters the Space, closes the viewer, and leaves a removable chip', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, member.accessToken);
    await openDetailPanelInSpace(page);

    const buckets = page.waitForResponse((response) => response.url().includes('/timeline/buckets'));
    await page.getByLabel(`Filter by this camera: ${cameraLabel}`).click();
    const bucketResponse = await buckets;
    expect(bucketResponse.status()).toBe(200);

    // One goto() both applies the filter and closes the asset viewer.
    await page.waitForURL((url) => url.pathname === `/spaces/${spaceId}`);
    const url = new URL(page.url());
    expect(url.searchParams.get('make')).toBe(make);
    expect(url.searchParams.get('model')).toBe(model);
    expect(page.url()).not.toContain(assetId);
    await expect(page.locator('#immich-asset-viewer')).toHaveCount(0);

    // P1, end to end: the photo the camera was clicked on is still in the filtered Space.
    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');

    const chip = page.locator('[data-testid="active-chip"]').filter({ hasText: cameraLabel });
    await expect(chip).toBeVisible();

    await chip.locator('[data-testid="chip-close"]').click();
    await page.waitForURL((url) => !url.searchParams.has('make'));
    await expect(chip).toHaveCount(0);
  });

  // E5 — the escape hatch: the same filter, but across the whole library, carrying no Space with it.
  test('the search-everywhere icon escapes to /photos instead of filtering the Space', async ({ context, page }) => {
    await utils.setAuthCookies(context, member.accessToken);
    await openDetailPanelInSpace(page);

    await page.getByLabel(`Search everywhere: ${cameraLabel}`).click();

    await page.waitForURL((url) => url.pathname === '/photos');
    const url = new URL(page.url());
    expect(url.searchParams.get('make')).toBe(make);
    expect(page.url()).not.toContain('/spaces');
    expect(page.url()).not.toContain(assetId);
  });

  /**
   * R8 — the one that would 400. Following the spec's original "always send the scoped token" rule
   * here sends `people=space-person:<uuid>` to a Space, which the space timeline forwards as
   * `spacePersonIds` → zod rejects → 400 → the whole timeline errors out. The shipped rule is
   * target-dependent: a Space gets the BARE space-person uuid.
   */
  test('a person inside a Space filters by the bare space-person id, and the timeline does not error', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, member.accessToken);

    const timelineFailures: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/timeline/') && response.status() >= 400) {
        timelineFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    await openDetailPanelInSpace(page);
    await page.getByLabel('Filter by this person: Alice').click();

    await page.waitForURL((url) => url.pathname === `/spaces/${spaceId}`);
    const people = new URL(page.url()).searchParams.get('people');

    expect(people).toBe(spacePersonId);
    expect(people).not.toContain('space-person:');
    await expect(page.locator('#immich-asset-viewer')).toHaveCount(0);

    // The timeline answered (no 400), and P1 holds: the asset the person was clicked on is in it.
    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');
    await expect(page.locator('[data-testid="active-filters-bar"]')).toBeVisible();
    expect(timelineFailures, 'the Space timeline must not error').toEqual([]);
  });
});

/**
 * S1 — the same grammar on the two surfaces the Space suite above does not cover: an ALBUM and
 * `/photos`. The filter has to land on the surface you are standing on, not on the library by
 * default, and the escape hatch has to disappear where it would be a no-op.
 *
 * E5: on `/photos` there is no 🔍. `/photos` IS everywhere — a "search everywhere" button next to a
 * filter that already searches everywhere would navigate to the page it is already on.
 */
test.describe('Asset viewer contextual filters on an album and /photos', () => {
  let admin: LoginResponseDto;
  let albumId: string;
  let canonId: string;
  let plainId: string;
  let camera: { make: string; model: string; label: string };

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    const canon = await upload(admin.accessToken, CANON_FIXTURE);
    canonId = canon.id;
    // A second asset with NO camera EXIF at all, so the camera filter has something to exclude on
    // both surfaces (2 → 1) instead of trivially matching everything.
    const plain = await utils.createAsset(admin.accessToken);
    plainId = plain.id;
    await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');
    // Drain the previews too: a grid tile or a viewer waiting on a thumbnail that is still queued is
    // a page-load stall, not a filter bug.
    await utils.waitForQueueFinish(admin.accessToken, 'thumbnailGeneration');

    const album = await utils.createAlbum(admin.accessToken, {
      albumName: 'Nature',
      assetIds: [canonId, plainId],
    });
    albumId = album.id;
    camera = await readCamera(admin.accessToken, canonId);
  });

  test('clicking the camera filters the ALBUM, closes the viewer, and leaves a removable chip', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    // Unfiltered, the album shows BOTH assets. Without this, the exclusion below could pass because
    // the grid never rendered the second asset at all.
    await page.goto(`/albums/${albumId}`);
    await expect(page.locator(`[data-asset-id="${canonId}"]`)).toBeVisible();
    await expect(page.locator(`[data-asset-id="${plainId}"]`)).toBeVisible();

    await openDetailPanel(page, `/albums/${albumId}/photos/${canonId}`);
    await page.getByLabel(`Filter by this camera: ${camera.label}`).click();

    // One goto() both applies the filter and closes the asset viewer — and it stays on the ALBUM.
    await page.waitForURL((url) => url.pathname === `/albums/${albumId}`);
    const url = new URL(page.url());
    expect(url.searchParams.get('make')).toBe(camera.make);
    expect(url.searchParams.get('model')).toBe(camera.model);
    expect(page.url()).not.toContain(canonId);
    await expect(page.locator('#immich-asset-viewer')).toHaveCount(0);

    // The album grid actually narrowed.
    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');
    await expect(page.locator(`[data-asset-id="${canonId}"]`)).toBeVisible();
    await expect(page.locator(`[data-asset-id="${plainId}"]`)).toHaveCount(0);

    const chip = page.locator('[data-testid="active-chip"]').filter({ hasText: camera.label });
    await expect(chip).toBeVisible();

    await chip.locator('[data-testid="chip-close"]').click();
    await page.waitForURL((url) => !url.searchParams.has('make'));
    await expect(chip).toHaveCount(0);
    await expect(page.locator(`[data-asset-id="${plainId}"]`)).toBeVisible();
  });

  test('clicking the camera on /photos filters the library, and offers NO search-everywhere icon (E5)', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    await openDetailPanel(page, `/photos/${canonId}`);

    // E5 — the value is still a filter affordance here, but the escape hatch is gone.
    await expect(page.getByLabel(`Filter by this camera: ${camera.label}`)).toBeVisible();
    await expect(page.getByLabel(`Search everywhere: ${camera.label}`)).toHaveCount(0);

    await page.getByLabel(`Filter by this camera: ${camera.label}`).click();

    await page.waitForURL((url) => url.pathname === '/photos');
    const url = new URL(page.url());
    expect(url.searchParams.get('make')).toBe(camera.make);
    expect(url.searchParams.get('model')).toBe(camera.model);
    expect(page.url()).not.toContain(canonId);
    await expect(page.locator('#immich-asset-viewer')).toHaveCount(0);

    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');
    await expect(page.locator(`[data-asset-id="${canonId}"]`)).toBeVisible();
    await expect(page.locator(`[data-asset-id="${plainId}"]`)).toHaveCount(0);

    const chip = page.locator('[data-testid="active-chip"]').filter({ hasText: camera.label });
    await expect(chip).toBeVisible();
  });
});

/**
 * S2 (E10) and S3 (#767) — the map, the one affordance that changes surface.
 *
 * S3 is the ORIGINAL bug report and the reason slices 3–5 exist: a Space filtered to a camera used to
 * hand the map nothing but its `spaceId`, so the map cheerfully showed every pin in the space while
 * the chip claimed a filter was active. Asserting the URL alone would NOT catch that — the fix lives
 * in what the map then DOES with the filter — so the space here holds two geotagged assets with
 * DIFFERENT makes and the test asserts the non-matching marker is gone.
 */
test.describe('Asset viewer contextual filters — the map handoff', () => {
  let admin: LoginResponseDto;
  let spaceId: string;
  let canonId: string;
  let appleId: string;
  let camera: { make: string; model: string; label: string };

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    const canon = await upload(admin.accessToken, CANON_FIXTURE);
    canonId = canon.id;
    const apple = await upload(admin.accessToken, APPLE_FIXTURE);
    appleId = apple.id;
    await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');
    // Drain the previews too: a grid tile or a viewer waiting on a thumbnail that is still queued is
    // a page-load stall, not a filter bug.
    await utils.waitForQueueFinish(admin.accessToken, 'thumbnailGeneration');

    // The Apple fixture is geotagged in EXIF; the Canon one is not, so give it a point of its own.
    // Both are on the map — with different cameras.
    await setAssetGeo(admin.accessToken, canonId, 48.8566, 2.3522);

    const space = await utils.createSpace(admin.accessToken, { name: 'Roadtrip' });
    spaceId = space.id;
    await utils.addSpaceAssets(admin.accessToken, spaceId, [canonId, appleId]);

    camera = await readCamera(admin.accessToken, canonId);
  });

  // E10 — the pin is a change of surface, so it must carry the Space with it or it silently widens
  // "this space" to "the whole library".
  test('the location pin opens the map carrying the Space (E10)', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    await openDetailPanel(page, `/spaces/${spaceId}/photos/${canonId}`);

    // The row only renders once reverse geocoding has filled in a country — assert it did, or the
    // pin below would be missing for the wrong reason.
    await expect(page.locator('[data-testid="detail-panel-location"]')).toBeVisible();
    await page.getByLabel('View in map').click();

    await waitForMapUrl(page);
    expect(new URL(page.url()).searchParams.get('spaceId')).toBe(spaceId);
  });

  test('#767: a Space filtered to a camera carries that filter to the map, and the map NARROWS', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    // Sanity — unfiltered, the Space's map has BOTH markers. Without it, every exclusion below could
    // pass because a fixture silently lost its GPS.
    const unfiltered = await markerIds(admin.accessToken, { spaceId });
    expect(unfiltered.toSorted()).toEqual([canonId, appleId].toSorted());

    // #767's exact repro, step 1: filter the Space to the Canon, from the asset viewer.
    await openDetailPanel(page, `/spaces/${spaceId}/photos/${canonId}`);
    await page.getByLabel(`Filter by this camera: ${camera.label}`).click();
    await page.waitForURL(
      (url) => url.pathname === `/spaces/${spaceId}` && url.searchParams.get('make') === camera.make,
    );
    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');

    // Step 2: click the Space's map icon. (An href-scoped locator: the sidebar has a `/map` link
    // with the same accessible name, and only the Space's carries a spaceId.)
    const markers = page.waitForResponse(
      (response) =>
        response.url().includes('/gallery/map/markers') &&
        response.url().includes(`make=${encodeURIComponent(camera.make)}`) &&
        response.status() === 200,
    );
    await page.locator('a[aria-label="Map"][href*="spaceId="]').click();

    await waitForMapUrl(page);
    const url = new URL(page.url());
    expect(url.searchParams.get('spaceId')).toBe(spaceId);
    expect(url.searchParams.get('make')).toBe(camera.make);
    expect(url.searchParams.get('model')).toBe(camera.model);

    // The URL is the easy half. This is the half that was broken: the map's own marker query.
    const markerResponse = await markers;
    const ids = ((await markerResponse.json()) as Array<{ id: string }>).map((marker) => marker.id);
    expect(ids).toContain(canonId);
    expect(ids, 'the map must drop the marker of the asset shot on the other camera').not.toContain(appleId);
    expect(ids, 'the map narrowed 2 markers → 1').toHaveLength(1);

    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');
    await expect(page.locator('[data-testid="active-chip"]').filter({ hasText: camera.label })).toBeVisible();
  });
});

/**
 * S4 (E17) — the RBAC scenario the spec says must not be dropped for time: the end-to-end proof of
 * §4.4, that a NON-OWNER can filter by metadata of an asset they do not own and get that owner's
 * assets back.
 *
 * Every layer beneath this is already covered (the DTOs, the repository's RBAC projection, the
 * timeline service); this is the one that proves they compose in a browser. B owns NOTHING: every
 * asset in the space is A's, so a filter that quietly fell back to "my own assets" would return an
 * empty timeline, and one that ignored the filter would return both of A's assets. The negative
 * control (a second asset of A's, different camera) is what separates those two failures from a pass.
 */
test.describe('Asset viewer contextual filters — a Space VIEWER filters another member’s asset (E17)', () => {
  let admin: LoginResponseDto;
  let viewer: LoginResponseDto;
  let spaceId: string;
  let canonId: string;
  let appleId: string;
  let camera: { make: string; model: string; label: string };
  let city: string;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    // B — a Viewer of the space who owns nothing in it.
    viewer = await utils.userSetup(admin.accessToken, {
      email: 'space-viewer@test.com',
      name: 'Space Viewer',
      password: 'password',
    });

    // A's two assets: same owner, DIFFERENT cameras.
    const canon = await upload(admin.accessToken, CANON_FIXTURE);
    canonId = canon.id;
    const apple = await upload(admin.accessToken, APPLE_FIXTURE);
    appleId = apple.id;
    await utils.waitForQueueFinish(admin.accessToken, 'metadataExtraction');
    // Drain the previews too: a grid tile or a viewer waiting on a thumbnail that is still queued is
    // a page-load stall, not a filter bug.
    await utils.waitForQueueFinish(admin.accessToken, 'thumbnailGeneration');

    // A location on A's asset, so the row renders for B — and so the missing pencil below is a real
    // absence rather than a row that was never drawn.
    await setAssetGeo(admin.accessToken, canonId, 48.8566, 2.3522);

    const space = await utils.createSpace(admin.accessToken, { name: 'Two Owners' });
    spaceId = space.id;
    await utils.addSpaceMember(admin.accessToken, spaceId, {
      userId: viewer.userId,
      role: SharedSpaceRole.Viewer,
    });
    await utils.addSpaceAssets(admin.accessToken, spaceId, [canonId, appleId]);

    camera = await readCamera(admin.accessToken, canonId);
    // Read the reverse-geocoded city back rather than hard-coding it: the label under test is
    // whatever the server geocoded, and a wrong guess here would fail for the wrong reason.
    const info = await getAssetInfo({ id: canonId }, { headers: asBearerAuth(admin.accessToken) });
    city = info.exifInfo?.city ?? '';
    expect(city, 'reverse geocoding must have produced a city, or the location row never renders').not.toBe('');
  });

  test('a Viewer filters the Space by a camera they do not own, and gets the owner’s matching asset', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, viewer.accessToken);

    // Unfiltered, B sees BOTH of A's assets. This is the control for the exclusion further down.
    await page.goto(`/spaces/${spaceId}`);
    await expect(page.locator(`[data-asset-id="${canonId}"]`)).toBeVisible();
    await expect(page.locator(`[data-asset-id="${appleId}"]`)).toBeVisible();

    await openDetailPanel(page, `/spaces/${spaceId}/photos/${canonId}`);
    await page.getByLabel(`Filter by this camera: ${camera.label}`).click();

    await page.waitForURL((url) => url.pathname === `/spaces/${spaceId}`);
    const url = new URL(page.url());
    expect(url.searchParams.get('make')).toBe(camera.make);
    expect(url.searchParams.get('model')).toBe(camera.model);
    await expect(page.locator('#immich-asset-viewer')).toHaveCount(0);

    // §4.4, end to end: the timeline is filtered, and the asset B does not own is still in it.
    await expect(page.locator('[data-testid="result-count"]')).toContainText('1 result');
    await expect(page.locator(`[data-asset-id="${canonId}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-asset-id="${appleId}"]`),
      'the other camera’s asset must be excluded, or "filtered" is unproven',
    ).toHaveCount(0);
  });

  test('the values stay clickable for a Viewer, but editing them stays owner-gated', async ({ context, page }) => {
    await utils.setAuthCookies(context, viewer.accessToken);
    await openDetailPanel(page, `/spaces/${spaceId}/photos/${canonId}`);

    // The rows are there, and their values are filter affordances for a non-owner…
    await expect(page.locator('[data-testid="detail-panel-location"]')).toBeVisible();
    await expect(page.getByLabel(`Filter by this location: ${city}`)).toBeVisible();
    await expect(page.getByLabel(/^Filter by this date/)).toBeVisible();

    // …while the owner-only affordances on those same rows are absent.
    await expect(page.getByLabel('Edit location')).toHaveCount(0);
    await expect(page.locator('[data-testid="detail-panel-edit-date-button"]')).toHaveCount(0);
  });
});
