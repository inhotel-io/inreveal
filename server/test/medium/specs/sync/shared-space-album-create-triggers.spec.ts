import { Kysely } from 'kysely';
import { SharedSpaceRole } from 'src/enum';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let db: Kysely<DB>;
beforeAll(async () => {
  db = await getKyselyDB();
});

const grantsFor = (albumId: string) =>
  db.selectFrom('shared_space_album_user').selectAll().where('albumId', '=', albumId).execute();
const albumUpdateId = async (albumId: string) => {
  const row = await db.selectFrom('album').select('updateId').where('id', '=', albumId).executeTakeFirstOrThrow();
  return row.updateId;
};

describe('shared_space_album_after_insert_user (link → grant members)', () => {
  it('grants shared_space_album_user to every current member and bumps album.updateId', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: m1 } = await ctx.newUser();
    const { user: m2 } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: m1.id, role: SharedSpaceRole.Editor });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: m2.id, role: SharedSpaceRole.Viewer });
    const before = await albumUpdateId(album.id);

    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();

    const grants = await grantsFor(album.id);
    expect(new Set(grants.map((g) => g.userId))).toEqual(new Set([owner.id, m1.id, m2.id]));
    expect(grants.every((g) => g.createId)).toBe(true);
    expect(await albumUpdateId(album.id)).not.toEqual(before);
  });

  it('is idempotent on re-link (ON CONFLICT DO NOTHING — no duplicate grants)', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .onConflict((oc) => oc.doNothing())
      .execute();
    // a second (idempotent) insert attempt must not create duplicate grants
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .onConflict((oc) => oc.doNothing())
      .execute();
    expect(await grantsFor(album.id)).toHaveLength(1);
  });
});

describe('shared_space_member_after_insert_album (join → grant linked albums)', () => {
  it('grants for every album already linked to the joined space and bumps each album.updateId', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: joiner } = await ctx.newUser();
    const { album: a1 } = await ctx.newAlbum({ ownerId: owner.id });
    const { album: a2 } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: a1.id, addedById: owner.id })
      .execute();
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: a2.id, addedById: owner.id })
      .execute();
    const a1Before = await albumUpdateId(a1.id);

    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: joiner.id, role: SharedSpaceRole.Viewer });

    const a1Grants = await grantsFor(a1.id);
    const a2Grants = await grantsFor(a2.id);
    expect(a1Grants.some((g) => g.userId === joiner.id)).toBe(true);
    expect(a2Grants.some((g) => g.userId === joiner.id)).toBe(true);
    expect(await albumUpdateId(a1.id)).not.toEqual(a1Before);
  });

  it('no-ops when the joined space has no linked albums', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: joiner } = await ctx.newUser();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: joiner.id, role: SharedSpaceRole.Viewer });
    const grants = await db.selectFrom('shared_space_album_user').selectAll().where('userId', '=', joiner.id).execute();
    expect(grants).toHaveLength(0);
  });
});
