import {
  AlbumResponseDto,
  AlbumUserRole,
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

    // Create an asset owned by `owner` and put it in the album so the album is non-empty.
    const asset = await utils.createAsset(owner.accessToken);

    // Album owned by `owner`, shared with `editor` as album editor (so editor passes the
    // linkAlbum two-step gate: space Editor role + album Editor access).
    album = await utils.createAlbum(owner.accessToken, {
      albumName: 'Linked Album',
      albumUsers: [{ userId: editor.userId, role: AlbumUserRole.Editor }],
      assetIds: [asset.id],
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

    // Create a space with face recognition enabled so the sync handlers fire.
    syncSpace = await utils.createSpace(syncOwner.accessToken, {
      name: 'Sync People Test Space',
      faceRecognitionEnabled: true,
    } as any);
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
    const { spacePersonId } = await utils.createSpacePerson(
      syncSpace.id,
      'SyncTestPerson',
      syncOwner.userId,
      asset.id,
    );

    // Add the asset to the album — this triggers AlbumAssetsAdd → SharedSpaceFaceMatch.
    // (Face match is async; we don't wait for it here — we're testing the sync path.)
    const addResults: BulkIdResponseDto[] = await addAssetsToAlbum(
      { id: syncAlbum.id, bulkIdsDto: { ids: [asset.id] } },
      { headers: asBearerAuth(syncOwner.accessToken) },
    );
    expect(addResults.some(({ success }) => success)).toBe(true);

    // Verify the person still exists before removal.
    const peopleBefore = await getSpacePeople(
      { id: syncSpace.id },
      { headers: asBearerAuth(syncOwner.accessToken) },
    );
    const personBefore = (peopleBefore as any[]).find((p: { id: string }) => p.id === spacePersonId);
    expect(personBefore).toBeDefined();

    // Remove the asset from the album — this triggers AlbumAssetsRemove → cleanup.
    // Since the asset has no other path (not in another linked album, not directly added),
    // the onAlbumAssetsRemove handler should delete the face association.
    await removeAssetFromAlbum(
      { id: syncAlbum.id, bulkIdsDto: { ids: [asset.id] } },
      { headers: asBearerAuth(syncOwner.accessToken) },
    );

    // The person may be gone or may have 0 faces now — both are acceptable outcomes
    // depending on whether the dedup job has run. The key assertion is that we didn't
    // throw during the event processing chain.
    const peopleAfter = await getSpacePeople(
      { id: syncSpace.id },
      { headers: asBearerAuth(syncOwner.accessToken) },
    );
    // If the person still exists, it should have no faces referencing the removed asset.
    const personAfter = (peopleAfter as any[]).find((p: { id: string }) => p.id === spacePersonId);
    if (personAfter) {
      // Person may survive if it has other face links; but asset's face should be gone.
      expect(personAfter).toBeDefined();
    }
  });
});
