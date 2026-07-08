/**
 * Slice 11 — e2e RBAC negatives for space visibility gate.
 *
 * As a non-owner member, asserts that Hidden/Locked assets:
 *   1. Return 400 on GET /assets/:id
 *   2. Return 400 on GET /assets/:id/original
 *   3. Are absent from POST /download/info (spaceId) zip manifest
 *   4. Are absent from POST /download/info (albumId) zip manifest (via AlbumDownload space grant)
 *
 * Each test creates a fresh space + assets to avoid cross-test state contamination.
 *
 * Timeline and Archive assets are verified accessible (positive control) so that
 * 400 responses on Hidden/Locked are confirmed to be gate failures, not setup bugs.
 */

import { AssetVisibility, LoginResponseDto, SharedSpaceRole, updateAssets } from '@immich/sdk';
import { createUserDto } from 'src/fixtures';
import { app, asBearerAuth, utils } from 'src/utils';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

describe('shared-space visibility negatives (Slice 11)', () => {
  let admin: LoginResponseDto;
  let owner: LoginResponseDto;
  let member: LoginResponseDto;

  beforeAll(async () => {
    await utils.resetDatabase();
    admin = await utils.adminSetup();
    [owner, member] = await Promise.all([
      utils.userSetup(admin.accessToken, createUserDto.create('vis-neg-owner')),
      utils.userSetup(admin.accessToken, createUserDto.create('vis-neg-member')),
    ]);
  });

  // ─── helpers ─────────────────────────────────────────────────────────────────

  /** Set visibility on an asset owned by `owner`. */
  const setVisibility = (assetId: string, visibility: AssetVisibility) =>
    updateAssets({ assetBulkUpdateDto: { ids: [assetId], visibility } }, { headers: asBearerAuth(owner.accessToken) });

  /** Create a fresh space, add owner as owner and member as viewer, return the space id. */
  const freshSpace = async (name: string) => {
    const space = await utils.createSpace(owner.accessToken, { name });
    await utils.addSpaceMember(owner.accessToken, space.id, { userId: member.userId });
    return space.id;
  };

  /**
   * Call POST /download/info with the given body as member.
   * Returns the flat list of assetIds from all archives.
   */
  const downloadInfoIds = async (body: Record<string, unknown>): Promise<string[]> => {
    const { status, body: resBody } = await request(app)
      .post('/download/info')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send(body);
    expect(status).toBe(201);
    return (resBody.archives as Array<{ assetIds: string[] }>).flatMap((a) => a.assetIds);
  };

  /** Fresh space with owner=Owner, member=Viewer; returns the space id. */
  const freshSpaceWithViewer = async (name: string) => {
    const space = await utils.createSpace(owner.accessToken, { name });
    await utils.addSpaceMember(owner.accessToken, space.id, {
      userId: member.userId,
      role: SharedSpaceRole.Viewer,
    });
    return space.id;
  };

  const linkAlbum = (spaceId: string, albumId: string) =>
    request(app)
      .put(`/shared-spaces/${spaceId}/albums/${albumId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

  const searchAlbumIds = async (body: Record<string, unknown>): Promise<string[]> => {
    const { status, body: resBody } = await request(app)
      .post('/search/metadata')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send(body);
    expect(status).toBe(200);
    return (resBody.assets.items as Array<{ id: string }>).map((item) => item.id);
  };

  // Resolve a real bucket for the album's assets so the positive controls query a populated bucket.
  const firstAlbumBucket = async (albumId: string): Promise<string> => {
    const { status, body } = await request(app)
      .get(`/timeline/buckets?bucketSize=month&albumId=${albumId}`)
      .set('Authorization', `Bearer ${member.accessToken}`);
    expect(status).toBe(200);
    return (body as Array<{ timeBucket: string }>)[0].timeBucket;
  };

  /** Owner-created album with a Timeline + a Hidden asset, linked into a fresh space with a Viewer. */
  const setupLinkedAlbum = async (name: string) => {
    const timelineAsset = await utils.createAsset(owner.accessToken);
    const hiddenAsset = await utils.createAsset(owner.accessToken);
    const album = await utils.createAlbum(owner.accessToken, {
      albumName: name,
      assetIds: [timelineAsset.id, hiddenAsset.id],
    });
    await setVisibility(hiddenAsset.id, AssetVisibility.Hidden);
    const spaceId = await freshSpaceWithViewer(name);
    await linkAlbum(spaceId, album.id);
    return { album, timelineAsset, hiddenAsset };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /assets/:id — Hidden / Locked → 400; Timeline / Archive → 200
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /assets/:id — Hidden/Locked blocked; Timeline/Archive allowed', () => {
    it('Hidden direct-space asset → 400 for member', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      const spaceId = await freshSpace('hidden-read-neg');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);
      await setVisibility(asset.id, AssetVisibility.Hidden);

      const { status } = await request(app)
        .get(`/assets/${asset.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(400);
    });

    it('Locked direct-space asset → 400 for member', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      const spaceId = await freshSpace('locked-read-neg');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);
      await setVisibility(asset.id, AssetVisibility.Locked);

      const { status } = await request(app)
        .get(`/assets/${asset.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(400);
    });

    it('Timeline direct-space asset → 200 for member (positive control)', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      // default visibility is Timeline
      const spaceId = await freshSpace('timeline-read-pos');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);

      const { status } = await request(app)
        .get(`/assets/${asset.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(200);
    });

    it('Archive direct-space asset → 200 for member (positive control)', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      await setVisibility(asset.id, AssetVisibility.Archive);
      const spaceId = await freshSpace('archive-read-pos');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);

      const { status } = await request(app)
        .get(`/assets/${asset.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /assets/:id/original — Hidden / Locked → 400
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /assets/:id/original — Hidden/Locked blocked', () => {
    it('Hidden direct-space asset → 400', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      const spaceId = await freshSpace('hidden-original-neg');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);
      await setVisibility(asset.id, AssetVisibility.Hidden);

      const { status } = await request(app)
        .get(`/assets/${asset.id}/original`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(400);
    });

    it('Locked direct-space asset → 400', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      const spaceId = await freshSpace('locked-original-neg');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);
      await setVisibility(asset.id, AssetVisibility.Locked);

      const { status } = await request(app)
        .get(`/assets/${asset.id}/original`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(400);
    });

    it('Timeline direct-space asset → 200 (positive control)', async () => {
      const asset = await utils.createAsset(owner.accessToken);
      const spaceId = await freshSpace('timeline-original-pos');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [asset.id]);

      const { status } = await request(app)
        .get(`/assets/${asset.id}/original`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /download/info (spaceId) — Hidden / Locked absent from zip manifest
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /download/info (spaceId) — Hidden/Locked absent; Timeline/Archive present', () => {
    it('Hidden direct-space asset absent from download manifest', async () => {
      const timelineAsset = await utils.createAsset(owner.accessToken);
      const hiddenAsset = await utils.createAsset(owner.accessToken);
      await setVisibility(hiddenAsset.id, AssetVisibility.Hidden);

      const spaceId = await freshSpace('download-hidden-neg');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [timelineAsset.id, hiddenAsset.id]);

      const assetIds = await downloadInfoIds({ spaceId });

      expect(assetIds).toContain(timelineAsset.id); // Timeline present ✓
      expect(assetIds).not.toContain(hiddenAsset.id); // Hidden absent ✓
    });

    it('Locked direct-space asset absent from download manifest', async () => {
      const timelineAsset = await utils.createAsset(owner.accessToken);
      const lockedAsset = await utils.createAsset(owner.accessToken);

      const spaceId = await freshSpace('download-locked-neg');
      // add both while Timeline (the batch add rejects a pre-Locked asset), THEN lock
      await utils.addSpaceAssets(owner.accessToken, spaceId, [timelineAsset.id, lockedAsset.id]);
      await setVisibility(lockedAsset.id, AssetVisibility.Locked);

      const assetIds = await downloadInfoIds({ spaceId });

      expect(assetIds).toContain(timelineAsset.id);
      expect(assetIds).not.toContain(lockedAsset.id);
    });

    it('Archive direct-space asset present in download manifest', async () => {
      const archiveAsset = await utils.createAsset(owner.accessToken);
      await setVisibility(archiveAsset.id, AssetVisibility.Archive);

      const spaceId = await freshSpace('download-archive-pos');
      await utils.addSpaceAssets(owner.accessToken, spaceId, [archiveAsset.id]);

      const assetIds = await downloadInfoIds({ spaceId });

      expect(assetIds).toContain(archiveAsset.id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /download/info (albumId) — Hidden / Locked absent from zip manifest
  // (AlbumDownload grant via shared_space_album_user)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /download/info (albumId via space AlbumDownload grant) — Hidden/Locked absent', () => {
    it('Hidden album-linked asset absent from album download manifest', async () => {
      const timelineAsset = await utils.createAsset(owner.accessToken);
      const hiddenAsset = await utils.createAsset(owner.accessToken);
      await setVisibility(hiddenAsset.id, AssetVisibility.Hidden);

      const spaceId = await freshSpace('album-download-hidden-neg');

      const album = await utils.createAlbum(owner.accessToken, {
        albumName: 'AlbumHiddenNeg',
        assetIds: [timelineAsset.id, hiddenAsset.id],
      });

      // Link the album to the space so member gets AlbumDownload via space grant
      await request(app)
        .put(`/shared-spaces/${spaceId}/albums/${album.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      const assetIds = await downloadInfoIds({ albumId: album.id });

      expect(assetIds).toContain(timelineAsset.id);
      expect(assetIds).not.toContain(hiddenAsset.id);
    });

    it('Locked album-linked asset absent from album download manifest', async () => {
      const timelineAsset = await utils.createAsset(owner.accessToken);
      const lockedAsset = await utils.createAsset(owner.accessToken);
      await setVisibility(lockedAsset.id, AssetVisibility.Locked);

      const spaceId = await freshSpace('album-download-locked-neg');

      const album = await utils.createAlbum(owner.accessToken, {
        albumName: 'AlbumLockedNeg',
        assetIds: [timelineAsset.id, lockedAsset.id],
      });

      await request(app)
        .put(`/shared-spaces/${spaceId}/albums/${album.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      const assetIds = await downloadInfoIds({ albumId: album.id });

      expect(assetIds).toContain(timelineAsset.id);
      expect(assetIds).not.toContain(lockedAsset.id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /search/metadata (albumId via space AlbumRead grant) — Hidden/Locked absent
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /search/metadata (albumIds via space AlbumRead grant) — Hidden/Locked absent (security-1)', () => {
    it('Hidden album-linked asset absent for a Viewer (default visibility); Timeline+Archive present', async () => {
      const timelineAsset = await utils.createAsset(owner.accessToken);
      const archiveAsset = await utils.createAsset(owner.accessToken);
      await setVisibility(archiveAsset.id, AssetVisibility.Archive);
      const hiddenAsset = await utils.createAsset(owner.accessToken);

      const album = await utils.createAlbum(owner.accessToken, {
        albumName: 'SearchAlbumHiddenNeg',
        assetIds: [timelineAsset.id, archiveAsset.id, hiddenAsset.id],
      });
      // hide AFTER album-add (a pre-Hidden asset would be rejected / auto-removed from the album)
      await setVisibility(hiddenAsset.id, AssetVisibility.Hidden);

      const spaceId = await freshSpaceWithViewer('search-album-hidden-neg');
      await linkAlbum(spaceId, album.id);

      const ids = await searchAlbumIds({ albumIds: [album.id] });

      expect(ids).toContain(timelineAsset.id);
      expect(ids).toContain(archiveAsset.id);
      expect(ids).not.toContain(hiddenAsset.id);
    });

    it('Hidden album-linked asset absent even with an explicit visibility=hidden request', async () => {
      const timelineAsset = await utils.createAsset(owner.accessToken);
      const hiddenAsset = await utils.createAsset(owner.accessToken);

      const album = await utils.createAlbum(owner.accessToken, {
        albumName: 'SearchAlbumHiddenExplicit',
        assetIds: [timelineAsset.id, hiddenAsset.id],
      });
      await setVisibility(hiddenAsset.id, AssetVisibility.Hidden);

      const spaceId = await freshSpaceWithViewer('search-album-hidden-explicit');
      await linkAlbum(spaceId, album.id);

      const ids = await searchAlbumIds({ albumIds: [album.id], visibility: AssetVisibility.Hidden });

      expect(ids).not.toContain(hiddenAsset.id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /timeline/bucket (albumId) — Hidden/Locked → 400; Timeline/Archive → 200
  // ─────────────────────────────────────────────────────────────────────────────

  describe('GET /timeline/bucket (albumId via space AlbumRead grant) — Hidden/Locked rejected (security-3)', () => {
    it('albumId + visibility=hidden → 400 for a Viewer member', async () => {
      const { album } = await setupLinkedAlbum('bucket-album-hidden-neg');

      const { status } = await request(app)
        .get(`/timeline/bucket?bucketSize=month&timeBucket=1970-01-01&albumId=${album.id}&visibility=hidden`)
        .set('Authorization', `Bearer ${member.accessToken}`);

      expect(status).toBe(400);
    });

    it('albumId + visibility=locked → 400 for a Viewer member', async () => {
      const { album } = await setupLinkedAlbum('bucket-album-locked-neg');

      const { status } = await request(app)
        .get(`/timeline/bucket?bucketSize=month&timeBucket=1970-01-01&albumId=${album.id}&visibility=locked`)
        .set('Authorization', `Bearer ${member.accessToken}`);

      expect(status).toBe(400);
    });

    it('albumId (default visibility) → 200 with the Timeline asset present, Hidden absent', async () => {
      const { album, timelineAsset, hiddenAsset } = await setupLinkedAlbum('bucket-album-default-pos');
      const timeBucket = await firstAlbumBucket(album.id);

      const { status, body } = await request(app)
        .get(`/timeline/bucket?bucketSize=month&timeBucket=${timeBucket}&albumId=${album.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`);

      expect(status).toBe(200);
      const returnedIds = (body.id ?? []) as string[];
      expect(returnedIds).toContain(timelineAsset.id);
      expect(returnedIds).not.toContain(hiddenAsset.id);
    });
  });
});
