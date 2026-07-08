import { Kysely, sql } from 'kysely';
import { SharedSpaceRole } from 'src/enum';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { SharedSpaceRepository } from 'src/repositories/shared-space.repository';
import { DB } from 'src/schema';
import { BaseService } from 'src/services/base.service';
import { newMediumService } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let db: Kysely<DB>;
beforeAll(async () => {
  db = await getKyselyDB();
});

const setup = () => {
  const { ctx } = newMediumService(BaseService, { database: db, real: [], mock: [LoggingRepository] });
  return { ctx, sut: ctx.get(SharedSpaceRepository) };
};

const grantsFor = (albumId: string) =>
  db.selectFrom('shared_space_album_user').selectAll().where('albumId', '=', albumId).execute();
const grantAuditFor = (albumId: string, userId: string) =>
  db
    .selectFrom('shared_space_album_user_audit')
    .selectAll()
    .where('albumId', '=', albumId)
    .where('userId', '=', userId)
    .execute();
const hasGrant = async (albumId: string, userId: string) => {
  const grants = await grantsFor(albumId);
  return grants.some((g) => g.userId === userId);
};

describe('reconcileAlbumGrants (correctness-4)', () => {
  it('tombstones a stranded grant that has no live path', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: stranded } = await ctx.newUser(); // NOT an album_user, NOT a space member
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    await db.insertInto('shared_space_album_user').values({ userId: stranded.id, albumId: album.id }).execute();
    expect(await hasGrant(album.id, stranded.id)).toBe(true);

    const revoked = await sut.reconcileAlbumGrants([album.id]);

    expect(revoked).toBe(1);
    expect(await hasGrant(album.id, stranded.id)).toBe(false); // consumer deleted it
    expect(await grantAuditFor(album.id, stranded.id)).toHaveLength(1); // tombstone emitted
  });

  it('keeps a grant that still has a live path (no over-revocation)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await ctx.newSharedSpaceAlbum({ spaceId: space.id, albumId: album.id, addedById: owner.id });
    expect(await hasGrant(album.id, member.id)).toBe(true);

    const revoked = await sut.reconcileAlbumGrants([album.id]);

    expect(revoked).toBe(0);
    expect(await hasGrant(album.id, member.id)).toBe(true); // kept
  });

  it('is idempotent (a second sweep is a no-op)', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: stranded } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    await db.insertInto('shared_space_album_user').values({ userId: stranded.id, albumId: album.id }).execute();

    expect(await sut.reconcileAlbumGrants([album.id])).toBe(1);
    expect(await sut.reconcileAlbumGrants([album.id])).toBe(0); // grant already gone
  });

  it('resolves the TOCTOU race: two concurrent revocations strand a grant, reconcile converges it', async () => {
    const { ctx, sut } = setup();
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space: s1 } = await ctx.newSharedSpace({ createdById: owner.id });
    const { space: s2 } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await ctx.newSharedSpaceAlbum({ spaceId: s1.id, albumId: album.id, addedById: owner.id });
    await ctx.newSharedSpaceAlbum({ spaceId: s2.id, albumId: album.id, addedById: owner.id });
    expect(await hasGrant(album.id, member.id)).toBe(true);

    // Force the interleave with two overlapping transactions. Neither sees the other's
    // uncommitted DELETE, so each trigger's user_has_album_path (STABLE, READ COMMITTED)
    // finds the OTHER path present → both skip the grant-revocation audit. Deterministic
    // (statement-ordered, no timing).
    await db.connection().execute(async (c1) => {
      await db.connection().execute(async (c2) => {
        await sql`BEGIN`.execute(c1);
        await sql`BEGIN`.execute(c2);
        await sql`DELETE FROM shared_space_album WHERE "spaceId" = ${s1.id} AND "albumId" = ${album.id}`.execute(c1);
        await sql`DELETE FROM shared_space_member WHERE "spaceId" = ${s2.id} AND "userId" = ${member.id}`.execute(c2);
        await sql`COMMIT`.execute(c1);
        await sql`COMMIT`.execute(c2);
      });
    });

    // The bug: member now has NO live path (not in s2; album no longer in s1) but the grant SURVIVED.
    expect(await hasGrant(album.id, member.id)).toBe(true);

    // The fix: the post-commit reconcile (enqueued by removeMember/unlinkAlbum) converges it.
    const revoked = await sut.reconcileAlbumGrants([album.id]);
    expect(revoked).toBe(1);
    expect(await hasGrant(album.id, member.id)).toBe(false);
    const memberAudit = await grantAuditFor(album.id, member.id);
    expect(memberAudit.length).toBeGreaterThanOrEqual(1);
  });
});
