import {
  AlbumResponseDto,
  AlbumUserRole,
  LoginResponseDto,
  SharedSpaceAlbumFolderDto,
  SharedSpaceResponseDto,
  SharedSpaceRole,
  addUsersToAlbum,
} from '@immich/sdk';
import { randomUUID } from 'node:crypto';
import { createUserDto } from 'src/fixtures';
import { app, asBearerAuth, utils } from 'src/utils';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

// Space album folder endpoints role matrix.
//
// GET    /shared-spaces/:id/album-folders            — list       (SharedSpaceRead)
// POST   /shared-spaces/:id/album-folders            — create     (SharedSpaceAlbumFolderCreate)
// PATCH  /shared-spaces/:id/album-folders/:folderId  — rename/move(SharedSpaceAlbumFolderUpdate)
// DELETE /shared-spaces/:id/album-folders/:folderId  — delete     (SharedSpaceAlbumFolderDelete)
// PUT    /shared-spaces/:id/albums/:albumId/folder   — place album(SharedSpaceAlbumUpdate)
//
// The `Permission.SharedSpaceAlbumFolder*` decorators on these routes only gate API-key callers
// (AuthService.authenticate only checks `authDto.apiKey.permissions`); for a normal session/bearer
// token, the space-role check happens inside SharedSpaceService via requireRole(), which is the
// FIRST line of every one of these service methods. That still runs before any dto content is
// used, so an unauthorised actor gets 403 before the service ever inspects the payload — but the
// body is already Zod-validated by then (NestJS runs the global ZodValidationPipe as part of
// resolving the controller method's arguments, which happens after guards but before the handler
// body/service call). A body that is invalid **for the endpoint's schema** (missing required
// fields, wrong types) would 400 before reaching the service. R-09 below uses a payload that is
// schema-valid (a well-formed empty-root move name is not sent; instead an out-of-band field is
// used) so the service's own role gate is what's actually being pinned.
//
// Validation failures that the SERVICE raises (bad name, depth-cap, missing/cross-space folder)
// are always 400 — this service never throws ConflictException; that is reserved for a different
// fork feature (merge-policy's structured cross-owner conflict).

describe('/shared-spaces/:id/album-folders', () => {
  let owner: LoginResponseDto;
  let editor: LoginResponseDto;
  let viewer: LoginResponseDto;
  let stranger: LoginResponseDto;
  let space: SharedSpaceResponseDto;
  let otherSpace: SharedSpaceResponseDto;
  let folderId: string;
  // Set by R-08's arrange step — a real folder id that genuinely belongs to otherSpace, reused by
  // the cross-space-400 test below so it exercises "a folder that exists, just in the wrong
  // space" rather than a folder id that doesn't exist anywhere.
  let otherSpaceFolderId: string;

  beforeAll(async () => {
    await utils.resetDatabase();
    const admin = await utils.adminSetup();
    [owner, editor, viewer, stranger] = await Promise.all([
      utils.userSetup(admin.accessToken, createUserDto.user1),
      utils.userSetup(admin.accessToken, createUserDto.user2),
      utils.userSetup(admin.accessToken, createUserDto.user3),
      utils.userSetup(admin.accessToken, createUserDto.user4),
    ]);

    space = await utils.createSpace(owner.accessToken, { name: 'Folders' });
    otherSpace = await utils.createSpace(stranger.accessToken, { name: 'Elsewhere' });
    await utils.addSpaceMember(owner.accessToken, space.id, { userId: editor.userId, role: SharedSpaceRole.Editor });
    await utils.addSpaceMember(owner.accessToken, space.id, { userId: viewer.userId, role: SharedSpaceRole.Viewer });

    const { body } = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'Trips' });
    folderId = body.id;
  });

  // R-01 / R-02
  it.each([
    ['R-01', 'owner'],
    ['R-02', 'editor'],
  ])('%s: a space %s may create, rename, and delete a folder', async (_id, role) => {
    const token = role === 'owner' ? owner.accessToken : editor.accessToken;

    const created = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(token))
      .send({ name: `Scratch-${role}` });
    expect(created.status).toBe(201);

    const renamed = await request(app)
      .patch(`/shared-spaces/${space.id}/album-folders/${created.body.id}`)
      .set(asBearerAuth(token))
      .send({ name: `Scratch-${role}-renamed` });
    expect(renamed.status).toBe(204);

    const removed = await request(app)
      .delete(`/shared-spaces/${space.id}/album-folders/${created.body.id}`)
      .set(asBearerAuth(token));
    expect(removed.status).toBe(204);
  });

  // R-03 / R-04: every write is refused for a viewer and for a non-member alike.
  it.each([
    ['R-03', 'viewer'],
    ['R-04', 'non-member'],
  ])('%s: a %s is refused every folder write', async (_id, role) => {
    const token = role === 'viewer' ? viewer.accessToken : stranger.accessToken;

    const create = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(token))
      .send({ name: 'Nope' });
    expect(create.status).toBe(403);

    const patch = await request(app)
      .patch(`/shared-spaces/${space.id}/album-folders/${folderId}`)
      .set(asBearerAuth(token))
      .send({ name: 'Nope' });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/shared-spaces/${space.id}/album-folders/${folderId}`)
      .set(asBearerAuth(token));
    expect(del.status).toBe(403);
  });

  // R-05
  it('R-05: a viewer may list the folders', async () => {
    const { status, body } = await request(app)
      .get(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(viewer.accessToken));

    expect(status).toBe(200);
    expect(body.map((f: { id: string }) => f.id)).toContain(folderId);
  });

  // R-06: a folder name is itself information, so a non-member must be refused rather than
  // handed an empty list that confirms the space exists.
  it('R-06: a non-member gets 403, not an empty list', async () => {
    const { status, body } = await request(app)
      .get(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(stranger.accessToken));

    expect(status).toBe(403);
    expect(body).not.toEqual([]);
  });

  // R-08: the listing is space-scoped — the read-side counterpart to the cross-space write guard.
  it('R-08: the listing contains this space and no other', async () => {
    // Arrange: this create must actually succeed, or the "Secret" absence assertion below would
    // pass vacuously (e.g. a bad token or a future schema change silently failing this POST would
    // make "not.toContain('Secret')" true for the wrong reason, masking the exact cross-space
    // leak this test exists to catch).
    const created = await request(app)
      .post(`/shared-spaces/${otherSpace.id}/album-folders`)
      .set(asBearerAuth(stranger.accessToken))
      .send({ name: 'Secret' });
    expect(created.status).toBe(201);
    otherSpaceFolderId = created.body.id;

    const { body } = await request(app)
      .get(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken));

    expect(body.every((f: { spaceId: string }) => f.spaceId === space.id)).toBe(true);
    expect(body.map((f: { name: string }) => f.name)).not.toContain('Secret');
  });

  // R-09: the role gate runs BEFORE the service inspects the payload, so an unauthorised actor
  // learns nothing about whether their content would otherwise have been accepted. The DTO's
  // `name` is schema-valid here (min length 1) — a schema-invalid payload would be rejected by
  // the global ZodValidationPipe before the request reaches the service at all, which would
  // produce a 400 regardless of role and wouldn't isolate the role gate.
  //
  // Accidental but load-bearing: 'Trips' duplicates the folder name created in beforeAll, so this
  // payload would ALSO fail the service's own name-collision check if that check ever ran. Because
  // this suite executes in declaration order (vitest.config.ts pins maxWorkers: 1 / isolate:
  // false, and nothing here shuffles), that duplicate is guaranteed to exist by the time this test
  // runs. That means this test doesn't just prove "a Viewer is denied" — it also catches a
  // regression where a content check (the name-collision check specifically) got reordered ahead
  // of requireRole(): if that happened, this exact request would flip 403 -> 400, whereas R-03's
  // non-colliding 'Nope' payload would not detect it. Do not "tidy" this name to something unique
  // — that would silently remove this property.
  it('R-09: a viewer sending an otherwise-valid create still gets 403 (role gate, not a content check)', async () => {
    const { status } = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(viewer.accessToken))
      .send({ name: 'Trips', parentId: null });

    expect(status).toBe(403);
  });

  // R-07: space Editor alone is enough — album ownership is deliberately not required.
  it('R-07: an editor may place an album owned by someone else', async () => {
    const album = await utils.createAlbum(owner.accessToken, { albumName: 'Owner Album' });
    await utils.linkSpaceAlbum(owner.accessToken, space.id, album.id);

    const { status } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}/folder`)
      .set(asBearerAuth(editor.accessToken))
      .send({ folderId });

    expect(status).toBe(204);
  });

  it('rejects a cross-space folder placement with 400', async () => {
    const album = await utils.createAlbum(owner.accessToken, { albumName: 'Cross Space' });
    await utils.linkSpaceAlbum(owner.accessToken, space.id, album.id);

    // Uses otherSpaceFolderId — a folder that genuinely exists, just in otherSpace rather than
    // this space — instead of a globally-nonexistent UUID. getAlbumFolderById is scoped
    // `WHERE spaceId = ? AND id = ?`, so a real id from the wrong space and an id that doesn't
    // exist anywhere are provably indistinguishable to the code: both miss that lookup and 400
    // identically. Using the real cross-space id just makes this test's behaviour match its name.
    const { status } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}/folder`)
      .set(asBearerAuth(owner.accessToken))
      .send({ folderId: otherSpaceFolderId });

    expect(status).toBe(400);
  });

  // ---------------------------------------------------------------------------------------------
  // Task 5 additions: linkAlbum's `?folderId=` query wiring (previously proven only by mocks), the
  // PATCH move half of updateAlbumFolder (previously every e2e PATCH sent only `name`), and the
  // PUT :id/albums/:albumId/folder RBAC matrix (owner happy path was never GET-verified, and
  // non-member was untested at any layer for this endpoint).
  // ---------------------------------------------------------------------------------------------

  // R-10: the `@Query() { folderId }` binding on linkAlbum is otherwise proven only by mocks. This
  // asserts the GET list body, not just the 204, so a regression that silently drops the folder
  // placement (e.g. A-10 in linkAlbum getting reordered, or a query-binding typo) would be caught
  // even though the link call itself would still return 204.
  it('R-10: an editor linking an album with folderId places it directly, visible in the album list', async () => {
    const album = await utils.createAlbum(editor.accessToken, { albumName: 'R-10 Editor Own Album' });

    const linked = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}`)
      .query({ folderId })
      .set(asBearerAuth(editor.accessToken));
    expect(linked.status).toBe(204);

    const { body } = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));

    const entry = body.find((a: { id: string }) => a.id === album.id);
    expect(entry).toBeDefined();
    expect(entry.folderId).toBe(folderId);
  });

  // R-11: getAlbumFolderById is scoped `WHERE spaceId = ?`, so a folderId from a real folder in a
  // different space is rejected the same way a globally-nonexistent id would be. Reuses
  // otherSpaceFolderId (set by R-08's arrange step) for the same reason the cross-space PUT-folder
  // test above does.
  it('R-11: linkAlbum with a folderId from a different space is refused with 400', async () => {
    const album = await utils.createAlbum(editor.accessToken, { albumName: 'R-11 Editor Cross-Space Link' });

    const { status } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}`)
      .query({ folderId: otherSpaceFolderId })
      .set(asBearerAuth(editor.accessToken));

    expect(status).toBe(400);
  });

  // R-12: folderId is z.uuidv4().optional() on the query DTO, so a non-UUID value never reaches
  // the service — the global ZodValidationPipe 400s it before any role/access check runs.
  it('R-12: linkAlbum with a non-UUID folderId is refused with 400', async () => {
    const album = await utils.createAlbum(editor.accessToken, { albumName: 'R-12 Editor Invalid Folder Link' });

    const { status } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}`)
      .query({ folderId: 'not-a-uuid' })
      .set(asBearerAuth(editor.accessToken));

    expect(status).toBe(400);
  });

  // R-13: the PATCH move half was never previously exercised over HTTP — every existing PATCH
  // test above sends only `name`. This moves a folder under a new sibling parent and verifies the
  // move via GET rather than trusting the 204 alone.
  it('R-13: moving a folder under a new parent is reflected in the list', async () => {
    const parent = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-13 Parent' });
    expect(parent.status).toBe(201);

    const child = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-13 Child' });
    expect(child.status).toBe(201);

    const moved = await request(app)
      .patch(`/shared-spaces/${space.id}/album-folders/${child.body.id}`)
      .set(asBearerAuth(owner.accessToken))
      .send({ parentId: parent.body.id });
    expect(moved.status).toBe(204);

    const { body } = await request(app)
      .get(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken));

    const entry = body.find((f: { id: string }) => f.id === child.body.id);
    expect(entry.parentId).toBe(parent.body.id);
  });

  // R-14: an explicit `parentId: null` is the documented way to move a nested folder to the space
  // root (distinct from omitting parentId, which leaves the current parent untouched).
  it('R-14: an explicit null parentId moves a nested folder to the root', async () => {
    const parent = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-14 Parent' });
    expect(parent.status).toBe(201);

    const child = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-14 Child', parentId: parent.body.id });
    expect(child.status).toBe(201);
    expect(child.body.parentId).toBe(parent.body.id);

    const moved = await request(app)
      .patch(`/shared-spaces/${space.id}/album-folders/${child.body.id}`)
      .set(asBearerAuth(owner.accessToken))
      .send({ parentId: null });
    expect(moved.status).toBe(204);

    const { body } = await request(app)
      .get(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken));

    const entry = body.find((f: { id: string }) => f.id === child.body.id);
    expect(entry.parentId).toBeNull();
  });

  // R-15: the zod `.refine()` on SharedSpaceAlbumFolderUpdateSchema requires at least one of
  // name/parentId. An empty body never reaches the service — the global ZodValidationPipe 400s it.
  it('R-15: an empty PATCH body is refused with 400', async () => {
    const { status } = await request(app)
      .patch(`/shared-spaces/${space.id}/album-folders/${folderId}`)
      .set(asBearerAuth(owner.accessToken))
      .send({});

    expect(status).toBe(400);
  });

  // R-16: a combined rename+move happens as one atomic update (moveAlbumFolderChecked applies both
  // in the same statement). Verify both land together, not just that the request 204s.
  it('R-16: a single PATCH can rename and move a folder together', async () => {
    const destination = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-16 Destination' });
    expect(destination.status).toBe(201);

    const source = await request(app)
      .post(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-16 Source' });
    expect(source.status).toBe(201);

    const patched = await request(app)
      .patch(`/shared-spaces/${space.id}/album-folders/${source.body.id}`)
      .set(asBearerAuth(owner.accessToken))
      .send({ name: 'R-16 Source Renamed', parentId: destination.body.id });
    expect(patched.status).toBe(204);

    const { body } = await request(app)
      .get(`/shared-spaces/${space.id}/album-folders`)
      .set(asBearerAuth(owner.accessToken));

    const entry = body.find((f: { id: string }) => f.id === source.body.id);
    expect(entry.name).toBe('R-16 Source Renamed');
    expect(entry.parentId).toBe(destination.body.id);
  });

  // R-17: the pre-existing owner cell (the cross-space-400 test above) never asserts a successful
  // placement lands correctly. This is the owner happy path, GET-verified.
  it('R-17: an owner may place an album into a folder, visible in the album list', async () => {
    const album = await utils.createAlbum(owner.accessToken, { albumName: 'R-17 Owner Placement' });
    await utils.linkSpaceAlbum(owner.accessToken, space.id, album.id);

    const placed = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}/folder`)
      .set(asBearerAuth(owner.accessToken))
      .send({ folderId });
    expect(placed.status).toBe(204);

    const { body } = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(owner.accessToken));

    const entry = body.find((a: { id: string }) => a.id === album.id);
    expect(entry).toBeDefined();
    expect(entry.folderId).toBe(folderId);
  });

  // R-18 / R-19: this endpoint moves OTHER people's albums, so both non-owner roles must be
  // refused with exactly 403 — not merely "not 200". Non-member was previously untested at any
  // layer for this route.
  it.each([
    ['R-18', 'viewer'],
    ['R-19', 'non-member'],
  ])('%s: a %s is refused album-folder placement with 403', async (label, role) => {
    const token = role === 'viewer' ? viewer.accessToken : stranger.accessToken;
    const album = await utils.createAlbum(owner.accessToken, { albumName: `${label} Placement Refusal` });
    await utils.linkSpaceAlbum(owner.accessToken, space.id, album.id);

    const { status } = await request(app)
      .put(`/shared-spaces/${space.id}/albums/${album.id}/folder`)
      .set(asBearerAuth(token))
      .send({ folderId });

    expect(status).toBe(403);
  });

  // ---------------------------------------------------------------------------------------------
  // Task 5: the five bulk album/folder endpoints (design spec §6.1) and their RBAC matrix.
  //
  // Error-reason split (design spec §6.2, task 5 Addition 3): the two families deliberately report
  // a vanished item differently — albums/bulk-unlink yields `not_found` (#unlinkAlbumChecked throws
  // NotFoundException), while the two folder families yield `validation` (deleteAlbumFolder /
  // #moveAlbumFolderOrThrow throw BadRequestException). Every assertion below pins the EXACT string
  // so a later partial-failure UI cannot branch on `not_found` alone.
  //
  // RBAC split (design spec S-28/S-29 vs S-29a, amended 2026-08-06 during Task 5): bulk-folder,
  // bulk-timeline, bulk-parent and bulk-delete are space-Editor-only via a single hoisted
  // requireRole — a viewer or non-member gets one 403 for the whole request. albums/bulk-unlink is
  // the deliberate exception: the album-owner arm (rbac-6) means it authorizes PER ITEM, so a
  // viewer/non-member instead gets 200 with per-item `no_permission` (or `success: true` for an
  // album they own).
  // ---------------------------------------------------------------------------------------------
  describe('bulk endpoints', () => {
    let albumA: AlbumResponseDto;
    let albumB: AlbumResponseDto;
    let albumC: AlbumResponseDto;
    let foreignAlbum: AlbumResponseDto;
    let folder: SharedSpaceAlbumFolderDto;
    let parentFolder: SharedSpaceAlbumFolderDto;
    let childFolder: SharedSpaceAlbumFolderDto;

    beforeAll(async () => {
      [albumA, albumB, albumC] = await Promise.all([
        utils.createAlbum(owner.accessToken, { albumName: 'Bulk A' }),
        utils.createAlbum(owner.accessToken, { albumName: 'Bulk B' }),
        utils.createAlbum(owner.accessToken, { albumName: 'Bulk C' }),
      ]);
      await Promise.all([
        utils.linkSpaceAlbum(owner.accessToken, space.id, albumA.id),
        utils.linkSpaceAlbum(owner.accessToken, space.id, albumB.id),
        utils.linkSpaceAlbum(owner.accessToken, space.id, albumC.id),
      ]);

      // foreignAlbum is linked to otherSpace, not space — R-20 unlinks it via space's bulk-unlink
      // and expects not_found, exercising the same space-scoped hasAlbumLink guard (M11) closed for
      // the single-item path.
      foreignAlbum = await utils.createAlbum(stranger.accessToken, { albumName: 'Bulk Foreign' });
      await utils.linkSpaceAlbum(stranger.accessToken, otherSpace.id, foreignAlbum.id);

      const folderRes = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders`)
        .set(asBearerAuth(owner.accessToken))
        .send({ name: 'Bulk Folder' });
      folder = folderRes.body;

      const parentRes = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders`)
        .set(asBearerAuth(owner.accessToken))
        .send({ name: 'Bulk Parent' });
      parentFolder = parentRes.body;

      const childRes = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders`)
        .set(asBearerAuth(owner.accessToken))
        .send({ name: 'Bulk Child', parentId: parentFolder.id });
      childFolder = childRes.body;
    });

    // S-27
    it('R-20 unlinks a batch and reports per-item outcomes', async () => {
      const { status, body } = await request(app)
        .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [albumA.id, foreignAlbum.id] });
      expect(status).toBe(200);
      expect(body).toEqual([
        { id: albumA.id, success: true },
        expect.objectContaining({ id: foreignAlbum.id, success: false, error: 'not_found' }),
      ]);

      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      expect(list.body.map((l: { id: string }) => l.id)).not.toContain(albumA.id);
    });

    // S-29a (amended 2026-08-06, during Task 5): albums/bulk-unlink authorizes PER ITEM, unlike
    // the other four bulk endpoints below — the album-owner arm (rbac-6) means a space viewer who
    // owns none of the batch's albums gets 200 with per-item no_permission, not a request-level 403.
    it('R-21 a space viewer who owns none of the albums gets 200 with per-item no_permission', async () => {
      const { status, body } = await request(app)
        .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
        .set(asBearerAuth(viewer.accessToken))
        .send({ ids: [albumB.id] });
      expect(status).toBe(200);
      expect(body).toEqual([expect.objectContaining({ id: albumB.id, success: false, error: 'no_permission' })]);

      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      expect(list.body.map((l: { id: string }) => l.id)).toContain(albumB.id);
    });

    // S-29a, second clause: a non-member who owns one of the batch's albums (via the rbac-6 owner
    // arm) still gets that item unlinked; only the OTHER ids fail. strangerAlbum is owned by
    // `stranger` and linked to `space` by `owner` — linkAlbum requires the caller to hold BOTH
    // space-Editor and album owner/editor, so `owner` is first granted album-editor access.
    it('R-22 a non-member who owns one linked album unlinks it and gets no_permission for the rest', async () => {
      const strangerAlbum = await utils.createAlbum(stranger.accessToken, { albumName: 'Bulk Stranger Owned' });
      await addUsersToAlbum(
        { id: strangerAlbum.id, addUsersDto: { albumUsers: [{ userId: owner.userId, role: AlbumUserRole.Editor }] } },
        { headers: asBearerAuth(stranger.accessToken) },
      );
      await utils.linkSpaceAlbum(owner.accessToken, space.id, strangerAlbum.id);

      const { status, body } = await request(app)
        .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
        .set(asBearerAuth(stranger.accessToken))
        .send({ ids: [strangerAlbum.id, albumC.id] });

      expect(status).toBe(200);
      expect(body).toEqual(
        expect.arrayContaining([
          { id: strangerAlbum.id, success: true },
          expect.objectContaining({ id: albumC.id, success: false, error: 'no_permission' }),
        ]),
      );

      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      expect(list.body.map((l: { id: string }) => l.id)).not.toContain(strangerAlbum.id);
      expect(list.body.map((l: { id: string }) => l.id)).toContain(albumC.id);
    });

    // E-2
    it('R-23 rejects an empty ids array with 400', async () => {
      const { status } = await request(app)
        .post(`/shared-spaces/${space.id}/albums/bulk-unlink`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [] });
      expect(status).toBe(400);
    });

    it('R-24 moves a batch of albums into a folder and the list reflects it', async () => {
      const { status, body } = await request(app)
        .put(`/shared-spaces/${space.id}/albums/bulk-folder`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [albumB.id, albumC.id], folderId: folder.id });
      expect(status).toBe(200);
      expect(body.every((r: { success: boolean }) => r.success)).toBe(true);

      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      const placed = list.body.filter((l: { folderId: string | null }) => l.folderId === folder.id);
      expect(placed).toHaveLength(2);
    });

    it('R-25 applies the timeline flag to a batch', async () => {
      const { status } = await request(app)
        .put(`/shared-spaces/${space.id}/albums/bulk-timeline`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [albumB.id], showInTimeline: false });
      expect(status).toBe(200);
      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      expect(list.body.find((l: { id: string }) => l.id === albumB.id).showInTimeline).toBe(false);
    });

    // Task 5 Addition 2: Task 3's review found bulkSetAlbumFolder had no coverage of
    // `folderId: null` ("move back to the space root"). Mutating the implementation to
    // `dto.folderId ?? 'root-sentinel'` survives the entire unit suite, so this pins the null case
    // at the HTTP layer with a body assertion, not just a 200.
    it('R-26 sending folderId: null moves a batch of albums back to the space root', async () => {
      const rootAlbum = await utils.createAlbum(owner.accessToken, { albumName: 'Bulk Root Return' });
      await utils.linkSpaceAlbum(owner.accessToken, space.id, rootAlbum.id);
      const placed = await request(app)
        .put(`/shared-spaces/${space.id}/albums/${rootAlbum.id}/folder`)
        .set(asBearerAuth(owner.accessToken))
        .send({ folderId: folder.id });
      expect(placed.status).toBe(204);

      const { status } = await request(app)
        .put(`/shared-spaces/${space.id}/albums/bulk-folder`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [rootAlbum.id], folderId: null });
      expect(status).toBe(200);

      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      expect(list.body.find((l: { id: string }) => l.id === rootAlbum.id).folderId).toBeNull();
    });

    // S-30
    it('R-27 rejects a cycle in a bulk folder move with a validation entry', async () => {
      const { status, body } = await request(app)
        .put(`/shared-spaces/${space.id}/album-folders/bulk-parent`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [parentFolder.id], parentId: childFolder.id });
      expect(status).toBe(200);
      expect(body[0]).toMatchObject({ success: false, error: 'validation' });
    });

    // Task 5 Addition 3: the folder families report a missing/foreign folder as `validation`,
    // never `not_found` — the mirror image of R-20's album-family `not_found`.
    it('R-28 bulk-parent reports validation, not not_found, for a foreign destination folder', async () => {
      const created = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders`)
        .set(asBearerAuth(owner.accessToken))
        .send({ name: 'R-28 Movable' });
      expect(created.status).toBe(201);

      const { status, body } = await request(app)
        .put(`/shared-spaces/${space.id}/album-folders/bulk-parent`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [created.body.id], parentId: otherSpaceFolderId });

      expect(status).toBe(200);
      expect(body[0]).toMatchObject({ success: false, error: 'validation' });
    });

    // S-21
    it('R-29 bulk deletes folders and promotes their children', async () => {
      const { status } = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders/bulk-delete`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [folder.id] });
      expect(status).toBe(200);
      const list = await request(app).get(`/shared-spaces/${space.id}/albums`).set(asBearerAuth(editor.accessToken));
      expect(list.body.find((l: { id: string }) => l.id === albumB.id).folderId).toBeNull();
    });

    // Task 5 Addition 3, continued: same validation/not_found split, for bulk-delete.
    it('R-30 bulk-delete reports validation, not not_found, for a foreign folder id', async () => {
      const { status, body } = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders/bulk-delete`)
        .set(asBearerAuth(editor.accessToken))
        .send({ ids: [otherSpaceFolderId] });

      expect(status).toBe(200);
      expect(body[0]).toMatchObject({ success: false, error: 'validation' });
    });

    it('R-31 refuses a viewer on bulk folder delete with 403', async () => {
      const { status } = await request(app)
        .post(`/shared-spaces/${space.id}/album-folders/bulk-delete`)
        .set(asBearerAuth(viewer.accessToken))
        .send({ ids: [parentFolder.id] });
      expect(status).toBe(403);
    });

    // Task 5 Addition 1 (RBAC gap found reviewing Task 4): bulk-folder, bulk-timeline and
    // bulk-parent are now hoisted-Editor-gated exactly like bulk-delete above (S-28/S-29) — unlike
    // bulk-unlink (S-29a). A viewer or a non-member gets exactly 403 for the whole request, before
    // any item is even looked at (random ids that don't exist still 403, never 200/404).
    it.each([
      ['R-32', 'viewer', () => viewer.accessToken],
      ['R-33', 'non-member', () => stranger.accessToken],
    ])('%s: a %s is refused every other Editor-gated bulk endpoint with 403', async (_label, _role, getToken) => {
      const token = getToken();

      const folderMove = await request(app)
        .put(`/shared-spaces/${space.id}/albums/bulk-folder`)
        .set(asBearerAuth(token))
        .send({ ids: [randomUUID()], folderId: null });
      expect(folderMove.status).toBe(403);

      const timeline = await request(app)
        .put(`/shared-spaces/${space.id}/albums/bulk-timeline`)
        .set(asBearerAuth(token))
        .send({ ids: [randomUUID()], showInTimeline: true });
      expect(timeline.status).toBe(403);

      const folderParent = await request(app)
        .put(`/shared-spaces/${space.id}/album-folders/bulk-parent`)
        .set(asBearerAuth(token))
        .send({ ids: [randomUUID()], parentId: null });
      expect(folderParent.status).toBe(403);
    });
  });
});
