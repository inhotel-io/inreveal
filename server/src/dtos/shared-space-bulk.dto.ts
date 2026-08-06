import { createZodDto } from 'nestjs-zod';
import z from 'zod';

/**
 * Fork-local bulk request schemas. Deliberately NOT `BulkIdsDto`: that schema is
 * `z.array(z.uuidv4())` with no `.min(1)`, so an empty array would be a silent 200-with-`[]`
 * instead of the 400 we require, and it is shared with upstream endpoints so it cannot be
 * tightened in place.
 *
 * `.max(1000)` bounds a pathological payload. It is request validation, not a product limit.
 */
const BULK_IDS_MAX = 1000;

const bulkIds = z.array(z.uuidv4()).min(1).max(BULK_IDS_MAX).describe('IDs to process');

const SharedSpaceBulkAlbumIdsSchema = z.object({ ids: bulkIds }).meta({ id: 'SharedSpaceBulkAlbumIdsDto' });

const SharedSpaceBulkAlbumFolderMoveSchema = z
  .object({
    ids: bulkIds,
    folderId: z.uuidv4().nullable().describe('Destination folder ID; null moves the albums to the space root'),
  })
  .meta({ id: 'SharedSpaceBulkAlbumFolderMoveDto' });

// showInTimeline is REQUIRED. Making it optional regenerates the Dart client into three-state
// (isPresent/absent) territory — the same reason PATCH :id/albums/:albumId keeps it required.
const SharedSpaceBulkAlbumTimelineSchema = z
  .object({
    ids: bulkIds,
    showInTimeline: z.boolean().describe('Whether the albums appear in the space timeline'),
  })
  .meta({ id: 'SharedSpaceBulkAlbumTimelineDto' });

const SharedSpaceBulkFolderParentSchema = z
  .object({
    ids: bulkIds,
    parentId: z.uuidv4().nullable().describe('Destination parent folder ID; null moves the folders to the root'),
  })
  .meta({ id: 'SharedSpaceBulkFolderParentDto' });

const SharedSpaceBulkFolderIdsSchema = z.object({ ids: bulkIds }).meta({ id: 'SharedSpaceBulkFolderIdsDto' });

export class SharedSpaceBulkAlbumIdsDto extends createZodDto(SharedSpaceBulkAlbumIdsSchema) {}
export class SharedSpaceBulkAlbumFolderMoveDto extends createZodDto(SharedSpaceBulkAlbumFolderMoveSchema) {}
export class SharedSpaceBulkAlbumTimelineDto extends createZodDto(SharedSpaceBulkAlbumTimelineSchema) {}
export class SharedSpaceBulkFolderParentDto extends createZodDto(SharedSpaceBulkFolderParentSchema) {}
export class SharedSpaceBulkFolderIdsDto extends createZodDto(SharedSpaceBulkFolderIdsSchema) {}
