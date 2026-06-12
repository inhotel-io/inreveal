import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Table,
  Timestamp,
  UpdateDateColumn,
} from '@immich/sql-tools';
import { CreateIdColumn, UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { AlbumTable } from 'src/schema/tables/album.table';
import { SharedSpaceTable } from 'src/schema/tables/shared-space.table';
import { UserTable } from 'src/schema/tables/user.table';

@Table('shared_space_album')
@UpdatedAtTrigger('shared_space_album_updatedAt')
export class SharedSpaceAlbumTable {
  @ForeignKeyColumn(() => SharedSpaceTable, { onDelete: 'CASCADE', primary: true, index: false })
  spaceId!: string;

  @ForeignKeyColumn(() => AlbumTable, { onDelete: 'CASCADE', primary: true })
  albumId!: string;

  @ForeignKeyColumn(() => UserTable, { onDelete: 'SET NULL', nullable: true })
  addedById!: string | null;

  // Whether this album's photos appear in the aggregated space timeline.
  @Column({ type: 'boolean', default: true })
  showInTimeline!: Generated<boolean>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @CreateIdColumn({ index: true })
  createId!: Generated<string>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
