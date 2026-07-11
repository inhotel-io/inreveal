import { Kysely } from 'kysely';
import { SourceType } from 'src/enum';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { FaceRepairDeclineRepository } from 'src/repositories/face-repair-decline.repository';
import { FaceRepairLockRepository } from 'src/repositories/face-repair-lock.repository';
import { FaceRepairScanRepository } from 'src/repositories/face-repair-scan.repository';
import { FaceRepairRepository } from 'src/repositories/face-repair.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DB } from 'src/schema';
import { FaceRepairService } from 'src/services/face-repair.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

let db: Kysely<DB>;

const setup = () => {
  const { ctx, sut } = newMediumService(FaceRepairService, {
    database: db,
    real: [
      FaceRepairRepository,
      FaceRepairScanRepository,
      FaceRepairDeclineRepository,
      FaceRepairLockRepository,
      FaceIdentityRepository,
      SearchRepository,
      PersonRepository,
      ConfigRepository,
      DatabaseRepository,
      SystemMetadataRepository,
    ],
    mock: [LoggingRepository, JobRepository],
  });
  const jobMock = ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobMock.isActive.mockResolvedValue(false);
  jobMock.queueAll.mockResolvedValue();
  return {
    sut,
    ctx,
    jobMock,
    declineRepo: ctx.get(FaceRepairDeclineRepository),
    lockRepo: ctx.get(FaceRepairLockRepository),
  };
};

type Ctx = ReturnType<typeof setup>['ctx'];

const seedFace = async (ctx: Ctx, ownerId: string, personId: string): Promise<string> => {
  const { asset } = await ctx.newAsset({ ownerId });
  const { assetFace } = await ctx.newAssetFace({
    assetId: asset.id,
    personId,
    sourceType: SourceType.MachineLearning,
  });
  return assetFace.id;
};

// face_repair_decline.id / face_repair_lock.id are UUID v7 (@PrimaryGeneratedUuidV7Column) — the version
// nibble is '7'. Sanity-checked directly so a regression to v4 ids would be caught here too.
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeAll(async () => {
  db = await getKyselyDB();
});

afterEach(async () => {
  await db.deleteFrom('face_repair_scan').execute();
  // Unlike face_repair_scan, listResolutions()/removeResolutions() are unscoped by design (the manage page
  // lists every outstanding decline/lock) — so leftover rows from an earlier test in this file would otherwise
  // leak into a later test's assertions. Reset between tests for isolation.
  await db.deleteFrom('face_repair_decline').execute();
  await db.deleteFrom('face_repair_lock').execute();
});

// ── M16: unified resolutions manage page (list + remove, declines AND locks) ──────────────────────

describe('FaceRepairService.listResolutions (M16)', () => {
  it('returns BOTH decline and lock rows, each tagged by kind, with face/person thumbnail data', async () => {
    const { sut, ctx, declineRepo, lockRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: 'Alice' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: 'Jane' });
    const fDecline = await seedFace(ctx, user.id, source.id);
    const fLock = await seedFace(ctx, user.id, source.id);

    await declineRepo.createDeclines({
      faces: [{ assetFaceId: fDecline, suspectedOwnerId: ownerA.id }],
      declinedBy: user.id,
    });
    await lockRepo.insertLocks([fLock], source.id, user.id);

    const { resolutions } = await sut.listResolutions();
    expect(resolutions).toHaveLength(2);

    const declineRow = resolutions.find((r) => r.kind === 'decline');
    expect(declineRow).toBeDefined();
    expect(declineRow!.id).toMatch(UUID_V7_RE);
    expect(declineRow).toMatchObject({
      kind: 'decline',
      assetFaceId: fDecline,
      suspectedOwnerId: ownerA.id,
      suspectedOwnerName: 'Alice',
    });
    expect(declineRow!.createdAt).toBeTruthy();

    const lockRow = resolutions.find((r) => r.kind === 'lock');
    expect(lockRow).toBeDefined();
    expect(lockRow!.id).toMatch(UUID_V7_RE);
    expect(lockRow).toMatchObject({
      kind: 'lock',
      assetFaceId: fLock,
      personId: source.id,
      personName: 'Jane',
    });
    expect(lockRow!.createdAt).toBeTruthy();
  });

  it('returns an empty list when there are no declines or locks', async () => {
    const { sut } = setup();
    const { resolutions } = await sut.listResolutions();
    expect(resolutions).toEqual([]);
  });
});

describe('FaceRepairService.removeResolutions (M16)', () => {
  it('removes a decline row by its uuid-v7 row id (declineIds)', async () => {
    const { sut, ctx, declineRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    await declineRepo.createDeclines({
      faces: [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }],
      declinedBy: user.id,
    });

    const [row] = await declineRepo.listDeclines();
    expect(row.id).toMatch(UUID_V7_RE);

    const result = await sut.removeResolutions({ declineIds: [row.id] });
    expect(result).toEqual({ removed: 1 });
    expect(await declineRepo.listDeclines()).toHaveLength(0);
  });

  it('removes a decline row by its natural key (faces: assetFaceId + suspectedOwnerId)', async () => {
    const { sut, ctx, declineRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    await declineRepo.createDeclines({
      faces: [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }],
      declinedBy: user.id,
    });

    const result = await sut.removeResolutions({ faces: [{ assetFaceId: f1, suspectedOwnerId: ownerA.id }] });
    expect(result).toEqual({ removed: 1 });
    expect(await declineRepo.listDeclines()).toHaveLength(0);
  });

  it('removes a lock row by its uuid-v7 row id (lockIds), and undo re-enables flagging', async () => {
    const { sut, ctx, lockRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const f1 = await seedFace(ctx, user.id, source.id);
    await lockRepo.insertLocks([f1], source.id, user.id);

    const [row] = await lockRepo.listLocks();
    expect(row.id).toMatch(UUID_V7_RE);
    const lockedBefore = await lockRepo.getLockedFaceIds();
    expect(lockedBefore.has(f1)).toBe(true);

    const result = await sut.removeResolutions({ lockIds: [row.id] });
    expect(result).toEqual({ removed: 1 });
    expect(await lockRepo.listLocks()).toHaveLength(0);

    // Undo re-enables flagging: the face is no longer in the locked set a re-scan's applyDeclineFilters
    // seam would consult (getDeclineMaps -> lockedFaceIds), so it can be suspected again.
    const lockedAfter = await lockRepo.getLockedFaceIds();
    expect(lockedAfter.has(f1)).toBe(false);
  });

  it('removes both a decline and a lock in the same call and sums the counts', async () => {
    const { sut, ctx, declineRepo, lockRepo } = setup();
    const { user } = await ctx.newUser();
    const { person: ownerA } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const { person: source } = await ctx.newPerson({ ownerId: user.id, name: '' });
    const fDecline = await seedFace(ctx, user.id, source.id);
    const fLock = await seedFace(ctx, user.id, source.id);
    await declineRepo.createDeclines({
      faces: [{ assetFaceId: fDecline, suspectedOwnerId: ownerA.id }],
      declinedBy: user.id,
    });
    await lockRepo.insertLocks([fLock], source.id, user.id);

    const [declineRow] = await declineRepo.listDeclines();
    const [lockRow] = await lockRepo.listLocks();

    const result = await sut.removeResolutions({ declineIds: [declineRow.id], lockIds: [lockRow.id] });
    expect(result).toEqual({ removed: 2 });
    expect(await declineRepo.listDeclines()).toHaveLength(0);
    expect(await lockRepo.listLocks()).toHaveLength(0);
  });

  it('is a no-op (removed: 0) when called with nothing to remove', async () => {
    const { sut } = setup();
    const result = await sut.removeResolutions({});
    expect(result).toEqual({ removed: 0 });
  });
});
