import {
  bulkDeleteAlbumFolders,
  bulkDeleteAlbums,
  bulkMoveAlbumFolders,
  bulkSetAlbumFolder,
  bulkSetAlbumTimeline,
  bulkUnlinkAlbums,
} from '@immich/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  applyBulkResult,
  bulkDeleteAlbumFoldersAction,
  bulkDeleteAlbumsAction,
  bulkMoveAlbumFoldersAction,
  bulkSetAlbumFolderAction,
  bulkSetAlbumTimelineAction,
  bulkUnlinkAlbumsAction,
} from '$lib/utils/space-album-bulk-actions';

vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  bulkUnlinkAlbums: vi.fn(),
  bulkSetAlbumFolder: vi.fn(),
  bulkSetAlbumTimeline: vi.fn(),
  bulkMoveAlbumFolders: vi.fn(),
  bulkDeleteAlbumFolders: vi.fn(),
  bulkDeleteAlbums: vi.fn(),
}));

describe('applyBulkResult', () => {
  // S-24
  it('returns only the failed ids so the caller can keep them selected', () => {
    const r = applyBulkResult(['a', 'b', 'c'], [
      { id: 'a', success: true },
      { id: 'b', success: false, error: 'no_permission' },
      { id: 'c', success: true },
    ] as never);
    expect(r.failedIds).toEqual(['b']);
    expect(r.failedCount).toBe(1);
  });

  // S-26
  it('returns no failures when everything succeeded', () => {
    const r = applyBulkResult(['a'], [{ id: 'a', success: true }] as never);
    expect(r.failedIds).toEqual([]);
  });

  // S-25
  it('returns every id when everything failed', () => {
    const r = applyBulkResult(['a', 'b'], [
      { id: 'a', success: false, error: 'unknown' },
      { id: 'b', success: false, error: 'unknown' },
    ] as never);
    expect(r.failedIds).toEqual(['a', 'b']);
  });

  // E-19: a transport failure yields no results at all — treat every id as failed so nothing
  // is silently deselected.
  it('treats a missing result set as a total failure', () => {
    const r = applyBulkResult(['a', 'b'], []);
    expect(r.failedIds).toEqual(['a', 'b']);
  });
});

describe('bulkUnlinkAlbumsAction', () => {
  it('sends the space id and album ids to the SDK and folds a partial failure', async () => {
    vi.mocked(bulkUnlinkAlbums).mockResolvedValue([
      { id: 'a', success: true },
      { id: 'b', success: false, error: 'no_permission' },
    ] as never);

    const result = await bulkUnlinkAlbumsAction('space-1', ['a', 'b']);

    expect(bulkUnlinkAlbums).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkAlbumIdsDto: { ids: ['a', 'b'] },
    });
    // results.length is 2 here, distinct from failedCount (1) — pins failedCount to
    // failedIds.length rather than results.length.
    expect(result).toEqual({ failedIds: ['b'], failedCount: 1 });
  });

  // E-19: the wrapper itself — not just applyBulkResult — must survive a thrown request.
  it('treats a thrown request as a total failure', async () => {
    vi.mocked(bulkUnlinkAlbums).mockRejectedValue(new Error('offline'));

    const result = await bulkUnlinkAlbumsAction('space-1', ['a', 'b']);

    expect(result).toEqual({ failedIds: ['a', 'b'], failedCount: 2 });
  });
});

describe('bulkSetAlbumFolderAction', () => {
  it('sends the destination folder id', async () => {
    vi.mocked(bulkSetAlbumFolder).mockResolvedValue([{ id: 'a', success: true }] as never);

    await bulkSetAlbumFolderAction('space-1', ['a'], 'folder-1');

    expect(bulkSetAlbumFolder).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkAlbumFolderMoveDto: { ids: ['a'], folderId: 'folder-1' },
    });
  });

  it('sends null, not the space id or another sentinel, to move albums to the space root', async () => {
    vi.mocked(bulkSetAlbumFolder).mockResolvedValue([{ id: 'a', success: true }] as never);

    await bulkSetAlbumFolderAction('space-1', ['a'], null);

    expect(bulkSetAlbumFolder).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkAlbumFolderMoveDto: { ids: ['a'], folderId: null },
    });
  });

  it('treats a thrown request as a total failure', async () => {
    vi.mocked(bulkSetAlbumFolder).mockRejectedValue(new Error('offline'));

    const result = await bulkSetAlbumFolderAction('space-1', ['a', 'b'], 'folder-1');

    expect(result).toEqual({ failedIds: ['a', 'b'], failedCount: 2 });
  });
});

describe('bulkSetAlbumTimelineAction', () => {
  it('sends showInTimeline true', async () => {
    vi.mocked(bulkSetAlbumTimeline).mockResolvedValue([{ id: 'a', success: true }] as never);

    await bulkSetAlbumTimelineAction('space-1', ['a'], true);

    expect(bulkSetAlbumTimeline).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkAlbumTimelineDto: { ids: ['a'], showInTimeline: true },
    });
  });

  it('sends showInTimeline false', async () => {
    vi.mocked(bulkSetAlbumTimeline).mockResolvedValue([{ id: 'a', success: true }] as never);

    await bulkSetAlbumTimelineAction('space-1', ['a'], false);

    expect(bulkSetAlbumTimeline).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkAlbumTimelineDto: { ids: ['a'], showInTimeline: false },
    });
  });

  it('treats a thrown request as a total failure', async () => {
    vi.mocked(bulkSetAlbumTimeline).mockRejectedValue(new Error('offline'));

    const result = await bulkSetAlbumTimelineAction('space-1', ['a', 'b'], true);

    expect(result).toEqual({ failedIds: ['a', 'b'], failedCount: 2 });
  });
});

describe('bulkMoveAlbumFoldersAction', () => {
  it('sends the destination parent id', async () => {
    vi.mocked(bulkMoveAlbumFolders).mockResolvedValue([{ id: 'f1', success: true }] as never);

    await bulkMoveAlbumFoldersAction('space-1', ['f1'], 'parent-1');

    expect(bulkMoveAlbumFolders).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkFolderParentDto: { ids: ['f1'], parentId: 'parent-1' },
    });
  });

  it('sends null to move folders to the space root', async () => {
    vi.mocked(bulkMoveAlbumFolders).mockResolvedValue([{ id: 'f1', success: true }] as never);

    await bulkMoveAlbumFoldersAction('space-1', ['f1'], null);

    expect(bulkMoveAlbumFolders).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkFolderParentDto: { ids: ['f1'], parentId: null },
    });
  });

  it('treats a thrown request as a total failure', async () => {
    vi.mocked(bulkMoveAlbumFolders).mockRejectedValue(new Error('offline'));

    const result = await bulkMoveAlbumFoldersAction('space-1', ['f1', 'f2'], 'parent-1');

    expect(result).toEqual({ failedIds: ['f1', 'f2'], failedCount: 2 });
  });
});

describe('bulkDeleteAlbumFoldersAction', () => {
  it('sends the space id and folder ids and folds a partial failure', async () => {
    vi.mocked(bulkDeleteAlbumFolders).mockResolvedValue([
      { id: 'f1', success: true },
      { id: 'f2', success: false, error: 'validation' },
    ] as never);

    const result = await bulkDeleteAlbumFoldersAction('space-1', ['f1', 'f2']);

    expect(bulkDeleteAlbumFolders).toHaveBeenCalledWith({
      id: 'space-1',
      sharedSpaceBulkFolderIdsDto: { ids: ['f1', 'f2'] },
    });
    expect(result).toEqual({ failedIds: ['f2'], failedCount: 1 });
  });

  it('treats a thrown request as a total failure', async () => {
    vi.mocked(bulkDeleteAlbumFolders).mockRejectedValue(new Error('offline'));

    const result = await bulkDeleteAlbumFoldersAction('space-1', ['f1', 'f2']);

    expect(result).toEqual({ failedIds: ['f1', 'f2'], failedCount: 2 });
  });
});

describe('bulkDeleteAlbumsAction', () => {
  // Scenario 39
  it('returns exactly the failed subset on a partial failure', async () => {
    vi.mocked(bulkDeleteAlbums).mockResolvedValue([
      { id: 'a', success: true },
      { id: 'b', success: false },
    ]);

    await expect(bulkDeleteAlbumsAction('space-1', ['a', 'b'])).resolves.toEqual({
      failedIds: ['b'],
      failedCount: 1,
    });
  });

  // Scenario 40
  it('reports every id failed when the request throws', async () => {
    vi.mocked(bulkDeleteAlbums).mockRejectedValue(new Error('offline'));

    await expect(bulkDeleteAlbumsAction('space-1', ['a', 'b'])).resolves.toEqual({
      failedIds: ['a', 'b'],
      failedCount: 2,
    });
  });
});
