import { getAssetInfo, SharedSpaceRole, type LoginResponseDto } from '@immich/sdk';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { asBearerAuth, testAssetDir, utils } from 'src/utils';

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
