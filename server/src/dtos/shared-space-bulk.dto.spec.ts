import {
  SharedSpaceBulkAlbumFolderMoveDto,
  SharedSpaceBulkAlbumIdsDto,
  SharedSpaceBulkAlbumTimelineDto,
  SharedSpaceBulkFolderIdsDto,
  SharedSpaceBulkFolderParentDto,
} from 'src/dtos/shared-space-bulk.dto';
import { describe, expect, it } from 'vitest';

const uuid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);

describe('shared space bulk dtos', () => {
  // E-2: the whole reason these are fork-local instead of BulkIdsDto.
  it('rejects an empty ids array', () => {
    const result = SharedSpaceBulkAlbumIdsDto.schema.safeParse({ ids: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a single id', () => {
    const result = SharedSpaceBulkAlbumIdsDto.schema.safeParse({ ids: [uuid(1)] });
    expect(result.success).toBe(true);
  });

  it('rejects more than 1000 ids', () => {
    const ids = Array.from({ length: 1001 }, (_, i) => uuid(i % 9));
    expect(SharedSpaceBulkAlbumIdsDto.schema.safeParse({ ids }).success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(SharedSpaceBulkAlbumIdsDto.schema.safeParse({ ids: ['nope'] }).success).toBe(false);
  });

  it('requires folderId on the album folder move dto, allowing null', () => {
    expect(SharedSpaceBulkAlbumFolderMoveDto.schema.safeParse({ ids: [uuid(1)] }).success).toBe(false);
    expect(SharedSpaceBulkAlbumFolderMoveDto.schema.safeParse({ ids: [uuid(1)], folderId: null }).success).toBe(true);
  });

  // Spec §6.2: showInTimeline must be REQUIRED or the Dart client regenerates into three-state.
  it('requires showInTimeline and does not accept it as absent', () => {
    expect(SharedSpaceBulkAlbumTimelineDto.schema.safeParse({ ids: [uuid(1)] }).success).toBe(false);
    expect(SharedSpaceBulkAlbumTimelineDto.schema.safeParse({ ids: [uuid(1)], showInTimeline: true }).success).toBe(
      true,
    );
  });

  it('requires parentId on the folder parent dto, allowing null', () => {
    expect(SharedSpaceBulkFolderParentDto.schema.safeParse({ ids: [uuid(1)] }).success).toBe(false);
    expect(SharedSpaceBulkFolderParentDto.schema.safeParse({ ids: [uuid(1)], parentId: null }).success).toBe(true);
  });

  it('rejects an empty ids array on the folder ids dto', () => {
    expect(SharedSpaceBulkFolderIdsDto.schema.safeParse({ ids: [] }).success).toBe(false);
  });
});
