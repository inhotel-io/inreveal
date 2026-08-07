import {
  bulkDeleteAlbumFolders,
  bulkMoveAlbumFolders,
  bulkSetAlbumFolder,
  bulkSetAlbumTimeline,
  bulkUnlinkAlbums,
  type BulkIdResponseDto,
} from '@immich/sdk';

export type BulkActionResult = { failedIds: string[]; failedCount: number };

/**
 * Folds a bulk SDK response into "what stays selected". `results` only ever carries an entry
 * for an id the server actually processed; anything missing (never returned, or the whole array
 * is empty) is treated as a failure rather than a success, so a request that never reaches the
 * server can't silently deselect items either — see the `runBulkAction` catch below for the case
 * where the request throws before `results` even exists.
 */
export const applyBulkResult = (ids: string[], results: BulkIdResponseDto[]): BulkActionResult => {
  const succeededIds = new Set(results.filter((result) => result.success).map((result) => result.id));
  const failedIds = ids.filter((id) => !succeededIds.has(id));
  return { failedIds, failedCount: failedIds.length };
};

/**
 * Runs a bulk SDK call and folds its response through `applyBulkResult`. A thrown request
 * (offline, 500, network) never produces a `results` array at all, so `applyBulkResult` alone
 * can't cover it — this catches the throw explicitly and treats every id as failed. That is the
 * one outcome the partial-failure contract can't tolerate: silently deselecting a batch just
 * because the request never reached the server.
 */
const runBulkAction = async (
  ids: string[],
  operation: () => Promise<BulkIdResponseDto[]>,
): Promise<BulkActionResult> => {
  try {
    const results = await operation();
    return applyBulkResult(ids, results);
  } catch {
    return { failedIds: [...ids], failedCount: ids.length };
  }
};

export const bulkUnlinkAlbumsAction = (spaceId: string, ids: string[]): Promise<BulkActionResult> =>
  runBulkAction(ids, () => bulkUnlinkAlbums({ id: spaceId, sharedSpaceBulkAlbumIdsDto: { ids } }));

export const bulkSetAlbumFolderAction = (
  spaceId: string,
  ids: string[],
  folderId: string | null,
): Promise<BulkActionResult> =>
  runBulkAction(ids, () => bulkSetAlbumFolder({ id: spaceId, sharedSpaceBulkAlbumFolderMoveDto: { ids, folderId } }));

export const bulkSetAlbumTimelineAction = (
  spaceId: string,
  ids: string[],
  showInTimeline: boolean,
): Promise<BulkActionResult> =>
  runBulkAction(ids, () =>
    bulkSetAlbumTimeline({ id: spaceId, sharedSpaceBulkAlbumTimelineDto: { ids, showInTimeline } }),
  );

export const bulkMoveAlbumFoldersAction = (
  spaceId: string,
  ids: string[],
  parentId: string | null,
): Promise<BulkActionResult> =>
  runBulkAction(ids, () => bulkMoveAlbumFolders({ id: spaceId, sharedSpaceBulkFolderParentDto: { ids, parentId } }));

export const bulkDeleteAlbumFoldersAction = (spaceId: string, ids: string[]): Promise<BulkActionResult> =>
  runBulkAction(ids, () => bulkDeleteAlbumFolders({ id: spaceId, sharedSpaceBulkFolderIdsDto: { ids } }));
