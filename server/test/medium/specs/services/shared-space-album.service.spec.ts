import { Kysely } from 'kysely';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { SharedSpaceService } from 'src/services/shared-space.service';
import { newMediumService } from 'test/medium.factory';
import { factory } from 'test/small.factory';
import { getKyselyDB } from 'test/utils';

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

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

const authFromUser = (actor: { id: string; email: string }) =>
  factory.auth({ user: { id: actor.id, email: actor.email } });

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
