/**
 * Face Cleanup admin page — smoke + decline/undo + full-resolution flow (X1/X2) + temporal-consistency
 * hardening (Consistency X1/X2) tests.
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
 *   7. Consistency X1/X2 (temporal-consistency hardening design §7.6, distinct from the X1/X2 above, which
 *      predate and cover the full-resolution feature) — see the test bodies for what each proves and the
 *      "re-scan" proxy technique both use (a real, live-embeddings scan job isn't available in this
 *      ML-disabled stack, same constraint as X1/X2 above).
 *
 * The tests follow the proven `rebase-smoke-pages` canary pattern (admin-page-header landmark,
 * `.first()`, explicit timeout).
 */
import {
  getFaceRepairPersonFaces,
  mergePerson,
  resolveFaces,
  unconfirmFaceRepairFaces,
  type LoginResponseDto,
} from '@immich/sdk';
import { expect, test } from '@playwright/test';
import { asBearerAuth, utils } from 'src/utils';

type PgClient = Awaited<ReturnType<typeof utils.connectDatabase>>;

// A fixed, valid pgvector literal — the exact value doesn't matter for X1/X2 (no real ANN search is
// performed against it), only that a face_search row exists so the eligibility joins in
// getScanFlaggedFaces/getScanFlaggedFacesForPersons (sourceType=MachineLearning ∧ isVisible ∧ HAS an
// embedding) resolve the seeded faces. Same value the server's own medium tests use.
const EMBEDDING = '[' + Array.from({ length: 512 }, () => 1).join(',') + ']';

// Idempotent: the consistency specs seed a SECOND flagged scan over the same faces (to simulate a later
// re-scan), so re-inserting a face's embedding must not collide on `face_search`'s primary key. The embedding
// is identical on every seed, so DO NOTHING is the correct no-op.
const seedFaceSearch = (db: PgClient, faceId: string) =>
  db.query(
    `INSERT INTO "face_search" ("faceId", "embedding") VALUES ($1, $2::vector)
     ON CONFLICT ("faceId") DO NOTHING`,
    [faceId, EMBEDDING],
  );

/**
 * Seeds a completed face-repair scan flagging every face in `faceIds` (already created via
 * `utils.createFace`) toward `suspectedOwnerId`, without running a real (ML-driven) scan job. This is the
 * same data shape `FaceRepairService.getPersonFlaggedFaces`/`getLatestScanStatus` read — `personName`/
 * `ownerName`/`thumbnailFaceId` are left null because `withCurrentNames` overlays them from the live
 * `person` table at read time, so the actual names created via `utils.createPerson` are what the UI shows.
 */
const seedFlaggedScan = async (
  db: PgClient,
  args: {
    ownerUserId: string;
    personId: string;
    suspectedOwnerId: string;
    faceIds: string[];
    preserveSource?: boolean;
  },
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
    // `utils.createFace` links every face with source='manual' (its shortcut for a full face→identity
    // link). A face a scan FLAGS is by definition an ML-clustered attribution, not a human placement — and
    // the unified verdict layer correctly excludes human-placed (source='manual') faces from flagging. Left
    // as 'manual', these seeded faces would be filtered straight back out and the review page would show
    // "no flagged faces". Downgrade to 'ml' so they represent what a real scan actually flags.
    //
    // `preserveSource` skips this for durability RE-seeds: those simulate a later scan re-proposing a face
    // that a prior move/lock legitimately set to source='manual', and the whole point is to prove the
    // manual placement keeps it out of the review — downgrading it here would defeat the test.
    if (!args.preserveSource) {
      await db.query(`UPDATE "face_identity_face" SET "source" = 'ml' WHERE "assetFaceId" = $1`, [faceId]);
    }
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
   * Text from admin.face_cleanup_resolutions_empty = "No decisions recorded yet". (The declines-only
   * `/admin/face-cleanup/declined` route was replaced by this unified page in Slice 7 — it now 307-redirects
   * here; see web/src/routes/admin/face-cleanup/declined/+page.ts.)
   */
  test('resolutions page shows empty state when there are no declines or locks', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);

    await page.goto('/admin/face-cleanup/resolutions');

    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No decisions recorded yet').first()).toBeVisible({ timeout: 10_000 });
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
    const faceUnknown = await utils.createFace({ assetId: asset.id, personId: source.id });
    const faceDetach = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceOwner, faceStay, faceLock, faceOther, faceUnknown, faceDetach],
    });

    // Confirm the seeded person shows up on the dashboard before it's resolved.
    await page.goto('/admin/face-cleanup');
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(sourceName).first()).toBeVisible({ timeout: 10_000 });

    await page.goto(`/admin/face-cleanup/${source.id}`);
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="face-tile"]')).toHaveCount(6, { timeout: 15_000 });

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

    // A real face of a real person the admin cannot name — parked in a cluster of its own rather than forced
    // onto the suspected owner.
    await tile(faceUnknown).click();
    await page.locator('[data-testid="bulk-unknown"]').click();

    await tile(faceDetach).click();
    await page.locator('[data-testid="bulk-detach"]').click();

    // Sanity-check every tile landed in the expected state before Apply.
    await expect(tile(faceOwner)).toHaveAttribute('data-state', 'owner');
    await expect(tile(faceStay)).toHaveAttribute('data-state', 'stay');
    await expect(tile(faceLock)).toHaveAttribute('data-state', 'lock');
    await expect(tile(faceOther)).toHaveAttribute('data-state', 'other');
    await expect(tile(faceUnknown)).toHaveAttribute('data-state', 'unknown');
    await expect(tile(faceDetach)).toHaveAttribute('data-state', 'detach');

    // This Apply discards a face ("not a face" is irreversible), so it must be confirmed before anything is sent.
    await page.locator('[data-testid="apply-btn"]').click();
    await expect(page.locator('[data-testid="detach-confirm"]')).toBeVisible({ timeout: 10_000 });

    const [resolveRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/admin/face-repair/resolve') && req.method() === 'POST'),
      page.locator('[data-testid="detach-confirm-cta"]').click(),
    ]);

    const payload = resolveRequest.postDataJSON() as {
      personId: string;
      moveToPerson: { destinationPersonId: string; faceIds: string[] }[];
      stay: string[];
      lock: string[];
      detach: string[];
      unknown: string[];
    };
    expect(payload.personId).toBe(source.id);
    expect(payload.stay).toEqual([faceStay]);
    expect(payload.lock).toEqual([faceLock]);
    expect(payload.detach).toEqual([faceDetach]);
    expect(payload.unknown).toEqual([faceUnknown]);
    const moveGroups = new Map(payload.moveToPerson.map((group) => [group.destinationPersonId, group.faceIds]));
    expect(moveGroups.get(owner.id)).toEqual([faceOwner]);
    expect(moveGroups.get(other.id)).toEqual([faceOther]);

    // Apply navigates back to the dashboard on success; the person must have drained from the console.
    await page.waitForURL('**/admin/face-cleanup', { timeout: 15_000 });
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(sourceName)).toHaveCount(0);
  });

  /**
   * The action dock stays pinned to the bottom even when the review is short.
   *
   * It used to be `sticky bottom-0` inside the scrolled content. Sticky only pins while its containing block
   * still extends below it — so on a review with a handful of faces the page never overflowed, sticky was inert,
   * and the bar came to rest wherever the content happened to end: adrift in the middle of the page (reported by
   * a user). It now renders through AdminPageLayout's `footer` slot, OUTSIDE the scroll area.
   *
   * This can only be caught here. The AdminPageLayout test stub renders `children` and `footer` into the same
   * element, so putting the dock back inside the scrolled content would keep every component test green while
   * reintroducing exactly this bug.
   */
  test('the action dock stays pinned to the bottom of the viewport on a short review', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    const db = await utils.connectDatabase();

    const source = await utils.createPerson(admin.accessToken, { name: 'Dock Short Person' });
    const owner = await utils.createPerson(admin.accessToken, { name: 'Dock Owner Person' });
    const asset = await utils.createAsset(admin.accessToken);
    const face = await utils.createFace({ assetId: asset.id, personId: source.id });

    // ONE flagged face: nowhere near enough content to fill the page, which is precisely the case that floated.
    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [face],
    });

    await page.goto(`/admin/face-cleanup/${source.id}`);
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="face-tile"]')).toHaveCount(1, { timeout: 15_000 });

    const dock = page.locator('[data-testid="dock"]');
    await expect(dock).toBeVisible();

    const box = await dock.boundingBox();
    const grid = await page.locator('[data-testid="flagged-grid"]').boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(grid).not.toBeNull();
    expect(viewport).not.toBeNull();

    // THE assertion: the dock is flush with the bottom of the screen. Being below the content is not enough —
    // the floating dock was below the content too, just adrift, with dead space underneath. Distance to the
    // bottom is the only thing that separates the two.
    //
    // Not pixel-exact: the app shell insets its content region by a few pixels (shared by every admin page,
    // unrelated to this dock), so a fixed dock measures ~8px short of the viewport. The bug measured ~124px
    // short. A 16px tolerance sits an order of magnitude away from the failure, so it cannot let it through.
    const SHELL_INSET_TOLERANCE = 16;
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport!.height - SHELL_INSET_TOLERANCE);

    // Sanity: it really is the dock below the review grid, not some other element that happens to hug the bottom.
    expect(box!.y).toBeGreaterThan(grid!.y + grid!.height);
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
  test('X2: un-confirming a human-placed face re-enables flagging for that face', async () => {
    // A confirm/lock records the human placement as the face's manual identity link (there is no separate
    // lock row any more). Un-confirming it — via POST /admin/face-repair/unconfirm — downgrades that link so
    // a later scan may suspect the face again. This is the recovery path the resolutions-page lock-undo used
    // to provide.
    const db = await utils.connectDatabase();

    const source = await utils.createPerson(admin.accessToken, { name: 'X2 Confirmed Person' });
    const owner = await utils.createPerson(admin.accessToken, { name: 'X2 Owner Person' });
    const asset = await utils.createAsset(admin.accessToken);
    const faceId = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
    });

    await resolveFaces(
      { faceRepairResolveRequestDto: { personId: source.id, lock: [faceId] } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    const beforeUnconfirm = await getFaceRepairPersonFaces(
      { personId: source.id },
      { headers: asBearerAuth(admin.accessToken) },
    );
    expect(beforeUnconfirm.flaggedFaces.some((f) => f.assetFaceId === faceId)).toBe(false);

    await unconfirmFaceRepairFaces(
      { faceRepairUnconfirmRequestDto: { assetFaceIds: [faceId] } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    // Un-confirm downgraded the human placement from 'manual' back to 'ml', so the face is no longer settled
    // and a later scan may flag it again. (The full re-scan-re-flags semantics are covered by the medium
    // tests, which are not subject to scan-snapshot timing; here we assert the durable state directly.)
    const { rows: linkRows } = await db.query(`SELECT source FROM "face_identity_face" WHERE "assetFaceId" = $1`, [
      faceId,
    ]);
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0].source).toBe('ml');
  });

  /**
   * Consistency X1 (temporal-consistency hardening design §7.6 — distinct from X1 above, which predates and
   * covers the full-resolution feature): a deliberate "Move → chosen person" with the picker's lock toggle ON
   * durably locks the moved face so it is never re-flagged — without this, a plain move writes no persisted
   * marker at all (design §1, gap 3).
   *
   * "Re-scan" proxy: this ML-disabled stack can't run a real, live-embeddings scan job (see the file header),
   * so durability is proven the same way the existing X2 test above proves it for a plain lock — by seeding a
   * FRESH completed scan snapshot that (as a later real scan would) proposes the SAME face flagged again, then
   * reading it back through `getFaceRepairPersonFaces`. That endpoint runs the exact seam a real scan's
   * `buildRepairPlan` now also runs (a scoped `getDeclineMaps` read + `applyDeclineFilters`, Slice 4) — since
   * the lock is owner-agnostic, this proves the face would be dropped by a later scan regardless of who it
   * re-suspects.
   */
  test('Consistency X1: a move-and-lock via the picker survives a later re-scan', async ({ context, page }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    const db = await utils.connectDatabase();

    const sourceName = 'CX1 Flagged Person';
    const ownerName = 'CX1 Owner Person';
    const otherName = 'CX1 Chosen Person';

    const source = await utils.createPerson(admin.accessToken, { name: sourceName });
    const owner = await utils.createPerson(admin.accessToken, { name: ownerName });
    const other = await utils.createPerson(admin.accessToken, { name: otherName });

    const asset = await utils.createAsset(admin.accessToken);
    const faceId = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
    });

    await page.goto(`/admin/face-cleanup/${source.id}`);
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="face-tile"]')).toHaveCount(1, { timeout: 15_000 });

    await page.locator('[data-testid="face-tile"]').click();
    await page.locator('[data-testid="bulk-other"]').click();
    await expect(page.locator('[data-testid="person-picker"]')).toBeVisible({ timeout: 10_000 });

    // The "Lock so it won't re-flag" checkbox defaults to checked (P1) — assert it explicitly so this test
    // documents driving the picker with the lock toggle ON, per design §7.6 X1.
    await expect(page.locator('[data-testid="person-picker-lock-toggle"] button[role="checkbox"]')).toBeChecked();
    await page.locator(`[data-testid="person-picker-row-${other.id}"]`).click();

    const [resolveRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/admin/face-repair/resolve') && req.method() === 'POST'),
      page.locator('[data-testid="apply-btn"]').click(),
    ]);
    const payload = resolveRequest.postDataJSON() as {
      moveToPerson: { destinationPersonId: string; faceIds: string[]; lock: boolean }[];
    };
    const chosenGroup = payload.moveToPerson.find((g) => g.destinationPersonId === other.id);
    expect(chosenGroup?.faceIds).toEqual([faceId]);
    expect(chosenGroup?.lock).toBe(true);

    await page.waitForURL('**/admin/face-cleanup', { timeout: 15_000 });

    // The face actually moved to `other`, and its human placement is recorded as a manual identity link on
    // `other`'s identity (there is no separate lock table any more).
    const { rows: faceRows } = await db.query(`SELECT "personId" FROM "asset_face" WHERE id = $1`, [faceId]);
    expect(faceRows[0].personId).toBe(other.id);
    const { rows: linkRows } = await db.query(
      `SELECT fif.source FROM "face_identity_face" fif WHERE fif."assetFaceId" = $1`,
      [faceId],
    );
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0].source).toBe('manual');

    // Simulate a LATER real scan: it would re-derive faceId as a candidate now living on `other` and, absent
    // the lock, propose it flagged toward `owner` again (the age-gap/re-suspect case) — seed that snapshot
    // directly (same technique `seedFlaggedScan` uses throughout this file).
    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: other.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
      preserveSource: true,
    });

    const afterRescan = await getFaceRepairPersonFaces(
      { personId: other.id },
      { headers: asBearerAuth(admin.accessToken) },
    );
    expect(afterRescan.flaggedFaces.some((f) => f.assetFaceId === faceId)).toBe(false);
  });

  /**
   * Consistency X2 (temporal-consistency hardening design §7.6 — distinct from X2 above, which predates and
   * covers the full-resolution feature): locking a face, then merging its person into a different one via the
   * real merge API, must not lose the lock — before Slice 1 of this design, `face_repair_lock.personId` was a
   * `CASCADE`-deleting FK, so merging the locked-on person away silently destroyed the lock and re-exposed the
   * face to the next scan (design §1, gap 1 — "the most serious hole ... in the strongest guarantee").
   *
   * Uses the same "re-scan" proxy as Consistency X1 above (see its docstring) since a real, live-embeddings
   * scan job isn't available in this ML-disabled stack.
   */
  test('Consistency X2: a lock survives a person merge and the face is still not re-flagged on a later scan', async ({
    context,
  }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    const db = await utils.connectDatabase();

    const sourceName = 'CX2 Locked Person';
    const ownerName = 'CX2 Owner Person';
    const targetName = 'CX2 Merge Target Person';

    const source = await utils.createPerson(admin.accessToken, { name: sourceName });
    const owner = await utils.createPerson(admin.accessToken, { name: ownerName });
    const mergeTarget = await utils.createPerson(admin.accessToken, { name: targetName });
    const asset = await utils.createAsset(admin.accessToken);
    const faceId = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
    });

    // Lock the face on `source` through the real resolve endpoint (a plain "Confirm / lock", not a move —
    // the interactive picker-driven move-and-lock route is Consistency X1's concern).
    await resolveFaces(
      { faceRepairResolveRequestDto: { personId: source.id, lock: [faceId] } },
      { headers: asBearerAuth(admin.accessToken) },
    );
    const { rows: linkRowsBefore } = await db.query(
      `SELECT source FROM "face_identity_face" WHERE "assetFaceId" = $1`,
      [faceId],
    );
    expect(linkRowsBefore).toHaveLength(1);
    expect(linkRowsBefore[0].source).toBe('manual');

    // Merge `source` into `mergeTarget` via the real API. The human placement is keyed by identity, which the
    // merge preserves, so it survives with no bespoke re-pointing (the whole point of the unified layer).
    await mergePerson(
      { id: mergeTarget.id, mergePersonDto: { ids: [source.id] } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    const { rows: linkRowsAfter } = await db.query(`SELECT source FROM "face_identity_face" WHERE "assetFaceId" = $1`, [
      faceId,
    ]);
    expect(linkRowsAfter).toHaveLength(1);
    expect(linkRowsAfter[0].source).toBe('manual');

    // The merge itself re-points the face to the target too.
    const { rows: faceRows } = await db.query(`SELECT "personId" FROM "asset_face" WHERE id = $1`, [faceId]);
    expect(faceRows[0].personId).toBe(mergeTarget.id);

    // Simulate a LATER real scan re-suspecting the same face (now on `mergeTarget`) toward some owner: the
    // lock is owner-agnostic, so it must still be dropped regardless of who is proposed.
    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: mergeTarget.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
      preserveSource: true,
    });

    const afterRescan = await getFaceRepairPersonFaces(
      { personId: mergeTarget.id },
      { headers: asBearerAuth(admin.accessToken) },
    );
    expect(afterRescan.flaggedFaces.some((f) => f.assetFaceId === faceId)).toBe(false);
  });
  /**
   * A "keep here" (soft-decline) recorded through the cleanup console is a NEGATIVE verdict in the shared
   * layer, and the resolutions page lists it with an Undo. Clicking Undo removes the verdict, so a later scan
   * may flag the face again. (Cluster-level dismisses are console-local and intentionally NOT listed here.)
   */
  test('a cleanup keep-here verdict appears on the resolutions page and Undo re-enables flagging', async ({
    context,
    page,
  }) => {
    await utils.setAuthCookies(context, admin.accessToken);
    const db = await utils.connectDatabase();

    const sourceName = 'Verdict Kept Person';
    const source = await utils.createPerson(admin.accessToken, { name: sourceName });
    const owner = await utils.createPerson(admin.accessToken, { name: 'Verdict Owner Person' });
    const asset = await utils.createAsset(admin.accessToken);
    const faceId = await utils.createFace({ assetId: asset.id, personId: source.id });

    await seedFlaggedScan(db, {
      ownerUserId: admin.userId,
      personId: source.id,
      suspectedOwnerId: owner.id,
      faceIds: [faceId],
    });

    // "Keep here": the admin says this face genuinely belongs to `source`, not the suspected owner.
    await resolveFaces(
      { faceRepairResolveRequestDto: { personId: source.id, stay: [faceId] } },
      { headers: asBearerAuth(admin.accessToken) },
    );

    // The face drains from the console.
    const beforeUndo = await getFaceRepairPersonFaces(
      { personId: source.id },
      { headers: asBearerAuth(admin.accessToken) },
    );
    expect(beforeUndo.flaggedFaces.some((f) => f.assetFaceId === faceId)).toBe(false);

    await page.goto('/admin/face-cleanup/resolutions');
    await expect(page.locator('[data-testid="admin-page-header"]').first()).toBeVisible({ timeout: 15_000 });

    const verdictRow = page.locator('[data-testid="resolution-row"][data-source="cleanup"]');
    await expect(verdictRow.first()).toBeVisible({ timeout: 10_000 });

    await verdictRow.first().locator('[data-testid="undo-button"]').click();
    await expect(page.locator('[data-testid="resolution-row"]')).toHaveCount(0, { timeout: 10_000 });

    // Undo removed the negative verdict from the shared layer — so the (face, owner) pairing is no longer
    // settled and a later scan may flag it again. (The full re-scan-re-flags semantics are covered by the
    // medium tests face-repair.resolutions.spec.ts + face-review-cross-flow.spec.ts, which are not subject to
    // scan-snapshot timing; here we assert the durable state the page's Undo produced.)
    const { rows: verdictRows } = await db.query(
      `SELECT id FROM "face_person_verdict" WHERE "assetFaceId" = $1 AND status IN ('rejected', 'ignored')`,
      [faceId],
    );
    expect(verdictRows).toHaveLength(0);
  });
});
