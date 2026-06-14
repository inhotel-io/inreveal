import {
  AlbumResponseDto,
  AlbumUserRole,
  AssetMediaResponseDto,
  BulkIdResponseDto,
  LoginResponseDto,
  SharedSpaceResponseDto,
  SharedSpaceRole,
  addAssetsToAlbum,
  getSpacePeople,
  removeAssetFromAlbum,
} from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { createUserDto } from 'src/fixtures';
import { asBearerAuth, utils } from 'src/utils';

// Web E2E coverage for the in-space albums UI.
//
// Role matrix under test:
//   Owner  → creates space, album, assets; links album to space.
//   Editor → space Editor + album Editor: can see Link button, open album, open add-photos overlay.
//   Viewer → space Viewer, no album membership: can browse the grid and album but has no write controls.
//
// The spec deliberately avoids arbitrary timeouts — every assertion awaits a
// visible element to prevent races.

test.describe('Spaces — Albums UI (editor flows + viewer-denied gating)', () => {
  let admin: LoginResponseDto;
  let owner: LoginResponseDto;
  let editor: LoginResponseDto;
  let viewer: LoginResponseDto;
  let space: SharedSpaceResponseDto;
  let album: AlbumResponseDto;
  let asset!: AssetMediaResponseDto;
  let asset2!: AssetMediaResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();

    [owner, editor, viewer] = await Promise.all([
      utils.userSetup(admin.accessToken, createUserDto.create('albums-owner')),
      utils.userSetup(admin.accessToken, createUserDto.create('albums-editor')),
      utils.userSetup(admin.accessToken, createUserDto.create('albums-viewer')),
    ]);

    // Create the space owned by `owner`.
    space = await utils.createSpace(owner.accessToken, { name: 'Albums Test Space' });

    // Add members.
    await utils.addSpaceMember(owner.accessToken, space.id, {
      userId: editor.userId,
      role: SharedSpaceRole.Editor,
    });
    await utils.addSpaceMember(owner.accessToken, space.id, {
      userId: viewer.userId,
      role: SharedSpaceRole.Viewer,
    });

    // Create two assets owned by `owner` so the album is non-empty and the viewer has a sibling
    // to navigate to (next/prev test).
    [asset, asset2] = await Promise.all([utils.createAsset(owner.accessToken), utils.createAsset(owner.accessToken)]);

    // Album owned by `owner`, shared with `editor` as album editor (so editor passes the
    // linkAlbum two-step gate: space Editor role + album Editor access).
    album = await utils.createAlbum(owner.accessToken, {
      albumName: 'Linked Album',
      albumUsers: [{ userId: editor.userId, role: AlbumUserRole.Editor }],
      assetIds: [asset.id, asset2.id],
    });

    // Link the album to the space (performed as owner, who satisfies both gates).
    await utils.linkSpaceAlbum(owner.accessToken, space.id, album.id);
  });

  // ─── EDITOR flows ─────────────────────────────────────────────────────────

  test.describe('editor', () => {
    test('sees the Link-album button and the linked album on the albums grid', async ({ context, page }) => {
      await utils.setAuthCookies(context, editor.accessToken);
      await page.goto(`/spaces/${space.id}/albums`);

      // The "Link album" button in the page header is editor-only.
      await expect(page.getByTestId('link-album-button')).toBeVisible();

      // The linked album card must be present — located by the album name text
      // inside the `space-album-card-link` anchor.
      await expect(page.getByTestId('space-album-card-link').filter({ hasText: 'Linked Album' })).toBeVisible();
    });

    test('can open a linked album and sees the Add-photos button', async ({ context, page }) => {
      await utils.setAuthCookies(context, editor.accessToken);
      await page.goto(`/spaces/${space.id}/albums`);

      // Click the album card link to navigate to the album detail page.
      await page.getByTestId('space-album-card-link').filter({ hasText: 'Linked Album' }).click();

      // Verify we landed on the correct URL.
      await page.waitForURL(`/spaces/${space.id}/albums/${album.id}`);

      // The Add-photos icon button is rendered only for editors (canManage && mode === 'browse').
      await expect(page.getByTestId('add-photos-button')).toBeVisible();
    });

    test('can open and close the add-photos picker overlay', async ({ context, page }) => {
      await utils.setAuthCookies(context, editor.accessToken);
      await page.goto(`/spaces/${space.id}/albums/${album.id}`);

      // Open the overlay.
      await page.getByTestId('add-photos-button').click();
      await expect(page.getByTestId('add-photos-overlay')).toBeVisible();

      // Close the overlay via the back / close button that appears in the overlay's
      // ControlAppBar. The overlay renders a back IconButton with aria-label "back".
      await page.getByRole('button', { name: /back/i }).click();
      await expect(page.getByTestId('add-photos-overlay')).not.toBeVisible();
    });
  });

  // ─── VIEWER flows (read-only / denied) ────────────────────────────────────

  test.describe('viewer', () => {
    test('does NOT see the Link-album button or the card context menu on the albums grid', async ({
      context,
      page,
    }) => {
      await utils.setAuthCookies(context, viewer.accessToken);
      await page.goto(`/spaces/${space.id}/albums`);

      // The viewer should still see the linked album card (read access).
      await expect(page.getByTestId('space-album-card-link').filter({ hasText: 'Linked Album' })).toBeVisible();

      // But the editor-only controls must be absent.
      await expect(page.getByTestId('link-album-button')).not.toBeVisible();

      // The context menu is inside the card and is only rendered when canManage is true.
      // It is hidden via CSS opacity-0 on non-hover; asserting not.toBeVisible() covers
      // both the missing-from-DOM case (viewer, canManage=false) and hidden-via-CSS.
      await expect(page.getByTestId('space-album-card-menu')).not.toBeVisible();
    });

    test('can open a linked album but sees no Add-photos button', async ({ context, page }) => {
      await utils.setAuthCookies(context, viewer.accessToken);
      await page.goto(`/spaces/${space.id}/albums`);

      await page.getByTestId('space-album-card-link').filter({ hasText: 'Linked Album' }).click();
      await page.waitForURL(`/spaces/${space.id}/albums/${album.id}`);

      // The timeline grouping control confirms the browse-mode UI is loaded.
      await expect(page.getByTestId('timeline-desktop-grouping-control')).toBeVisible();

      // The Add-photos button must not be present for a viewer.
      await expect(page.getByTestId('add-photos-button')).not.toBeVisible();
    });
  });

  // ─── Photo viewer ─────────────────────────────────────────────────────────

  test.describe('photo viewer', () => {
    test('owner clicks a photo → viewer opens at photos URL', async ({ context, page }) => {
      await utils.setAuthCookies(context, owner.accessToken);
      await page.goto(`/spaces/${space.id}/albums/${album.id}`);

      // Wait for the album timeline to be rendered and the thumbnail to be present.
      await page.waitForSelector(`[data-thumbnail-focus-container][data-asset="${asset.id}"]`);

      // Click the thumbnail to open the viewer.
      await page.locator(`[data-thumbnail-focus-container][data-asset="${asset.id}"]`).click();

      // The URL should update to include /photos/<assetId>.
      await page.waitForURL(`/spaces/${space.id}/albums/${album.id}/photos/${asset.id}`);

      // The asset viewer must be visible.
      await page.waitForSelector('#immich-asset-viewer');
      await expect(page.locator('#immich-asset-viewer')).toBeVisible();
    });

    test('close returns to the album grid', async ({ context, page }) => {
      await utils.setAuthCookies(context, owner.accessToken);
      await page.goto(`/spaces/${space.id}/albums/${album.id}`);

      await page.waitForSelector(`[data-thumbnail-focus-container][data-asset="${asset.id}"]`);
      await page.locator(`[data-thumbnail-focus-container][data-asset="${asset.id}"]`).click();
      await page.waitForSelector('#immich-asset-viewer');

      // Press Escape to close the viewer.
      await page.keyboard.press('Escape');

      // The viewer must be gone and the URL must return to the album grid.
      await page.waitForURL(`/spaces/${space.id}/albums/${album.id}`);
      await expect(page.locator('#immich-asset-viewer')).not.toBeVisible();
    });

    test('deep link to /photos/:assetId → viewer opens immediately', async ({ context, page }) => {
      await utils.setAuthCookies(context, owner.accessToken);

      // Navigate directly to the photos URL (deep link / refresh scenario).
      await page.goto(`/spaces/${space.id}/albums/${album.id}/photos/${asset.id}`);

      // The asset viewer must render without needing a click.
      await page.waitForSelector('#immich-asset-viewer');
      await expect(page.locator('#immich-asset-viewer')).toBeVisible();
    });

    test('non-owner member (viewer role) can open a photo', async ({ context, page }) => {
      await utils.setAuthCookies(context, viewer.accessToken);
      await page.goto(`/spaces/${space.id}/albums/${album.id}`);

      await page.waitForSelector(`[data-thumbnail-focus-container][data-asset="${asset.id}"]`);
      await page.locator(`[data-thumbnail-focus-container][data-asset="${asset.id}"]`).click();

      // Assert the URL updated and the viewer is visible — proves authorization via the
      // Phase 1 album-read predicate for space members.
      await page.waitForURL(`/spaces/${space.id}/albums/${album.id}/photos/${asset.id}`);
      await page.waitForSelector('#immich-asset-viewer');
      await expect(page.locator('#immich-asset-viewer')).toBeVisible();
    });

    test('arrow keys navigate between photos within the album', async ({ context, page }) => {
      await utils.setAuthCookies(context, owner.accessToken);
      await page.goto(`/spaces/${space.id}/albums/${album.id}`);

      // Open the first photo in the album timeline (order is timeline-dependent, so don't assume which).
      const photoUrl = new RegExp(`/spaces/${space.id}/albums/${album.id}/photos/[^/]+$`);
      await page.waitForSelector('[data-thumbnail-focus-container][data-asset]');
      await page.locator('[data-thumbnail-focus-container][data-asset]').first().click();
      await page.waitForURL(photoUrl);
      await page.waitForSelector('#immich-asset-viewer');
      const firstUrl = page.url();

      // ArrowRight moves to the sibling photo within the album — the assetId in the URL changes.
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => page.url()).not.toBe(firstUrl);
      await expect(page.locator('#immich-asset-viewer')).toBeVisible();
      expect(page.url()).toMatch(photoUrl);

      // ArrowLeft returns to the first photo.
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => page.url()).toBe(firstUrl);
      await expect(page.locator('#immich-asset-viewer')).toBeVisible();
    });
  });

  // ─── Navigation helper ────────────────────────────────────────────────────

  test('a space member can navigate from the space page to its Albums view via the Albums button', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, editor.accessToken);
    await page.goto(`/spaces/${space.id}`);

    // The Albums nav button is on the space timeline page.
    // data-testid="space-albums-button" at +page.svelte:980
    await page.getByTestId('space-albums-button').click();
    await page.waitForURL(`/spaces/${space.id}/albums`);
    await expect(page.getByTestId('space-album-card-link').filter({ hasText: 'Linked Album' })).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// API-level e2e: Spaces — linked-album live people sync
// Requires the e2e stack (make e2e). Skipped automatically when infra unavailable.
// ──────────────────────────────────────────────────────────────────────────────
test.describe('Spaces — linked-album live people sync', () => {
  let syncAdmin: LoginResponseDto;
  let syncOwner: LoginResponseDto;
  let syncSpace: SharedSpaceResponseDto;
  let syncAlbum: AlbumResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    syncAdmin = await utils.adminSetup();
    syncOwner = await utils.userSetup(syncAdmin.accessToken, createUserDto.create('sync-people-owner'));

    // Create the space. Face recognition is on by default for new spaces, which is what the
    // sync handlers gate on (faceRecognitionEnabled is not part of the create DTO).
    syncSpace = await utils.createSpace(syncOwner.accessToken, {
      name: 'Sync People Test Space',
    });
    await utils.addSpaceMember(syncOwner.accessToken, syncSpace.id, {
      userId: syncOwner.userId,
      role: SharedSpaceRole.Owner,
    });

    // Create an album and link it to the space.
    syncAlbum = await utils.createAlbum(syncOwner.accessToken, { albumName: 'Sync People Album' });
    await utils.linkSpaceAlbum(syncOwner.accessToken, syncSpace.id, syncAlbum.id);
  });

  test('adding an asset to a linked album and removing it keeps space people in sync', async () => {
    // Seed a space person that references this asset so we can verify face removal.
    // We use the DB seeder because real ML face detection is non-deterministic in CI.
    const asset = await utils.createAsset(syncOwner.accessToken);
    const { spacePersonId } = await utils.createSpacePerson(syncSpace.id, 'SyncTestPerson', syncOwner.userId, asset.id);

    // Add the asset to the album — this triggers AlbumAssetsAdd → SharedSpaceFaceMatch.
    // (Face match is async; we don't wait for it here — we're testing the sync path.)
    const addResults: BulkIdResponseDto[] = await addAssetsToAlbum(
      { id: syncAlbum.id, bulkIdsDto: { ids: [asset.id] } },
      { headers: asBearerAuth(syncOwner.accessToken) },
    );
    expect(addResults.some(({ success }) => success)).toBe(true);

    // Verify the person still exists before removal.
    const peopleBefore = await getSpacePeople({ id: syncSpace.id }, { headers: asBearerAuth(syncOwner.accessToken) });
    const personBefore = peopleBefore.find((p) => p.id === spacePersonId);
    expect(personBefore).toBeDefined();

    // Remove the asset from the album — this triggers AlbumAssetsRemove → cleanup.
    // Since the asset has no other path (not in another linked album, not directly added),
    // the onAlbumAssetsRemove handler should delete the face association.
    await removeAssetFromAlbum(
      { id: syncAlbum.id, bulkIdsDto: { ids: [asset.id] } },
      { headers: asBearerAuth(syncOwner.accessToken) },
    );

    // removeAssetFromAlbum awaits the AlbumAssetsRemove emit, whose @OnEvent handler runs
    // synchronously in-process: the asset has no other path into the space, so its only face
    // link is dropped and the now-faceless space person is deleted before the response returns.
    const peopleAfter = await getSpacePeople({ id: syncSpace.id }, { headers: asBearerAuth(syncOwner.accessToken) });
    const personAfter = peopleAfter.find((p) => p.id === spacePersonId);
    expect(personAfter).toBeUndefined();
  });
});
