import { Kysely } from 'kysely';
import { AlbumUserRole, SharedSpaceRole } from 'src/enum';
import { DB } from 'src/schema';
import { SyncTestContext } from 'test/medium.factory';
import { getKyselyDB } from 'test/utils';

let db: Kysely<DB>;
beforeAll(async () => {
  db = await getKyselyDB();
});

const grantsFor = (albumId: string) =>
  db.selectFrom('shared_space_album_user').selectAll().where('albumId', '=', albumId).execute();

const auditFor = (albumId: string) =>
  db.selectFrom('shared_space_album_user_audit').selectAll().where('albumId', '=', albumId).execute();

// ---------------------------------------------------------------------------
// Task 1: Consumer trigger — shared_space_album_user_delete_after_audit
// ---------------------------------------------------------------------------

describe('shared_space_album_user_delete_after_audit (consumer)', () => {
  it('deletes the grant row when a matching grant-revocation audit row lands', async () => {
    const ctx = new SyncTestContext(db);
    const { user } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: user.id });
    await db.insertInto('shared_space_album_user').values({ userId: user.id, albumId: album.id }).execute();
    expect(await grantsFor(album.id)).toHaveLength(1);

    await db.insertInto('shared_space_album_user_audit').values({ albumId: album.id, userId: user.id }).execute();

    expect(await grantsFor(album.id)).toHaveLength(0);
  });

  it('leaves non-matching grants intact', async () => {
    const ctx = new SyncTestContext(db);
    const { user: u1 } = await ctx.newUser();
    const { user: u2 } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: u1.id });
    await db.insertInto('shared_space_album_user').values({ userId: u1.id, albumId: album.id }).execute();
    await db.insertInto('shared_space_album_user').values({ userId: u2.id, albumId: album.id }).execute();

    await db.insertInto('shared_space_album_user_audit').values({ albumId: album.id, userId: u1.id }).execute();

    const remaining = await grantsFor(album.id);
    expect(remaining.map((r) => r.userId)).toEqual([u2.id]);
  });
});

// ---------------------------------------------------------------------------
// Task 2: Fan-out triggers
// ---------------------------------------------------------------------------

describe('unlink album from space', () => {
  it('writes a link-removal audit (ungated) for the (space, album) and revokes grants for members with no other path', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();
    // create-side (A2) granted owner + viewer
    const initialGrants = await grantsFor(album.id);
    expect(initialGrants.length).toBe(2);

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    // link audit (ungated): one (space, album) row
    const linkAudit = await db
      .selectFrom('shared_space_album_audit')
      .selectAll()
      .where('albumId', '=', album.id)
      .where('spaceId', '=', space.id)
      .execute();
    expect(linkAudit).toHaveLength(1);
    // viewer had no other path → grant revoked by the consumer;
    // owner has an album_user role='owner' row → user_has_album_path = true → grant retained
    const remainingGrants = await grantsFor(album.id);
    const remaining = remainingGrants.map((r) => r.userId);
    expect(remaining).toEqual([owner.id]);
  });

  it("does NOT touch a member's manual album_user share (separate-table invariant)", async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: shared } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    await db
      .insertInto('album_user')
      .values({ albumId: album.id, userId: shared.id, role: AlbumUserRole.Editor })
      .execute();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: shared.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    // user_has_album_path is true via album_user → grant retained
    const sharedGrants = await grantsFor(album.id);
    expect(sharedGrants.some((g) => g.userId === shared.id)).toBe(true);
    // the album_user row itself is untouched
    const au = await db
      .selectFrom('album_user')
      .selectAll()
      .where('albumId', '=', album.id)
      .where('userId', '=', shared.id)
      .execute();
    expect(au).toHaveLength(1);
  });
});

describe('album linked to two spaces; member in only one', () => {
  it('unlink from S keeps the grant when the member reaches the album via S2', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space: s1 } = await ctx.newSharedSpace({ createdById: owner.id });
    const { space: s2 } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: s1.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await ctx.newSharedSpaceMember({ spaceId: s2.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: s1.id, albumId: album.id, addedById: owner.id })
      .execute();
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: s2.id, albumId: album.id, addedById: owner.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', s1.id).where('albumId', '=', album.id).execute();

    const memberGrants = await grantsFor(album.id);
    expect(memberGrants.some((g) => g.userId === member.id)).toBe(true); // kept via s2
  });
});

describe('member leaves space', () => {
  it('revokes the grant (gated) and writes NO link-removal row', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();

    await db
      .deleteFrom('shared_space_member')
      .where('spaceId', '=', space.id)
      .where('userId', '=', viewer.id)
      .execute();

    const viewerGrants1 = await grantsFor(album.id);
    expect(viewerGrants1.some((g) => g.userId === viewer.id)).toBe(false); // revoked
    const linkAudit = await db
      .selectFrom('shared_space_album_audit')
      .selectAll()
      .where('albumId', '=', album.id)
      .where('spaceId', '=', space.id)
      .execute();
    expect(linkAudit).toHaveLength(0); // link persists for remaining members
  });

  it('retains the grant when the leaving member holds a manual album_user share (album_user row is untouched)', async () => {
    // Mirrors the line-85 unlink test for the LEAVE path.
    // user_has_album_path returns true via album_user → the leave trigger's
    // gated revocation is suppressed, so the shared_space_album_user grant
    // is RETAINED and the album_user row is NEVER touched.
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    // member has a manual album_user row (a direct share, independent of the space)
    await db
      .insertInto('album_user')
      .values({ albumId: album.id, userId: member.id, role: AlbumUserRole.Editor })
      .execute();
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: owner.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();

    // Sanity: member has a grant.
    const grantsBefore = await grantsFor(album.id);
    expect(grantsBefore.some((g) => g.userId === member.id)).toBe(true);

    // Member leaves the space.
    await db
      .deleteFrom('shared_space_member')
      .where('spaceId', '=', space.id)
      .where('userId', '=', member.id)
      .execute();

    // user_has_album_path is true via album_user → grant is RETAINED (not revoked).
    const grantsAfter = await grantsFor(album.id);
    expect(grantsAfter.some((g) => g.userId === member.id)).toBe(true);

    // The album_user row itself is NEVER touched by the member-leave trigger chain.
    const au = await db
      .selectFrom('album_user')
      .selectAll()
      .where('albumId', '=', album.id)
      .where('userId', '=', member.id)
      .execute();
    expect(au).toHaveLength(1);
  });
});

describe('whole-space delete', () => {
  it("revokes all members' grants (BEFORE trigger) and writes a link-removal row via cascade", async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();

    await db.deleteFrom('shared_space').where('id', '=', space.id).execute();

    const viewerGrants1 = await grantsFor(album.id);
    expect(viewerGrants1.some((g) => g.userId === viewer.id)).toBe(false); // revoked (no other path)

    // The BEFORE-row trigger is the SOLE writer of the gated grant-audit on this
    // path: the cascade-fired shared_space_album_delete_audit's grant-revocation
    // INSERT must be suppressed by its INNER JOIN shared_space guard (the space
    // row is already gone by the time the cascade runs, so the join yields no
    // rows). So there is EXACTLY ONE grant-audit row for the viewer — a regressed
    // guard would produce a duplicate here.
    const grantAudit = await db
      .selectFrom('shared_space_album_user_audit')
      .selectAll()
      .where('albumId', '=', album.id)
      .execute();
    expect(grantAudit).toHaveLength(1);
    expect(grantAudit[0].userId).toBe(viewer.id); // creator/owner has a path → no audit

    // Section 1 (unconditional) is the only link-removal writer: exactly one
    // (space, album) row.
    const linkAudit = await db
      .selectFrom('shared_space_album_audit')
      .selectAll()
      .where('albumId', '=', album.id)
      .where('spaceId', '=', space.id)
      .execute();
    expect(linkAudit).toHaveLength(1);
  });
});

describe('album hard-delete', () => {
  it('revokes grants and writes a link-removal row when the album is deleted (cascade)', async () => {
    const ctx = new SyncTestContext(db);
    const { user: owner } = await ctx.newUser();
    const { user: viewer } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: owner.id });
    const { space } = await ctx.newSharedSpace({ createdById: owner.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: viewer.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: owner.id })
      .execute();

    await db.deleteFrom('album').where('id', '=', album.id).execute();

    // FK cascade removed the grant rows directly; assert none remain
    expect(await grantsFor(album.id)).toHaveLength(0);
    const linkAudit = await db
      .selectFrom('shared_space_album_audit')
      .selectAll()
      .where('albumId', '=', album.id)
      .execute();
    expect(linkAudit.length).toBeGreaterThanOrEqual(1); // section 1 fired during shared_space_album cascade
  });
});

// ---------------------------------------------------------------------------
// M2: the creator must receive exactly ONE grant-revocation tombstone.
//
// shared_space_album_delete_audit revokes grants for every member AND the
// space creator via one deduplicated INSERT ... SELECT DISTINCT, whose
// CROSS JOIN LATERAL unions the member set with the creator before the
// user_has_album_path check. That merge replaced two independent INSERTs
// (one per member, one for the creator); the creator is always also a
// member in production (SharedSpaceService.create adds them as Owner; they
// cannot leave or be removed), so the old two-INSERT form gave the creator
// two rows per delete. The tests below pin the merged behaviour: exactly one
// tombstone for a creator who is also a member, and — since nothing in the
// schema binds createdById to a member row — still one tombstone for a
// creator who isn't.
// ---------------------------------------------------------------------------

describe('shared_space_album_delete_audit — tombstone deduplication', () => {
  it('writes exactly one tombstone for a creator who is also a member', async () => {
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    // Owned by someone else, so the creator genuinely loses access on unlink.
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    const { space } = await ctx.newSharedSpace({ createdById: creator.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: creator.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: member.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: creator.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === creator.id)).toHaveLength(1);
    expect(audit.filter((r) => r.userId === member.id)).toHaveLength(1);
  });

  it('still writes one tombstone for a creator who is NOT a member', async () => {
    // Guards against a future "step 3 is redundant, delete it" simplification:
    // the member/creator overlap is a SERVICE invariant, not a schema one.
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    const { space } = await ctx.newSharedSpace({ createdById: creator.id });
    // Deliberately NO shared_space_member row for the creator.
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: creator.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === creator.id)).toHaveLength(1);
  });

  it('writes no tombstone for a member who keeps access via an album_user role', async () => {
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: shared } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    await db
      .insertInto('album_user')
      .values({ albumId: album.id, userId: shared.id, role: AlbumUserRole.Editor })
      .execute();
    const { space } = await ctx.newSharedSpace({ createdById: creator.id });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: creator.id, role: SharedSpaceRole.Owner });
    await ctx.newSharedSpaceMember({ spaceId: space.id, userId: shared.id, role: SharedSpaceRole.Viewer });
    await db
      .insertInto('shared_space_album')
      .values({ spaceId: space.id, albumId: album.id, addedById: creator.id })
      .execute();

    await db.deleteFrom('shared_space_album').where('spaceId', '=', space.id).where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === shared.id)).toHaveLength(0);
  });

  it('writes one tombstone per user when an album is unlinked from two spaces in one statement', async () => {
    // The audit table has no spaceId column, so two deleted links produce two
    // identical (albumId, userId) rows without a DISTINCT.
    const ctx = new SyncTestContext(db);
    const { user: creator } = await ctx.newUser();
    const { user: albumOwner } = await ctx.newUser();
    const { user: member } = await ctx.newUser();
    const { album } = await ctx.newAlbum({ ownerId: albumOwner.id });
    const { space: s1 } = await ctx.newSharedSpace({ createdById: creator.id });
    const { space: s2 } = await ctx.newSharedSpace({ createdById: creator.id });
    for (const s of [s1, s2]) {
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: creator.id, role: SharedSpaceRole.Owner });
      await ctx.newSharedSpaceMember({ spaceId: s.id, userId: member.id, role: SharedSpaceRole.Viewer });
      await db
        .insertInto('shared_space_album')
        .values({ spaceId: s.id, albumId: album.id, addedById: creator.id })
        .execute();
    }

    // ONE statement removing BOTH links → the statement-level trigger sees both in "old".
    await db.deleteFrom('shared_space_album').where('albumId', '=', album.id).execute();

    const audit = await auditFor(album.id);
    expect(audit.filter((r) => r.userId === member.id)).toHaveLength(1);
    expect(audit.filter((r) => r.userId === creator.id)).toHaveLength(1);
  });
});
