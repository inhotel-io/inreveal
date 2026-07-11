/**
 * Face Cleanup admin page — smoke + decline/undo + full-resolution flow (X1/X2) tests.
 *
 * Scope: the dashboard/empty-state/decline smoke tests below are a reduced fallback — a real face-repair
 * SCAN JOB requires live CLIP embeddings, which are unavailable in this ML-disabled e2e stack
 * (IMMICH_MACHINE_LEARNING_ENABLED=false, e2e/docker-compose.yml). X1/X2 instead seed a completed scan
 * directly (face_search dummy embedding + face_repair_scan + face_repair_scan_flagged_face rows), mirroring
 * exactly how the server's own medium/testcontainer tests do it
 * (server/test/medium/specs/services/face-repair.resolve.spec.ts) — the ML dependency lives in *producing*
 * suggested embeddings, not in resolving already-flagged faces, so this is a faithful (not synthetic) test
 * of the review → resolve → drain flow.
 *
 * What this file covers:
 *   1. Dashboard page renders and Re-scan button is present.
 *   2. Review page (/admin/face-cleanup/[personId]) renders for a valid person; empty state is
 *      shown since there are no flagged faces (no scan has run yet).
 *   3. Resolutions page (/admin/face-cleanup/resolutions) renders the empty state.
 *   4. A person-level dismiss seeded directly via the API renders a row (with an Undo button) on the
 *      resolutions page. The interactive Undo click is covered by the medium tests, not here.
 *   5. X1 — seeding a flagged cluster and driving the review page: select → route one face into each of the
 *      five terminal states via the bulk bar → Apply → assert the resolve payload and that the person drains
 *      from the console.
 *   6. X2 — Resolutions page: undoing a lock re-enables flagging (re-checked against the same persisted scan
 *      snapshot, which is the same mechanism a subsequent scan run applies — see the test body for the exact
 *      scope this covers vs. the medium/component tests).
 *
 * The tests follow the proven `rebase-smoke-pages` canary pattern (admin-page-header landmark,
 * `.first()`, explicit timeout).
 */
import { declineFaceRepair, getFaceRepairPersonFaces, resolveFaces, type LoginResponseDto } from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { asBearerAuth, utils } from 'src/utils';

type PgClient = Awaited<ReturnType<typeof utils.connectDatabase>>;

// A fixed, valid pgvector literal — the exact value doesn't matter for X1/X2 (no real ANN search is
// performed against it), only that a face_search row exists so the eligibility joins in
// getScanFlaggedFaces/getScanFlaggedFacesForPersons (sourceType=MachineLearning ∧ isVisible ∧ HAS an
// embedding) resolve the seeded faces. Same value the server's own medium tests use.
const EMBEDDING = '[' + Array.from({ length: 512 }, () => 1).join(',') + ']';

const seedFaceSearch = (db: PgClient, faceId: string) =>
  db.query(`INSERT INTO "face_search" ("faceId", "embedding") VALUES ($1, $2::vector)`, [faceId, EMBEDDING]);

/**
 * Seeds a completed face-repair scan flagging every face in `faceIds` (already created via
 * `utils.createFace`) toward `suspectedOwnerId`, without running a real (ML-driven) scan job. This is the
 * same data shape `FaceRepairService.getPersonFlaggedFaces`/`getLatestScanStatus` read — `personName`/
 * `ownerName`/`thumbnailFaceId` are left null because `withCurrentNames` overlays them from the live
 * `person` table at read time, so the actual names created via `utils.createPerson` are what the UI shows.
 */
const seedFlaggedScan = async (
  db: PgClient,
  args: { ownerUserId: string; personId: string; suspectedOwnerId: string; faceIds: string[] },
): Promise<string> => {
  const totals = {
    eligibleFaces: args.faceIds.length,
    flaggedFaces: args.faceIds.length,
    toRepair: 0,
    reviewOnlyFaces: args.faceIds.length,
    reviewOnlyPersons: 1,
    affectedPersons: 1,
    reviewOnlyByReason: { overCap: 0, badTarget: 0, unAttributable: 0 },
  };
  const persons = [
    {
      personId: args.personId,
      ownerId: args.ownerUserId,
      personName: null,
      faceCount: args.faceIds.length,
      thumbnailFaceId: null,
      eligible: args.faceIds.length,
      flagged: args.faceIds.length,
      flaggedFraction: 1,
      suspectedOwners: [
        { ownerPersonId: args.suspectedOwnerId, ownerName: null, thumbnailFaceId: null, count: args.faceIds.length },
      ],
      recommendation: 'review-first',
      reviewReasons: [],
    },
  ];

  const { rows } = await db.query(
    `INSERT INTO "face_repair_scan" ("status", "requestedBy", "totals", "persons", "startedAt", "finishedAt")
     VALUES ('completed', $1, $2::jsonb, $3::jsonb, now(), now())
     RETURNING id`,
    [args.ownerUserId, JSON.stringify(totals), JSON.stringify(persons)],
  );
  const scanId = rows[0].id as string;

  for (const faceId of args.faceIds) {
    await seedFaceSearch(db, faceId);
    await db.query(
      `INSERT INTO "face_repair_scan_flagged_face" ("scanId", "assetFaceId", "personId", "suspectedOwnerId")
       VALUES ($1, $2, $3, $4)`,
      [scanId, faceId, args.personId, args.suspectedOwnerId],
    );
  }

  return scanId;
};

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

  /**
   * Decline flow — review page (reduced: empty-state only; `decline-btn` requires ML flagged faces).
   *
   * Navigating to `/admin/face-cleanup/{personId}` with a real person ID but no completed scan
   * renders the review page in its "no flagged faces" empty state.  This confirms the route
   * mounts without error.  The `decline-btn` data-testid (added in Slice 4) lives in the face
   * tiles grid which is only rendered when flagged faces exist; it cannot be exercised here.
   */
  test('review page renders for a valid person (no flagged faces — no scan has run yet)', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    // Create a person so the route has a valid UUID to load.
    const person = await utils.createPerson(admin.accessToken, { name: 'E2E Review Smoke' });

    await page.goto(`/admin/face-cleanup/${person.id}`);

    // The page must mount without error — admin-page-header landmark is present.
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });

    // With no scan there are no flagged faces → the empty-state section is shown.
    // Text from admin.face_cleanup_review_no_flagged = "No flagged faces".
    await expect(page.getByText('No flagged faces').first()).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Resolutions page — empty state.
   *
   * Before any decline/lock is recorded the page shows the top-level empty-state placeholder.
   * Text from admin.face_cleanup_resolutions_empty = "No declines or locks yet". (The declines-only
   * `/admin/face-cleanup/declined` route was replaced by this unified page in Slice 7 — it now 307-redirects
   * here; see web/src/routes/admin/face-cleanup/declined/+page.ts.)
   */
  test('resolutions page shows empty state when there are no declines or locks', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    await page.goto('/admin/face-cleanup/resolutions');

    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No declines or locks yet').first()).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Dismiss → Undo flow (person-level decline, seeded via the API).
   *
   * The dashboard `dismiss-btn` (data-testid added in Slice 4) is only rendered when a completed
   * scan has flagged person rows, which X1 below seeds directly. Here we instead seed the decline
   * directly via `declineFaceRepair` to exercise the same server path that the dismiss button calls, then
   * verify the row renders on the resolutions page.
   */
  test('person-level decline appears on the resolutions page', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    // Seed: create a real person so the FK constraint on face_repair_decline.personId is satisfied.
    const person = await utils.createPerson(admin.accessToken, { name: 'E2E Dismiss Target' });

    // Call the same API endpoint that the `dismiss-btn` triggers.
    await declineFaceRepair(
      {
        faceRepairDeclineRequestDto: {
          persons: [{ personId: person.id, suspectedOwnerIds: [] }],
        },
      },
      { headers: asBearerAuth(admin.accessToken) },
    );

    // Navigate to the resolutions list.
    await page.goto('/admin/face-cleanup/resolutions');
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });

    // The seeded person-level decline row renders with an "Undo" button
    // (text from admin.face_cleanup_resolutions_undo = "Undo").
    await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeVisible({ timeout: 10_000 });

    // NOTE: the interactive Undo click → empty-state flow is intentionally not asserted here — X2 below
    // exercises the interactive Undo click (on a lock row) end-to-end instead.
  });

  test('X1: routing every state via the bulk bar and applying drains the person from the console', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    const db = await utils.connectDatabase();

    const sourceName = 'X1 Flagged Person';
    const ownerName = 'X1 Owner Person';
    const otherName = 'X1 Other Person';

    const source = await utils.createPerson(admin.accessToken, { name: sourceName });
    const owner = await utils.createPerson(admin.accessToken, { name: ownerName });
    const other = await utils.createPerson(admin.accessToken, { name: otherName });

    const asset = await utils.createAsset(admin.accessToken);
    const faceOwner = await utils.createFace({ assetId: asset.id, personId: source.id });
    const faceStay = await utils.createFace({ assetId: asset.id, personId: source.id });
    const faceLock = await utils.createFace({ assetId: asset.id, personId: source.id });
    const faceOther = await utils.createFace({ assetId: asset.id, personId: source.id });
    const faceDetach = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceOwner, faceStay, faceLock, faceOther, faceDetach],
    });

    // Confirm the seeded person shows up on the dashboard before it's resolved.
    await page.goto('/admin/face-cleanup');
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(sourceName).first()).toBeVisible({ timeout: 10_000 });

    await page.goto(`/admin/face-cleanup/${source.id}`);
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="face-tile"]')).toHaveCount(5, { timeout: 15_000 });

    const tile = (faceId: string) => page.locator(`[data-testid="face-tile"][data-faceid="${faceId}"]`);

    // faceOwner is left untouched — it stays in the default `owner` state.

    await tile(faceStay).click();
    await page.locator('[data-testid="bulk-stay"]').click();

    await tile(faceLock).click();
    await page.locator('[data-testid="bulk-lock"]').click();

    await tile(faceOther).click();
    await page.locator('[data-testid="bulk-other"]').click();
    await expect(page.locator('[data-testid="person-picker"]')).toBeVisible({ timeout: 10_000 });
    await page.locator(`[data-testid="person-picker-row-${other.id}"]`).click();

    await tile(faceDetach).click();
    await page.locator('[data-testid="bulk-detach"]').click();

    // Sanity-check every tile landed in the expected state before Apply.
    await expect(tile(faceOwner)).toHaveAttribute('data-state', 'owner');
    await expect(tile(faceStay)).toHaveAttribute('data-state', 'stay');
    await expect(tile(faceLock)).toHaveAttribute('data-state', 'lock');
    await expect(tile(faceOther)).toHaveAttribute('data-state', 'other');
    await expect(tile(faceDetach)).toHaveAttribute('data-state', 'detach');

    const [resolveRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/admin/face-repair/resolve') && req.method() === 'POST'),
      page.locator('[data-testid="apply-btn"]').click(),
    ]);

    const payload = resolveRequest.postDataJSON() as {
      personId: string;
      moveToPerson: { destinationPersonId: string; faceIds: string[] }[];
      stay: string[];
      lock: string[];
      detach: string[];
    };
    expect(payload.personId).toBe(source.id);
    expect(payload.stay).toEqual([faceStay]);
    expect(payload.lock).toEqual([faceLock]);
    expect(payload.detach).toEqual([faceDetach]);
    const moveGroups = new Map(payload.moveToPerson.map((group) => [group.destinationPersonId, group.faceIds]));
    expect(moveGroups.get(owner.id)).toEqual([faceOwner]);
    expect(moveGroups.get(other.id)).toEqual([faceOther]);

    // Apply navigates back to the dashboard on success; the person must have drained from the console.
    await page.waitForURL('**/admin/face-cleanup', { timeout: 15_000 });
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(sourceName)).toHaveCount(0);
  });

  /**
   * X2 — Resolutions page: Undo removes the row and re-enables flagging.
   *
   * Scope note: this drives the interactive Undo click and verifies its server-side effect directly (rather
   * than by triggering a brand-new scan job, which needs live embeddings this ML-disabled e2e stack doesn't
   * have): after Undo, `getFaceRepairPersonFaces` — the SAME query the review page calls, re-evaluating the
   * live decline/lock state against the persisted scan snapshot — includes the face again. That re-evaluation
   * (`applyDeclineFilters` dropping locked/declined faces) is exactly the mechanism a subsequent scan's
   * persistence would also go through (see FaceRepairService.removeResolutions's comment: "Removing a lock
   * re-enables flagging: the face drops out of getLockedFaceIds() and the next scan can suspect it again").
   * The interactive select→lock→Apply route through the review page is covered by X1; medium tests M5/M16
   * cover the full re-scan-drops-a-locked-face semantics against a real second scan.
   */
  test('X2: undoing a lock on the resolutions page re-enables flagging for that face', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    const db = await utils.connectDatabase();

    const sourceName = 'X2 Locked Person';
    const ownerName = 'X2 Owner Person';

    const source = await utils.createPerson(admin.accessToken, { name: sourceName });
    const owner = await utils.createPerson(admin.accessToken, { name: ownerName });
    const asset = await utils.createAsset(admin.accessToken);
    const faceId = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
    });

    // Lock the face through the real resolve endpoint (the interactive review-page → lock route is X1's
    // concern; this test is scoped to the resolutions page's own list/undo behavior).
    await resolveFaces(
      { faceRepairResolveRequestDto: { personId: source.id, lock: [faceId] } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    const beforeUndo = await getFaceRepairPersonFaces(
      { personId: source.id },
      { headers: asBearerAuth(admin.accessToken) },
    );
    expect(beforeUndo.flaggedFaces.some((f) => f.assetFaceId === faceId)).toBe(false);

    await page.goto('/admin/face-cleanup/resolutions');
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });

    const lockRow = page.locator('[data-testid="resolution-row"][data-kind="lock"]', { hasText: sourceName });
    await expect(lockRow).toBeVisible({ timeout: 10_000 });

    await lockRow.locator('[data-testid="undo-button"]').click();
    await expect(lockRow).toHaveCount(0, { timeout: 10_000 });

    const afterUndo = await getFaceRepairPersonFaces(
      { personId: source.id },
      { headers: asBearerAuth(admin.accessToken) },
    );
    expect(afterUndo.flaggedFaces.some((f) => f.assetFaceId === faceId)).toBe(true);
  });
});
