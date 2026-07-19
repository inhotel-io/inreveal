import type { LoginResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { thumbnailUtils } from 'src/ui/specs/timeline/utils';
import { utils } from 'src/utils';

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
