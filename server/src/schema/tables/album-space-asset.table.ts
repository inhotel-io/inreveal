import { CreateDateColumn, ForeignKeyColumn, Generated, Index, Table, Timestamp } from '@immich/sql-tools';
import { CreateIdColumn } from 'src/decorators';
import { AlbumTable } from 'src/schema/tables/album.table';
import { AssetTable } from 'src/schema/tables/asset.table';
import { SharedSpaceTable } from 'src/schema/tables/shared-space.table';
import { UserTable } from 'src/schema/tables/user.table';

// A cross-owner contribution: a space photo the contributor does NOT own, bookmarked into a
// space-linked album (#764). Deliberately NOT `album_asset` — it must never become a permanent
// `checkAlbumAccess` grant for the album owner. Visibility is re-derived from live space membership
// + the live album↔space link on every read (see spaceContributedAssetExists). The adder's OWN
// photos take the ordinary `album_asset` path instead. `createId` is the sync watermark for the
// per-album asset backfill (Slice 5); no update trigger — rows are immutable once created.
@Table({ name: 'album_space_asset' })
@Index({ name: 'album_space_asset_spaceId_idx', columns: ['spaceId'] })
export class AlbumSpaceAssetTable {
  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false, primary: true })
  albumId!: string;

  @ForeignKeyColumn(() => AssetTable, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false, primary: true })
  assetId!: string;

  // Provenance + tether: the space the contribution flows through. The read gate joins this to a
  // LIVE shared_space_album link and a LIVE shared_space_member row for the viewer.
  @ForeignKeyColumn(() => SharedSpaceTable, { onDelete: 'CASCADE', nullable: false, index: false })
  spaceId!: string;

  // Who contributed it (any space Editor). SET NULL so a deleted user doesn't erase the contribution.
  @ForeignKeyColumn(() => UserTable, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
  addedById!: string | null;

  @CreateDateColumn()
  addedAt!: Generated<Timestamp>;

  @CreateIdColumn({ index: true })
  createId!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
