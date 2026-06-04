/**
 * Face Cleanup admin page — smoke test.
 *
 * Scope: reduced fallback per the Slice-7 plan.
 * The full flagged-person flow requires ML embeddings, which are unavailable in the
 * e2e stack (ML-disabled). The scan + empty-completed-state path additionally relies
 * on BullMQ job processing completing within the test window, which is flaky in CI.
 * Full behaviour is covered by the Slice-5/6 component tests and Slice-3/4 medium tests.
 *
 * This smoke verifies:
 *   1. An admin can reach /admin/face-cleanup.
 *   2. The page heading renders ("Face cleanup").
 *   3. The no-scan empty state shows ("Run a scan to begin").
 *   4. The Re-scan button is present and enabled.
 */
import { type LoginResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { utils } from 'src/utils';

test.describe('Face Cleanup', () => {
  let admin: LoginResponseDto;

  test.beforeAll(async () => {
    utils.initSdk();
    await utils.resetDatabase();
    admin = await utils.adminSetup();
  });

  test('admin can reach the face-cleanup page and sees the no-scan empty state', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    await page.goto('/admin/face-cleanup');

    // The admin-page-header landmark must appear (AdminPageLayout → BreadcrumbActionPage)
    await expect(page.locator('[data-testid="admin-page-header"]')).toBeVisible();

    // Page heading
    await expect(page.getByRole('heading', { name: 'Face cleanup', level: 1 })).toBeVisible();

    // No-scan empty state (shown when getLatestScan returns 404 / null)
    await expect(page.getByText('Run a scan to begin')).toBeVisible();

    // Re-scan button must be present and enabled (not disabled while no scan is running)
    const rescanButton = page.getByRole('button', { name: 'Re-scan' });
    await expect(rescanButton).toBeVisible();
    await expect(rescanButton).toBeEnabled();
  });
});
