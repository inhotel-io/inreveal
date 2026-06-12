import { Kysely } from 'kysely';
import { AssetVisibility, JobName, JobStatus, TimeBucketSize } from 'src/enum';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { ConfigRepository } from 'src/repositories/config.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { FaceIdentityRepository } from 'src/repositories/face-identity.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { PartnerRepository } from 'src/repositories/partner.repository';
import { PersonRepository } from 'src/repositories/person.repository';
import { SearchRepository } from 'src/repositories/search.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { TimelineService } from 'src/services/timeline.service';
import { newMediumService } from 'test/medium.factory';
import { factory, newEmbedding } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';
import { Mocked } from 'vitest';

let defaultDatabase: Kysely<DB>;

const setup = () => {
  const result = newMediumService(SharedSpaceService, {
    database: defaultDatabase,
    real: [
      AccessRepository,
      AlbumRepository,
      AlbumUserRepository,
      AssetRepository,
      SharedSpaceRepository,
      UserRepository,
    ],
    mock: [EventRepository, LoggingRepository, JobRepository, StorageRepository],
  });
  result.ctx.getMock(JobRepository).queue.mockResolvedValue();
  return result;
};

/** Full setup with face-matching repos wired in (mirrors shared-space-face-identity-repair.spec.ts) */
const setupWithFaceMatch = () => {
  const result = newMediumService(SharedSpaceService, {
    database: defaultDatabase,
    real: [
      AccessRepository,
      AlbumRepository,
      AlbumUserRepository,
      AssetRepository,
      SharedSpaceRepository,
      UserRepository,
      FaceIdentityRepository,
      PersonRepository,
      ConfigRepository,
      SystemMetadataRepository,
      SearchRepository,
    ],
    mock: [EventRepository, LoggingRepository, JobRepository, StorageRepository],
  });
  const jobs = result.ctx.getMock<JobRepository, Mocked<JobRepository>>(JobRepository);
  jobs.queue.mockResolvedValue();
  jobs.queueAll.mockResolvedValue();
  jobs.hasInFlightDedupChain.mockResolvedValue(false);
  return { ...result, jobs, faceIdentityRepository: result.ctx.get(FaceIdentityRepository) };
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const authFromUser = (actor: { id: string; email: string }) =>
  factory.auth({ user: { id: actor.id, email: actor.email } });

describe('SharedSpaceService — getLinkedAlbums', () => {
  it('returns linked album DTO with correct assetCount for a member', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Linked Album' });

    // Add 3 assets to the album
    const { asset: a1 } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: a2 } = await ctx.newAsset({ ownerId: owner.id });
    const { asset: a3 } = await ctx.newAsset({ ownerId: owner.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: a1.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: a2.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: a3.id });

    // Link album to space
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

    const viewerAuth = authFromUser(viewer);
    const links = await sut.getLinkedAlbums(viewerAuth, space.id);

    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.albumId).toBe(album.id);
    expect(link.albumName).toBe('Linked Album');
    expect(link.showInTimeline).toBe(true);
    expect(link.assetCount).toBe(3);
    expect(link.addedById).toBe(owner.id);
    expect(typeof link.createdAt).toBe('string');
  });

  it('returns empty array when no albums are linked', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const ownerAuth = authFromUser(owner);
    const links = await sut.getLinkedAlbums(ownerAuth, space.id);

    expect(links).toHaveLength(0);
  });

  it('rejects non-member with ForbiddenException', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: nonMember } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });

    const nonMemberAuth = authFromUser(nonMember);
    await expect(sut.getLinkedAlbums(nonMemberAuth, space.id)).rejects.toThrow();
  });
});

describe('SharedSpaceService — unlinkAlbum face retention', () => {
  it('removes faces for album-only assets but retains faces for assets with another space path', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });

    const { result: album } = await ctx.newAlbum({ ownerId: user.id, albumName: 'FaceTestAlbum' });

    // a1: only reachable via album A — face should be REMOVED on unlink
    const { asset: a1 } = await ctx.newAsset({ ownerId: user.id });
    // a2: reachable via album A AND directly added to space — face should be RETAINED
    const { asset: a2 } = await ctx.newAsset({ ownerId: user.id });

    await ctx.newAlbumAsset({ albumId: album.id, assetId: a1.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: a2.id });

    // Link album to space
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: user.id });

    // Direct-add a2 to space
    await ctx.newSharedSpaceAsset({ spaceId: space.id, assetId: a2.id });

    // Create asset faces for a1 and a2
    const { result: face1Id } = await ctx.newAssetFace({ assetId: a1.id });
    const { result: face2Id } = await ctx.newAssetFace({ assetId: a2.id });

    // Create a space person and link both faces to it
    const spacePersonRepo = ctx.get(SharedSpaceRepository);
    const spacePerson = await spacePersonRepo.createPerson({
      spaceId: space.id,
      name: 'Test Person',
      type: 'person',
      representativeFaceId: null,
    });
    await spacePersonRepo.addPersonFaces([
      { personId: spacePerson.id, assetFaceId: face1Id },
      { personId: spacePerson.id, assetFaceId: face2Id },
    ]);

    // Verify both faces exist before unlinking
    const facesBefore = await defaultDatabase
      .selectFrom('shared_space_person_face')
      .select('assetFaceId')
      .where('personId', '=', spacePerson.id)
      .execute();
    expect(facesBefore.map((f) => f.assetFaceId)).toContain(face1Id);
    expect(facesBefore.map((f) => f.assetFaceId)).toContain(face2Id);

    // Unlink the album
    await sut.unlinkAlbum(authFromUser(user), space.id, album.id);

    // After unlink: face1 (album-only asset) should be gone, face2 (direct path) should remain
    const facesAfter = await defaultDatabase
      .selectFrom('shared_space_person_face')
      .select('assetFaceId')
      .where('personId', '=', spacePerson.id)
      .execute();
    expect(facesAfter.map((f) => f.assetFaceId)).not.toContain(face1Id);
    expect(facesAfter.map((f) => f.assetFaceId)).toContain(face2Id);
  });

  it('deletes space persons that have no remaining faces after unlink', async () => {
    const { ctx, sut } = setup();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });

    const { result: album } = await ctx.newAlbum({ ownerId: user.id, albumName: 'OrphanTestAlbum' });
    const { asset: a1 } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: a1.id });
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: user.id });

    const { result: faceId } = await ctx.newAssetFace({ assetId: a1.id });

    const spacePersonRepo = ctx.get(SharedSpaceRepository);
    const spacePerson = await spacePersonRepo.createPerson({
      spaceId: space.id,
      name: '',
      representativeFaceId: null,
    });
    await spacePersonRepo.addPersonFaces([{ personId: spacePerson.id, assetFaceId: faceId }]);

    // Unlink — a1 has no other path, so the space person should be deleted as orphaned
    await sut.unlinkAlbum(authFromUser(user), space.id, album.id);

    const remaining = await defaultDatabase
      .selectFrom('shared_space_person')
      .select('id')
      .where('id', '=', spacePerson.id)
      .execute();
    expect(remaining).toHaveLength(0);
  });
});

describe('SharedSpaceService — handleSharedSpaceAlbumFaceSync', () => {
  it('returns Skipped when face recognition is disabled', async () => {
    const { ctx, sut } = setupWithFaceMatch();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: false });

    const result = await sut.handleSharedSpaceAlbumFaceSync({ spaceId: space.id, albumId: 'any-album-id' });

    expect(result).toBe(JobStatus.Skipped);
  });

  it('returns Skipped when album not linked to space', async () => {
    const { ctx, sut } = setupWithFaceMatch();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
    const { result: album } = await ctx.newAlbum({ ownerId: user.id, albumName: 'Unlinked' });

    // Album is NOT linked to the space
    const result = await sut.handleSharedSpaceAlbumFaceSync({ spaceId: space.id, albumId: album.id });

    expect(result).toBe(JobStatus.Skipped);
  });

  it('matches album faces into space persons when recognition enabled', async () => {
    const { ctx, sut, faceIdentityRepository, jobs } = setupWithFaceMatch();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });

    const { result: album } = await ctx.newAlbum({ ownerId: user.id, albumName: 'FaceSyncAlbum' });

    // Create a person + identity for Layer 1 matching
    const { result: person } = await ctx.newPerson({ ownerId: user.id, name: 'AlbumPerson' });
    const identity = await faceIdentityRepository.ensurePersonIdentity(person.id);

    // Create asset, add to album, seed face + identity link
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    const { assetFace } = await ctx.newAssetFace({ assetId: asset.id, personId: person.id });
    await ctx.database.insertInto('face_search').values({ faceId: assetFace.id, embedding: newEmbedding() }).execute();
    await faceIdentityRepository.linkFace({
      assetFaceId: assetFace.id,
      identityId: identity.id,
      source: 'owner-person',
    });

    // Link album to space
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: user.id });

    const result = await sut.handleSharedSpaceAlbumFaceSync({ spaceId: space.id, albumId: album.id });

    expect(result).toBe(JobStatus.Success);

    const spacePersons = await defaultDatabase
      .selectFrom('shared_space_person')
      .select('id')
      .where('spaceId', '=', space.id)
      .execute();
    expect(spacePersons.length).toBeGreaterThan(0);

    expect(jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({ name: JobName.SharedSpaceIdentityReconciliation, data: { spaceId: space.id } }),
    );
    expect(jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({ name: JobName.SharedSpacePersonDedup, data: { spaceId: space.id } }),
    );
  });

  it('returns Success and queues dedup when album has assets but no matchable faces', async () => {
    const { ctx, sut, jobs } = setupWithFaceMatch();
    const { user } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: user.id, faceRecognitionEnabled: true });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: user.id, role: 'owner' });

    const { result: album } = await ctx.newAlbum({ ownerId: user.id, albumName: 'NoFaceAlbum' });
    // Asset with a raw face (no personId, no identity link) — not matchable
    const { asset } = await ctx.newAsset({ ownerId: user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });
    await ctx.newAssetFace({ assetId: asset.id }); // no personId

    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: user.id });

    const result = await sut.handleSharedSpaceAlbumFaceSync({ spaceId: space.id, albumId: album.id });

    expect(result).toBe(JobStatus.Success);
    expect(jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({ name: JobName.SharedSpacePersonDedup, data: { spaceId: space.id } }),
    );
  });
});

const setupTimeline = () =>
  newMediumService(TimelineService, {
    database: defaultDatabase,
    real: [AccessRepository, AssetRepository, PartnerRepository, SharedSpaceRepository],
    mock: [LoggingRepository],
  });

describe('SharedSpaceService — linked-album assets in space timeline', () => {
  it('includes album assets when showInTimeline is true, excludes them when false', async () => {
    const { sut, ctx } = setupTimeline();

    // Owner creates the space and album
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id, faceRecognitionEnabled: false });
    // Both owner and viewer are members with showInTimeline=true (default)
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    // Create album owned by owner, link it to the space (showInTimeline defaults true)
    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'SpaceAlbum' });
    const { asset: assetInA } = await ctx.newAsset({
      ownerId: owner.id,
      localDateTime: new Date('2024-03-15T12:00:00.000Z'),
      fileCreatedAt: new Date('2024-03-15T12:00:00.000Z'),
      visibility: AssetVisibility.Timeline,
    });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: assetInA.id });
    await ctx.newExif({ assetId: assetInA.id, make: 'Canon' });
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

    // Viewer reads the space timeline — asset should appear (showInTimeline=true)
    const viewerAuth = factory.auth({ user: { id: viewer.id, email: viewer.email } });
    const bucketsOn = await sut.getTimeBuckets(viewerAuth, {
      userId: viewer.id,
      withSharedSpaces: true,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const bucketOn = bucketsOn.find((b) => b.timeBucket === '2024-03-01');
    expect(bucketOn?.count).toBe(1);

    const bucketRawOn = await sut.getTimeBucket(viewerAuth, {
      timeBucket: '2024-03-01',
      userId: viewer.id,
      withSharedSpaces: true,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const idsOn: string[] = JSON.parse(bucketRawOn).id;
    expect(idsOn).toContain(assetInA.id);

    // Toggle showInTimeline off for the album
    await ctx.get(SharedSpaceRepository).setAlbumShowInTimeline(space.id, album.id, false);

    // Viewer reads again — asset should no longer appear
    const bucketsOff = await sut.getTimeBuckets(viewerAuth, {
      userId: viewer.id,
      withSharedSpaces: true,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const bucketOff = bucketsOff.find((b) => b.timeBucket === '2024-03-01');
    expect(bucketOff?.count ?? 0).toBe(0);

    const bucketRawOff = await sut.getTimeBucket(viewerAuth, {
      timeBucket: '2024-03-01',
      userId: viewer.id,
      withSharedSpaces: true,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const idsOff: string[] = JSON.parse(bucketRawOff).id;
    expect(idsOff).not.toContain(assetInA.id);
  });
});

describe('SharedSpaceService — linked-album assets via direct spaceId timeline', () => {
  it('includes album assets when spaceId used directly and showInTimeline=true, excludes when false', async () => {
    const { sut, ctx } = setupTimeline();

    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id, faceRecognitionEnabled: false });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: 'viewer' });

    const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'DirectSpaceAlbum' });
    const { asset: assetInA } = await ctx.newAsset({
      ownerId: owner.id,
      localDateTime: new Date('2024-05-10T12:00:00.000Z'),
      fileCreatedAt: new Date('2024-05-10T12:00:00.000Z'),
      visibility: AssetVisibility.Timeline,
    });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: assetInA.id });
    await ctx.newExif({ assetId: assetInA.id, make: 'Nikon' });
    await ctx.get(SharedSpaceRepository).addAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });

    const viewerAuth = factory.auth({ user: { id: viewer.id, email: viewer.email } });

    // --- showInTimeline=true: asset MUST appear via spaceId path ---
    const bucketsOn = await sut.getTimeBuckets(viewerAuth, {
      spaceId: space.id,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const bucketOn = bucketsOn.find((b) => b.timeBucket === '2024-05-01');
    expect(bucketOn?.count).toBe(1);

    const bucketRawOn = await sut.getTimeBucket(viewerAuth, {
      timeBucket: '2024-05-01',
      spaceId: space.id,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const idsOn: string[] = JSON.parse(bucketRawOn).id;
    expect(idsOn).toContain(assetInA.id);

    // Toggle showInTimeline off
    await ctx.get(SharedSpaceRepository).setAlbumShowInTimeline(space.id, album.id, false);

    // --- showInTimeline=false: asset MUST be absent ---
    const bucketsOff = await sut.getTimeBuckets(viewerAuth, {
      spaceId: space.id,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const bucketOff = bucketsOff.find((b) => b.timeBucket === '2024-05-01');
    expect(bucketOff?.count ?? 0).toBe(0);

    const bucketRawOff = await sut.getTimeBucket(viewerAuth, {
      timeBucket: '2024-05-01',
      spaceId: space.id,
      visibility: AssetVisibility.Timeline,
      bucketSize: TimeBucketSize.Month,
    });
    const idsOff: string[] = JSON.parse(bucketRawOff).id;
    expect(idsOff).not.toContain(assetInA.id);
  });
});
