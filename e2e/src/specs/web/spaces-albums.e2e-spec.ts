import {
  AlbumResponseDto,
  AlbumUserRole,
  LoginResponseDto,
  SharedSpaceResponseDto,
  SharedSpaceRole,
} from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { createUserDto } from 'src/fixtures';
import { utils } from 'src/utils';

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
