/**
 * Face Cleanup admin page — smoke test.
 *
 * Scope: reduced fallback per the Slice-7 plan. The full flagged-person flow requires ML
 * embeddings, which are unavailable in the e2e stack (ML-disabled). Full behaviour is covered
 * by the Slice-5/6 component tests and the Slice-3/4 medium tests.
 *
 * This smoke mirrors the proven `rebase-smoke-pages` canary pattern (admin-page-header landmark,
 * `.first()`, explicit timeout) to verify the admin can reach the page and it renders without
 * error, plus the page-specific Re-scan control is present.
 */
import { type LoginResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { utils } from 'src/utils';

test.describe.serial('Face Cleanup', () => {
  let admin: LoginResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();
  });

  test('admin can reach the face-cleanup page and it renders', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    await page.goto('/admin/face-cleanup');

    // AdminPageLayout → BreadcrumbActionPage landmark — confirms the page mounted without error.
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });

    // Page-specific control: the Re-scan button (text from admin.face_cleanup_rescan = "Re-scan").
    await expect(page.getByRole('button', { name: 'Re-scan' }).first()).toBeVisible({ timeout: 15_000 });
  });
});
