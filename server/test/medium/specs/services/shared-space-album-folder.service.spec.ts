import { Kysely } from 'kysely';
import { AccessRepository } from 'src/repositories/access.repository';
import { AlbumUserRepository } from 'src/repositories/album-user.repository';
import { AlbumRepository } from 'src/repositories/album.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { StackRepository } from 'src/repositories/stack.repository';
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
      DatabaseRepository,
      SharedSpaceRepository,
      StackRepository,
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

describe('SharedSpaceService — bulk album folders against a real tree', () => {
  describe('bulkMoveAlbumFolders', () => {
    // E-9 / E-10: intra-batch ordering, self-parent shape.
    //
    // The dto carries ONE parentId for the whole batch, so a two-different-targets cycle (move A
    // under B, move B under C where C is now under A) cannot be expressed. Built from the real
    // shape instead: moving both A and B under B in the same call — moving A under B is legal,
    // moving B under B is not (a folder cannot be its own parent).
    //
    // IMPORTANT, recorded here because it very nearly slipped through the falsifiability check
    // below: this specific fixture does NOT actually exercise "item 2 validated against the tree
    // item 1 produced". B's rejection is #moveAlbumFolderOrThrow's synchronous
    // `destinationParentId === folderId` self-check — it fires before any await, independent of
    // A's outcome, A's ordering, or anything in the database. Mutating #runBulk's `for…of` loop to
    // Promise.all does NOT fail this test (verified — see task-6-report.md): B always fails and A
    // always succeeds, regardless of execution order, because B's folderId literally equals the
    // shared parentId. This test is kept because it is still real, real-database coverage of a
    // legitimate case (and the existing MOCKED unit test for the same shape, spec.ts:13079,
    // provides no database-truth guarantee), but by itself it does not satisfy the "an earlier
    // item changes what is legal for a later one" property. See the next test for that.
    it('validates a self-parent move within a batch (E-9/E-10, self-parent shape)', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
      const auth = authFromUser(owner);
      const repo = ctx.get(SharedSpaceRepository);

      const a = await repo.createAlbumFolder({ spaceId: space.id, parentId: null, name: 'A', createdById: owner.id });
      const b = await repo.createAlbumFolder({ spaceId: space.id, parentId: null, name: 'B', createdById: owner.id });

      const results = await sut.bulkMoveAlbumFolders(auth, space.id, { ids: [a.id, b.id], parentId: b.id });

      expect(results[0]).toMatchObject({ id: a.id, success: true });
      expect(results[1]).toMatchObject({ id: b.id, success: false, error: 'validation' });

      const rows = await repo.getAlbumFoldersBySpace(space.id);
      expect(rows.find((r) => r.id === a.id)!.parentId).toBe(b.id);
      expect(rows.find((r) => r.id === b.id)!.parentId).toBeNull();
    });

    // E-9 / E-10, strengthened: this is the test that actually needs a SEQUENTIAL implementation
    // to pass, because it needs item 2's validation to observe a write item 1 just made.
    //
    // A and B currently live under two DIFFERENT parents and happen to share a name — legal per
    // F-04 (same name, different parents). Both move to the SAME target T in one call. Moving A
    // into T first is legal (T has no "Trips" child yet). Once A has landed, T now has a "Trips"
    // child, so moving B into T collides with the sibling A just created — illegal. A mock cannot
    // express this: a mocked hasSiblingAlbumFolderName has no tree to have been changed by a prior
    // mocked call, it only returns whatever the test scripted. Here, the second call's answer is
    // produced by Postgres from the first call's real, committed write.
    it('validates a name-conflict move against the row the previous move in the batch just wrote', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
      const auth = authFromUser(owner);
      const repo = ctx.get(SharedSpaceRepository);

      const target = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: null,
        name: 'Target',
        createdById: owner.id,
      });
      const parentOfA = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: null,
        name: 'ParentA',
        createdById: owner.id,
      });
      const parentOfB = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: null,
        name: 'ParentB',
        createdById: owner.id,
      });
      const a = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: parentOfA.id,
        name: 'Trips',
        createdById: owner.id,
      });
      const b = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: parentOfB.id,
        name: 'Trips',
        createdById: owner.id,
      });

      const results = await sut.bulkMoveAlbumFolders(auth, space.id, { ids: [a.id, b.id], parentId: target.id });

      expect(results[0]).toMatchObject({ id: a.id, success: true });
      expect(results[1]).toMatchObject({ id: b.id, success: false, error: 'validation' });

      const rows = await repo.getAlbumFoldersBySpace(space.id);
      expect(rows.find((r) => r.id === a.id)!.parentId).toBe(target.id);
      // B never moved — it is still exactly where it started.
      expect(rows.find((r) => r.id === b.id)!.parentId).toBe(parentOfB.id);
    });
  });

  // S-21 against the real DB.
  describe('bulkDeleteAlbumFolders', () => {
    it('promotes children and never unlinks an album (S-21)', async () => {
      const { ctx, sut } = setup();
      const { user: owner } = await ctx.newUser();
      const { space } = await ctx.newSharedSpace({ createdById: owner.id });
      await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: 'owner' });
      const auth = authFromUser(owner);
      const repo = ctx.get(SharedSpaceRepository);

      const parent = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: null,
        name: 'Parent',
        createdById: owner.id,
      });
      const child = await repo.createAlbumFolder({
        spaceId: space.id,
        parentId: parent.id,
        name: 'Child',
        createdById: owner.id,
      });
      const { result: album } = await ctx.newAlbum({ ownerId: owner.id, albumName: 'Rome' });
      await ctx.database
        .insertInto('shared_space_album')
        .values({ spaceId: space.id, albumId: album.id, folderId: parent.id })
        .execute();

      const results = await sut.bulkDeleteAlbumFolders(auth, space.id, { ids: [parent.id] });

      expect(results).toEqual([{ id: parent.id, success: true }]);

      const folders = await repo.getAlbumFoldersBySpace(space.id);
      expect(folders.map((f) => f.id)).toEqual([child.id]);
      expect(folders[0].parentId).toBeNull();

      const link = await ctx.database
        .selectFrom('shared_space_album')
        .selectAll()
        .where('spaceId', '=', space.id)
        .where('albumId', '=', album.id)
        .executeTakeFirst();
      expect(link).toBeDefined();
      expect(link!.folderId).toBeNull();
    });
  });
});
