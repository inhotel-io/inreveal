import { faker } from '@faker-js/faker';
import { expect, test } from '@playwright/test';

import {
  createDefaultTimelineConfig,
  generateTimelineData,
  type Changes,
  type TimelineData,
} from 'src/ui/generators/timeline';
import { setupBaseMockApiRoutes } from 'src/ui/mock-network/base-network';
import { setupTimelineMockApiRoutes, TimelineTestContext } from 'src/ui/mock-network/timeline-network';
import { utils } from 'src/utils';

test.describe('Timeline grouping UI', () => {
  let adminUserId: string;
  let timelineRestData: TimelineData;
  const testContext = new TimelineTestContext();
  const changes: Changes = {
    albumAdditions: [],
    assetDeletions: [],
    assetArchivals: [],
    assetFavorites: [],
  };

  test.beforeAll(() => {
    test.fail(
      process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS !== '1',
      'This test requires env var: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1',
    );
    utils.initSdk();
    adminUserId = faker.string.uuid();
    testContext.adminId = adminUserId;
    timelineRestData = generateTimelineData({ ...createDefaultTimelineConfig(), ownerId: adminUserId });
  });

  test.beforeEach(async ({ context }) => {
    await setupBaseMockApiRoutes(context, adminUserId);
    await setupTimelineMockApiRoutes(context, timelineRestData, changes, testContext);
  });

  test('drills from years to months to days and clears the temporal chip on Photos', async ({ page }) => {
    await page.goto('/photos');
    await expect(page.getByTestId('timeline-grouping-day')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('timeline-grouping-year').click();

    const firstYearCard = page.getByTestId('timeline-bucket-card').first();
    await expect(firstYearCard).toBeVisible();
    await firstYearCard.click();

    await expect(page.getByTestId('active-filters-bar')).toContainText(/\d{4}/);
    await expect(page.getByTestId('timeline-grouping-month')).toHaveAttribute('aria-pressed', 'true');

    const firstMonthCard = page.getByTestId('timeline-bucket-card').first();
    await expect(firstMonthCard).toBeVisible();
    await firstMonthCard.click();

    await expect(page.getByTestId('timeline-grouping-day')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-thumbnail-focus-container]').first()).toBeVisible();

    await page.getByTestId('chip-close').click();
    await expect(page.getByTestId('active-filters-bar')).not.toBeVisible();
  });

  test('shows the floating grouping control on mobile browse and hides it under the asset viewer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/photos');

    await expect(page.getByTestId('timeline-mobile-grouping-control-shell')).toBeVisible();
    await expect(page.getByTestId('timeline-grouping-day')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('[data-thumbnail-focus-container]').first().click();

    await expect(page.getByTestId('timeline-mobile-grouping-control-shell')).not.toBeVisible();
  });
});
